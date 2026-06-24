// /api/stakeholder-access/generate — admin/super grants an external stakeholder
// access to ONE challenge's journal.
//
// Flow:
//   1. Identify + authorize the caller (admin or super_admin only).
//   2. Resolve the contact (must have an email — the login identity).
//   3. Reuse-or-create a 'stakeholder' auth account by that email:
//        - if no account: create one (temp password + force_password_change).
//        - if an account exists AND it is a stakeholder: reuse it.
//        - if an account exists but is NOT a stakeholder (staff email collision):
//          refuse — never attach challenge access to a staff login.
//   4. Insert a challenge_stakeholder_access row (token + 90-day expiry).
//   5. Return: login URL, username (email), tempPassword (only when newly created),
//      and the access row (expiry).
//
// Authorization is enforced again by RLS (csa_insert = managers only) as backstop.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTempPassword(): string {
  const core = randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  return `Rm${core}9!`;
}
function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function POST(req: NextRequest) {
  // 1. Identify caller
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const { data: callerRow } = await supabase
    .from('users').select('role, organization_id').eq('id', authUser.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caller = callerRow as any;
  if (!caller || (caller.role !== 'admin' && caller.role !== 'super_admin')) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 });
  }
  const orgId = caller.organization_id;

  // 2. Inputs + resolve the contact
  let body: { challengeId?: string; contactId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const challengeId = body.challengeId;
  const contactId = body.contactId;
  if (!challengeId || !contactId) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const { data: contactRow } = await supabase
    .from('contacts').select('name, name_ar, email').eq('id', contactId).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contact = contactRow as any;
  if (!contact) {
    return NextResponse.json({ error: 'contact_not_found' }, { status: 404 });
  }
  const email = (contact.email ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'contact_email_required' }, { status: 400 });
  }

  // 3. Service-role admin client
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('[stakeholder-access/generate] SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // reuse-or-create the stakeholder account by email
  let stakeholderUserId: string;
  let tempPassword: string | null = null;

  // does a users row already exist for this email?
  const { data: existing } = await admin
    .from('users').select('id, role').eq('email', email).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingUser = existing as any;

  if (existingUser) {
    if (existingUser.role !== 'stakeholder') {
      // email belongs to a staff/investor account — never attach challenge access
      return NextResponse.json({ error: 'email_belongs_to_staff' }, { status: 409 });
    }
    stakeholderUserId = existingUser.id;
  } else {
    // create the auth account
    tempPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: contact.name, name_ar: contact.name_ar ?? '' },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message ?? 'auth_create_failed';
      console.error('[stakeholder-access/generate] createUser failed:', msg);
      return NextResponse.json({ error: 'auth_create_failed', message: msg }, { status: 500 });
    }
    stakeholderUserId = created.user.id;

    // insert the public.users row (stakeholder, no department/admin_id, force change)
    const { error: rowErr } = await admin.from('users').insert({
      id: stakeholderUserId,
      email,
      name: contact.name,
      name_ar: contact.name_ar ?? '',
      role: 'stakeholder',
      organization_id: orgId,
      is_active: true,
      force_password_change: true,
    });
    if (rowErr) {
      // roll back the auth account so we don't strand a half-created user
      await admin.auth.admin.deleteUser(stakeholderUserId);
      console.error('[stakeholder-access/generate] users insert failed:', rowErr.message);
      return NextResponse.json({ error: 'user_row_failed', message: rowErr.message }, { status: 500 });
    }
  }

  // 4. supersede any existing active access for this pair, then insert a fresh row
  await admin.from('challenge_stakeholder_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('challenge_id', challengeId)
    .eq('stakeholder_user_id', stakeholderUserId)
    .is('revoked_at', null);

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: accessRow, error: accessErr } = await admin
    .from('challenge_stakeholder_access')
    .insert({
      challenge_id: challengeId,
      stakeholder_user_id: stakeholderUserId,
      token,
      created_by_id: authUser.id,
      organization_id: orgId,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single();
  if (accessErr) {
    console.error('[stakeholder-access/generate] access insert failed:', accessErr.message);
    return NextResponse.json({ error: 'access_insert_failed', message: accessErr.message }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  return NextResponse.json({
    ok: true,
    loginUrl: `${origin}/login`,
    username: email,
    tempPassword,                 // null when reusing an existing account
    isNewAccount: tempPassword !== null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessId: (accessRow as any).id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expiresAt: (accessRow as any).expires_at,
  });
}
