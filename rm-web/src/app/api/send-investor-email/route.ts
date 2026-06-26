// /api/send-investor-email — bulk personalized send to investors via Resend.
//
// Flow:
//   1. Authorize: caller authenticated + has 'send_investor_email' permission.
//   2. Gate: org's 'emails' module must be enabled (entitlements).
//   3. Insert an email_batches row (template stored once for audit re-merge).
//   4. For each recipient: merge fields → send via Resend → write a sent_emails row.
//   5. Update batch counts, return summary.
//
// Writes use the service role (bypasses RLS); the route itself is the gate.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM_FALLBACK = 'onboarding@resend.dev'; // sandbox sender until MOH domain verified

type Body = {
  investorIds: string[];
  subjectTemplate: string;
  bodyTemplate: string;       // HTML
  cc?: string;
  attachmentPaths?: string[]; // storage paths in the 'attachments' bucket
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeFields(template: string, inv: any): string {
  const map: Record<string, string> = {
    '{representative_name}': inv.representative_name ?? '',
    '{representative_name_ar}': inv.representative_name_ar ?? '',
    '{company_name}': inv.company_name ?? '',
    '{company_name_ar}': inv.company_name_ar ?? '',
    '{position}': inv.position ?? '',
    '{position_ar}': inv.position_ar ?? '',
    '{email}': inv.email ?? '',
  };
  let out = template;
  for (const [token, val] of Object.entries(map)) {
    out = out.split(token).join(val);
  }
  return out;
}

export async function POST(req: NextRequest) {
  // 1. caller
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const { data: meRow } = await supabase
    .from('users').select('id, organization_id, permissions, name, email').eq('id', authUser.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const me = meRow as any;
  if (!me) return NextResponse.json({ error: 'no_user_row' }, { status: 403 });

  const perms: string[] = me.permissions ?? [];
  if (!perms.includes('send_investor_email')) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }
  const orgId = me.organization_id;

  // 2. gate — emails module must be enabled
  const { data: gate } = await supabase
    .from('org_module_settings').select('enabled')
    .eq('organization_id', orgId).eq('module_key', 'emails').maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(gate as any)?.enabled) {
    return NextResponse.json({ error: 'module_disabled' }, { status: 403 });
  }

  // inputs
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const { investorIds, subjectTemplate, bodyTemplate } = body;
  const cc = (body.cc ?? '').trim();
  const attachmentPaths = Array.isArray(body.attachmentPaths) ? body.attachmentPaths : [];
  if (!Array.isArray(investorIds) || investorIds.length === 0) {
    return NextResponse.json({ error: 'no_recipients' }, { status: 400 });
  }
  if (!subjectTemplate?.trim() || !bodyTemplate?.trim()) {
    return NextResponse.json({ error: 'missing_content' }, { status: 400 });
  }

  // env
  const resendKey = process.env.RESEND_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!resendKey) return NextResponse.json({ error: 'resend_not_configured' }, { status: 500 });
  if (!serviceKey) return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 });

  const resend = new Resend(resendKey);
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const replyTo = me.email || '';

  // fetch investors (only those with an email)
  const { data: investors, error: invErr } = await admin
    .from('investors')
    .select('id, representative_name, representative_name_ar, company_name, company_name_ar, position, position_ar, email')
    .in('id', investorIds)
    .is('deleted_at', null);
  if (invErr) return NextResponse.json({ error: 'investor_fetch_failed', message: invErr.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recipients = (investors ?? []).filter((i: any) => (i.email ?? '').trim());
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'no_emailable_recipients' }, { status: 400 });
  }

  // resolve signed download URLs for attachments (so Resend can fetch + attach)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachments: { filename: string; path: string }[] = [];
  for (const p of attachmentPaths) {
    const fname = p.split('/').pop() || 'attachment';
    attachments.push({ filename: fname.replace(/^[0-9a-f-]+-/, ''), path: p });
  }
  // build Resend attachment objects via signed URLs
  const resendAttachments: { filename: string; content: string }[] = [];
  for (const a of attachments) {
    const { data: signed } = await admin.storage.from('attachments').createSignedUrl(a.path, 300);
    if (signed?.signedUrl) {
      try {
        const res = await fetch(signed.signedUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        resendAttachments.push({ filename: a.filename, content: buf.toString('base64') });
      } catch { /* skip an attachment that fails to fetch */ }
    }
  }

  // 3. batch row
  const { data: batchRow, error: batchErr } = await admin.from('email_batches').insert({
    subject_template: subjectTemplate,
    body_template: bodyTemplate,
    cc,
    reply_to: replyTo,
    attachment_paths: attachmentPaths,
    recipient_count: recipients.length,
    sent_by_id: me.id,
    organization_id: orgId,
  }).select('id').single();
  if (batchErr) return NextResponse.json({ error: 'batch_insert_failed', message: batchErr.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batchId = (batchRow as any).id;

  // 4. per-recipient send
  let success = 0, fail = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const inv of recipients as any[]) {
    const subject = mergeFields(subjectTemplate, inv);
    const html = mergeFields(bodyTemplate, inv);
    let status = 'sent';
    let errMsg: string | null = null;
    try {
      const sendRes = await resend.emails.send({
        from: FROM_FALLBACK,
        to: inv.email,
        replyTo: replyTo || undefined,
        cc: cc ? cc.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        subject,
        html,
        attachments: resendAttachments.length ? resendAttachments : undefined,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((sendRes as any)?.error) { status = 'failed'; errMsg = String((sendRes as any).error?.message ?? 'send_error'); }
    } catch (e) {
      status = 'failed';
      errMsg = e instanceof Error ? e.message : 'send_exception';
    }
    if (status === 'sent') success++; else fail++;

    await admin.from('sent_emails').insert({
      batch_id: batchId,
      investor_id: inv.id,
      recipient_email: inv.email,
      recipient_name: inv.representative_name ?? '',
      status,
      error: errMsg,
      organization_id: orgId,
    });
  }

  // 5. update counts
  await admin.from('email_batches').update({ success_count: success, fail_count: fail }).eq('id', batchId);

  return NextResponse.json({ ok: true, batchId, recipientCount: recipients.length, success, fail });
}
