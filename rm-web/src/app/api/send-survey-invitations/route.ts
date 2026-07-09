// /api/send-survey-invitations — emails each investor in a distribution their
// personalized survey link, with a bilingual invitation stamped with the
// organization + administration name (white-label: reads from the org record).
//
// Authorizes: caller has 'manage_surveys' + the 'survey' module is enabled.
// Writes nothing to survey tables (responses come from the public form route).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM_FALLBACK = 'onboarding@resend.dev';

type Body = { distributionId: string; origin: string };

function invitationHtml(opts: {
  orgName: string; orgNameAr: string;
  adminName: string; adminNameAr: string;
  surveyTitle: string; surveyTitleAr: string;
  link: string;
}): string {
  const stampEn = [opts.orgName, opts.adminName].filter(Boolean).join(' — ');
  const stampAr = [opts.orgNameAr, opts.adminNameAr].filter(Boolean).join(' — ');
  const titleEn = opts.surveyTitle || opts.surveyTitleAr || 'Survey';
  const titleAr = opts.surveyTitleAr || opts.surveyTitle || 'استبيان';

  return `
  <div style="font-family:'Times New Roman','Traditional Arabic',serif;font-size:14px;color:#1f2937;max-width:560px;margin:auto;">
    <div dir="rtl" style="text-align:right;border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-weight:bold;font-size:16px;">${stampAr}</div>
      <p style="margin:12px 0;">${titleAr}</p>
      <p style="margin:12px 0;line-height:1.8;">يسعدنا مشاركتكم في تعبئة الاستبيان من خلال الرابط أدناه، والذي سيكون له أثر إيجابي في تحسين الخدمات التي نقدمها. لفتح الاستبيان، يُرجى استخدام الرابط الخاص بكم أدناه.</p>
      <p style="margin:12px 0;"><a href="${opts.link}" style="color:#4f46e5;">فتح الاستبيان</a></p>
    </div>
    <div dir="ltr" style="text-align:left;">
      <div style="font-weight:bold;font-size:16px;">${stampEn}</div>
      <p style="margin:12px 0;">${titleEn}</p>
      <p style="margin:12px 0;line-height:1.6;">We are pleased to invite you to complete the survey through the link below, which will have a positive impact on improving the services we provide. To open the survey, please use your personal link below.</p>
      <p style="margin:12px 0;"><a href="${opts.link}" style="color:#4f46e5;">Open the survey</a></p>
      <p style="margin:12px 0;font-size:12px;color:#6b7280;word-break:break-all;">${opts.link}</p>
    </div>
  </div>`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const { data: meRow } = await supabase
    .from('users').select('id, organization_id, permissions, email').eq('id', authUser.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const me = meRow as any;
  if (!me) return NextResponse.json({ error: 'no_user_row' }, { status: 403 });
  if (!(me.permissions ?? []).includes('manage_surveys')) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }
  const orgId = me.organization_id;

  // gate: survey module enabled
  const { data: gate } = await supabase
    .from('org_module_settings').select('enabled')
    .eq('organization_id', orgId).eq('module_key', 'survey').maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(gate as any)?.enabled) return NextResponse.json({ error: 'module_disabled' }, { status: 403 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const { distributionId, origin } = body;
  if (!distributionId || !origin) return NextResponse.json({ error: 'missing_params' }, { status: 400 });

  const resendKey = process.env.RESEND_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!resendKey) return NextResponse.json({ error: 'resend_not_configured' }, { status: 500 });
  if (!serviceKey) return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 });

  const resend = new Resend(resendKey);
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // distribution → survey
  const { data: dist } = await admin.from('survey_distributions').select('survey_id, organization_id').eq('id', distributionId).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!dist || (dist as any).organization_id !== orgId) return NextResponse.json({ error: 'distribution_not_found' }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const surveyId = (dist as any).survey_id;

  const { data: survey } = await admin.from('surveys').select('title, title_ar').eq('id', surveyId).maybeSingle();

  // org + administration stamp
  const { data: org } = await admin.from('organizations').select('name, name_ar').eq('id', orgId).maybeSingle();
  // the sender's department = administration/deputyship stamp
  const { data: membership } = await admin
    .from('users').select('departments!users_department_id_fkey(name, name_ar)').eq('id', me.id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dept = (membership as any)?.departments;

  // tokens + investor emails
  const { data: tokens } = await admin
    .from('survey_tokens')
    .select('token, investors(company_name, company_name_ar, email)')
    .eq('distribution_id', distributionId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recipients = (tokens ?? []).filter((t: any) => (t.investors?.email ?? '').trim());
  if (recipients.length === 0) return NextResponse.json({ error: 'no_emailable_recipients' }, { status: 400 });

  let success = 0, fail = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of recipients as any[]) {
    const link = `${origin}/survey/${t.token}`;
    const html = invitationHtml({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orgName: (org as any)?.name ?? '', orgNameAr: (org as any)?.name_ar ?? '',
      adminName: dept?.name ?? '', adminNameAr: dept?.name_ar ?? '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      surveyTitle: (survey as any)?.title ?? '', surveyTitleAr: (survey as any)?.title_ar ?? '',
      link,
    });
    const subjectEn = (survey as any)?.title || 'Survey invitation';
    try {
      const r = await resend.emails.send({
        from: FROM_FALLBACK,
        to: t.investors.email,
        replyTo: me.email || undefined,
        subject: `${subjectEn} — دعوة لتعبئة استبيان`,
        html,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((r as any)?.error) fail++; else success++;
    } catch { fail++; }
  }

  return NextResponse.json({ ok: true, success, fail, total: recipients.length });
}
