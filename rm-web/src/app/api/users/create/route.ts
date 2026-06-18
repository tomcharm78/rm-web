// /api/users/create — server-side member creation.
//
// Creating a login-capable member needs TWO things the browser can't do:
//   1. Create an auth account (requires the service-role key).
//   2. Be trusted to enforce who-can-create-whom.
//
// Flow:
//   1. Identify the caller from their session cookie (server client).
//   2. Authorize: super_admin -> admin/rm/arm; admin -> only rm/arm under self.
//   3. Create the auth account with a temp password (service-role admin client).
//   4. Insert the public.users row under the CALLER's session so RLS backstops
//      the authorization (defense in depth) — force_password_change = true.
//   5. Set domains (service role, since the member is already authorized).
//   6. Roll back the auth account (and row) if any step fails — all-or-nothing.
//   7. Return the temp credentials for the admin to relay.
//
// Audit is automatic via DB triggers (trg_audit_users / trg_audit_user_semantic).
// Credential email via SMTP is parked — for now the temp password is returned
// to the creating admin to hand over.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import {
  ALL_PERMISSIONS,
  ADMIN_ASSIGNABLE_ROLES,
  SUPER_ADMIN_ASSIGNABLE_ROLES,
} from '@/lib/users/constants';
import type { UserRole, UserPermission } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateBody = {
  name?: string;
  nameAr?: string;
  email?: string;
  role?: UserRole;
  permissions?: UserPermission[];
  adminId?: string | null;
  domainIds?: string[];
  avatar?: string | null;
  isActive?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strong-enough temp password: upper + lower + digit + symbol, ~14 chars.
function generateTempPassword(): string {
  const core = randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  return `Rm${core}9!`;
}

export async function POST(req: NextRequest) {
  // 1. Identify caller
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const { data: caller, error: callerErr } = await supabase
    .from('users')
    .select('id, role, organization_id')
    .eq('id', authUser.id)
    .single();
  if (callerErr || !caller) {
    return NextResponse.json({ error: 'caller_lookup_failed' }, { status: 500 });
  }

  const callerRole = caller.role as UserRole;
  if (callerRole !== 'super_admin' && callerRole !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2. Parse + validate body
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const name = body.name?.trim();
  const nameAr = body.nameAr?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role;

  if (!name || !nameAr || !email || !role) {
    return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  // 3. Authorize the target role
  const assignable = (callerRole === 'super_admin'
    ? SUPER_ADMIN_ASSIGNABLE_ROLES
    : ADMIN_ASSIGNABLE_ROLES) as readonly UserRole[];
  if (!assignable.includes(role)) {
    return NextResponse.json({ error: 'role_not_allowed' }, { status: 403 });
  }

  // admin -> member always reports to the admin; super_admin -> as provided.
  const finalAdminId =
    callerRole === 'admin' ? caller.id : (body.adminId ?? null);

  // super_admin role is fully privileged + locked; everyone else uses the
  // provided toggles (filtered to valid enum values).
  const permissions: UserPermission[] =
    role === 'super_admin'
      ? [...ALL_PERMISSIONS]
      : (body.permissions ?? []).filter((p) =>
          (ALL_PERMISSIONS as readonly string[]).includes(p)
        );

  const domainIds = Array.isArray(body.domainIds) ? body.domainIds : [];
  const isActive = body.isActive ?? true;
  const avatar = body.avatar ?? null;

  // 4. Service-role admin client
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error('[users/create] SUPABASE_SERVICE_ROLE_KEY missing');
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 5. Create the auth account
  const tempPassword = generateTempPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name, name_ar: nameAr },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'auth_create_failed';
    const exists = /already|registered|exists/i.test(msg);
    console.error('[users/create] auth createUser failed:', msg);
    return NextResponse.json(
      { error: exists ? 'email_exists' : 'auth_create_failed', message: msg },
      { status: exists ? 409 : 500 }
    );
  }
  const newUserId = created.user.id;
  // 5b. Resolve department placement (admins only; rm/arm inherit via trigger)
  let finalDepartmentId: string | null = null;
  if (role === 'admin') {
    if (body.departmentId) {
      finalDepartmentId = body.departmentId;
    } else if (body.newDepartmentName?.trim()) {
      const { data: newDept, error: deptErr } = await admin
        .from('departments')
        .insert({
          name: body.newDepartmentName.trim(),
          name_ar: (body.newDepartmentNameAr ?? body.newDepartmentName).trim(),
          organization_id: caller.organization_id,
          is_active: true,
        })
        .select('id')
        .single();
      if (deptErr || !newDept) {
        console.error('[users/create] department insert failed:', deptErr);
        await admin.auth.admin.deleteUser(newUserId);
        return NextResponse.json(
          { error: 'department_create_failed', message: deptErr?.message },
          { status: 400 }
        );
      }
      finalDepartmentId = newDept.id;
    } else {
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: 'department_required' }, { status: 400 });
    }
  }

  // 6. Insert the users row under the CALLER's session (RLS backstop)
  const { error: insErr } = await supabase.from('users').insert({
    id: newUserId,
    name,
    name_ar: nameAr,
    email,
    role,
    permissions,
    admin_id: finalAdminId,
    department_id: finalDepartmentId,
    avatar,
    is_active: isActive,
    force_password_change: true,
    organization_id: caller.organization_id,
  });
  if (insErr) {
    console.error('[users/create] users insert failed, rolling back auth user:', insErr);
    await admin.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { error: 'user_insert_failed', message: insErr.message },
      { status: 400 }
    );
  }

  // 7. Domains (service role — member is already authorized)
  if (domainIds.length > 0) {
    const { error: domErr } = await admin
      .from('user_domains')
      .insert(domainIds.map((domain_id) => ({ user_id: newUserId, domain_id })));
    if (domErr) {
      console.error('[users/create] domain insert failed, rolling back:', domErr);
      await admin.from('users').delete().eq('id', newUserId);
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: 'domain_insert_failed', message: domErr.message },
        { status: 400 }
      );
    }
  }

  // 8. Success — return temp credentials for the admin to relay
  return NextResponse.json({
    ok: true,
    userId: newUserId,
    email,
    name,
    tempPassword,
  });
}