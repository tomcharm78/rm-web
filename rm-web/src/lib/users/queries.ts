// Members (users) data layer. UI never calls supabase.from('users') directly.
// Reuses User + dbUserToUser from '@/types'. Audit and updated_at are handled by
// DB triggers (trg_audit_users, trg_audit_user_semantic, trg_users_updated_at),
// so there is NO manual audit logging here. RLS enforces who-can-manage-whom:
// super_admin = all; admin = own rm/arm team (admin_id = self).
//
// Member CREATION is not here — it needs a server route (auth account + service
// role), built in Batch 2. This file covers read + update + lifecycle.

import { createClient } from '@/lib/supabase/client';
import { dbUserToUser, type User } from '@/types';
import type { DbUser } from '@/types/database';
import type { MemberFormInput } from '@/lib/users/constants';

export type Member = User & { domainIds: string[] };

export type DomainOption = { id: string; slug: string; name: string; nameAr: string; icon: string };
export type AdminOption = { id: string; name: string; nameAr: string };

type MemberRow = DbUser & { user_domains: { domain_id: string }[] | null };

function rowToMember(row: MemberRow): Member {
  return {
    ...dbUserToUser(row),
    isHigherManagement: (row as { is_higher_management?: boolean }).is_higher_management ?? false,
    domainIds: (row.user_domains ?? []).map((d) => d.domain_id),
  };
}

// ---------------------------------------------------------------- READ
export async function listMembers(): Promise<Member[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('users')
    .select('*, user_domains(domain_id)')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) { console.error('[listMembers] error:', error); throw new Error(error.message); }
  return (data as MemberRow[]).map(rowToMember);
}

export async function getMember(id: string): Promise<Member | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('users')
    .select('*, user_domains(domain_id)')
    .eq('id', id)
    .maybeSingle();
  if (error) { console.error('[getMember] error:', error); throw new Error(error.message); }
  return data ? rowToMember(data as MemberRow) : null;
}

export async function listDomains(): Promise<DomainOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('domains')
    .select('id, slug, name, name_ar, icon')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) { console.error('[listDomains] error:', error); throw new Error(error.message); }
  return (data as { id: string; slug: string; name: string; name_ar: string; icon: string }[])
    .map((d) => ({ id: d.id, slug: d.slug, name: d.name, nameAr: d.name_ar, icon: d.icon }));
}

// Admins a member can report to (admin_id picker).
export async function listAssignableSupers(): Promise<AdminOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, name_ar')
    .eq('role', 'super_admin')
    .eq('is_higher_management', false)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((u) => ({
    id: u.id as string,
    name: u.name as string,
    nameAr: (u.name_ar as string) ?? '',
  }));
}

// The Higher Management placeholder — top reporting anchor for super-admins.
export async function listHigherManagement(): Promise<AdminOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, name_ar')
    .eq('is_higher_management', true)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((u) => ({
    id: u.id as string,
    name: u.name as string,
    nameAr: (u.name_ar as string) ?? '',
  }));
}

// ---------------------------------------------------------------- WRITE
// Replace a member's domain assignments (delete-all + insert-set).
export async function setUserDomains(userId: string, domainIds: string[]): Promise<void> {
  const supabase = createClient();
  const { error: delErr } = await supabase.from('user_domains').delete().eq('user_id', userId);
  if (delErr) { console.error('[setUserDomains] delete:', delErr); throw new Error(delErr.message); }
  if (domainIds.length > 0) {
    const { error: insErr } = await supabase
      .from('user_domains')
      .insert(domainIds.map((domain_id) => ({ user_id: userId, domain_id })));
    if (insErr) { console.error('[setUserDomains] insert:', insErr); throw new Error(insErr.message); }
  }
}

// Update a member's row + domains. Email is the login identity and is NOT
// changed here (set at creation). Role/permission changes are RLS-checked.
export async function updateMember(id: string, input: MemberFormInput): Promise<Member> {
  const supabase = createClient();
  const { error } = await supabase
    .from('users')
    .update({
      name: input.name.trim(),
      name_ar: input.nameAr.trim(),
      role: input.role,
      permissions: input.permissions,
      admin_id: input.adminId,
      avatar: input.avatar,
      is_active: input.isActive,
    })
    .eq('id', id);
  if (error) { console.error('[updateMember] error:', error); throw new Error(error.message); }
  await setUserDomains(id, input.domainIds);
  const member = await getMember(id);
  if (!member) throw new Error('member_reload_failed');
  return member;
}

export async function deactivateMember(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('users').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function reactivateMember(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('users').update({ is_active: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Soft delete + restore — super_admin only (enforced by RLS users_super_all).
export async function softDeleteMember(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restoreMember(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('users').update({ deleted_at: null }).eq('id', id);
  if (error) throw new Error(error.message);
}