// TENANT PROVISIONING endpoint.
//
// POST /api/provision — stands up a new deputyship in one call:
//   1. create the Auth account for its first super_admin
//   2. run provision_deputyship() (org + users row + all modules)
//   3. send the admin a set-password / invite link
//
// Triggered manually today (an internal tool / button). Later this is what a
// PAYMENT WEBHOOK calls once payment succeeds — the flow is the same, only the
// caller changes.
//
// SECURITY: this uses the service-role key (full access). For now it is guarded
// by a shared secret in the PROVISION_SECRET env var — the caller must send it.
// When payment wiring lands, the webhook's signature check replaces this guard.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type Body = {
  orgName: string;
  orgNameAr: string;
  adminEmail: string;
  adminName: string;
  adminNameAr: string;
  slug?: string;         // optional — derived from orgName if absent
};

// name -> url-safe slug matching the organizations_slug_format check (^[a-z0-9-]+$)
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // non-alnum -> hyphen
    .replace(/^-+|-+$/g, '')       // trim hyphens
    .slice(0, 60) || 'org';
}

export async function POST(req: NextRequest) {
  // --- guard -----------------------------------------------------------------
  const provided = req.headers.get('x-provision-secret');
  const expected = process.env.PROVISION_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { orgName, orgNameAr, adminEmail, adminName, adminNameAr } = body;
  if (!orgName || !orgNameAr || !adminEmail || !adminName || !adminNameAr) {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
  }

  const slug = body.slug ? slugify(body.slug) : slugify(orgName);
  const admin = createAdminClient();

  // --- 1. create the Auth account -------------------------------------------
  // We create the user WITHOUT a password and send an invite/recovery link so
  // they set their own. email_confirm=true so they can use the link immediately.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
    user_metadata: { name: adminName, name_ar: adminNameAr },
  });
  if (authErr || !created?.user) {
    return NextResponse.json(
      { error: 'auth_user_failed', detail: authErr?.message },
      { status: 400 }
    );
  }
  const adminId = created.user.id;

  // --- 2. provision the tenant (org + users row + modules) -------------------
  const { data: orgId, error: provErr } = await admin.rpc('provision_deputyship', {
    p_org_name: orgName,
    p_org_name_ar: orgNameAr,
    p_slug: slug,
    p_admin_id: adminId,
    p_admin_email: adminEmail,
    p_admin_name: adminName,
    p_admin_name_ar: adminNameAr,
  });

  if (provErr) {
    // Roll back the orphaned Auth user so a retry with the same email works.
    await admin.auth.admin.deleteUser(adminId).catch(() => {});
    return NextResponse.json(
      { error: 'provision_failed', detail: provErr.message },
      { status: 400 }
    );
  }

  // --- 3. send the set-password link ----------------------------------------
  // A recovery link doubles as "set your first password". Non-fatal if it fails
  // — the tenant exists; the admin can use "forgot password" to get another.
  let inviteSent = true;
  const { error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: adminEmail,
  });
  if (linkErr) inviteSent = false;

  return NextResponse.json({
    ok: true,
    organizationId: orgId,
    adminId,
    slug,
    inviteSent,
  });
}
