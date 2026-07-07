import { createClient } from '@/lib/supabase/client';
import {
  type ApprovalRequest, type ApprovalRequestRow, type ApprovalStatus,
  dbApprovalToApproval,
} from '@/types/approval';

export type ApproverOption = { id: string; name: string; nameAr: string };

// ---------------------------------------------------------------------------
// Approver dropdown — hierarchy + territory scoped.
// The requester may send UP their own chain only:
//   - their own direct manager (users.admin_id), if any
//   - active super-admins (excluding the Higher Management anchor)
// Never sideways to another department's admin.
// ---------------------------------------------------------------------------
export async function listApproverOptions(): Promise<ApproverOption[]> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];

  // my own admin
  const { data: me } = await supabase.from('users').select('admin_id').eq('id', uid).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myAdminId = (me as any)?.admin_id ?? null;

  const ids = new Set<string>();
  if (myAdminId) ids.add(myAdminId);

  // active super-admins (not the Higher Management anchor)
  const { data: supers } = await supabase
    .from('users')
    .select('id, name, name_ar')
    .eq('role', 'super_admin')
    .eq('is_higher_management', false)
    .eq('is_active', true)
    .is('deleted_at', null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const superRows = (supers ?? []) as any[];
  for (const s of superRows) ids.add(s.id);

  // never route to self
  ids.delete(uid);
  if (ids.size === 0) return [];

  // fetch names for the full set
  const { data: people } = await supabase
    .from('users')
    .select('id, name, name_ar')
    .in('id', Array.from(ids))
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((people ?? []) as any[]).map((u) => ({ id: u.id, name: u.name, nameAr: u.name_ar ?? '' }));
}

// ---------------------------------------------------------------------------
// Create a new approval request (self as requester). status forced 'pending'.
// organization_id comes from the requester's own row.
// ---------------------------------------------------------------------------
export async function createApprovalRequest(input: {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  approverId: string;
}): Promise<ApprovalRequest> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('not_authenticated');
  if (!input.title.trim()) throw new Error('title_required');
  if (!input.approverId) throw new Error('approver_required');

  const { data: me } = await supabase.from('users').select('organization_id').eq('id', uid).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (me as any)?.organization_id;
  if (!orgId) throw new Error('org_lookup_failed');

  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      title: input.title.trim(),
      title_ar: input.titleAr.trim(),
      description: input.description.trim(),
      description_ar: input.descriptionAr.trim(),
      requester_id: uid,
      approver_id: input.approverId,
      status: 'pending',
      organization_id: orgId,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return dbApprovalToApproval(data as ApprovalRequestRow);
}

// ---------------------------------------------------------------------------
// Decide — approve or reject, with a comment. Only the named approver or a
// super can do this (RLS enforces); guarded to pending requests.
// ---------------------------------------------------------------------------
export async function decideApprovalRequest(
  id: string,
  decision: 'approved' | 'rejected',
  comment: string,
): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('not_authenticated');
  if (decision === 'rejected' && !comment.trim()) throw new Error('comment_required_on_reject');

  const { error } = await supabase
    .from('approval_requests')
    .update({
      status: decision,
      decision_comment: comment.trim() || null,
      decided_at: new Date().toISOString(),
      decided_by_id: uid,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Enrich a set of approval rows with requester + approver names (one lookup).
// ---------------------------------------------------------------------------
async function enrichNames(rows: ApprovalRequest[]): Promise<ApprovalRequest[]> {
  if (rows.length === 0) return rows;
  const supabase = createClient();
  const ids = Array.from(new Set(rows.flatMap((r) => [r.requesterId, r.approverId])));
  const { data: users } = await supabase.from('users').select('id, name, name_ar').in('id', ids);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameMap = new Map<string, { name: string; nameAr: string }>(((users ?? []) as any[]).map((u) => [u.id, { name: u.name, nameAr: u.name_ar ?? '' }]));
  return rows.map((r) => ({
    ...r,
    requesterName: nameMap.get(r.requesterId)?.name ?? '—',
    approverName: nameMap.get(r.approverId)?.name ?? '—',
  }));
}

// ---------------------------------------------------------------------------
// Inbox — requests awaiting / decided by ME as approver, filtered by status.
// RLS already limits to rows where I'm the approver (or super sees all).
// ---------------------------------------------------------------------------
export async function listApprovalsForApprover(status: ApprovalStatus): Promise<ApprovalRequest[]> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('approver_id', uid)
    .eq('status', status)
    .is('deleted_at', null)
    .order('created_at', { ascending: status === 'pending' }); // pending: oldest first (FIFO)
  if (error) throw new Error(error.message);
  const rows = (data as ApprovalRequestRow[]).map(dbApprovalToApproval);
  return enrichNames(rows);
}

// ---------------------------------------------------------------------------
// My submitted requests (as initiator), all statuses, newest first.
// ---------------------------------------------------------------------------
export async function listMyApprovalRequests(): Promise<ApprovalRequest[]> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('requester_id', uid)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data as ApprovalRequestRow[]).map(dbApprovalToApproval);
  return enrichNames(rows);
}

// ---------------------------------------------------------------------------
// Pending count awaiting me as approver (for the dashboard feed + nav badge).
// ---------------------------------------------------------------------------
export async function getPendingApprovalsCount(): Promise<number> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return 0;
  const { count } = await supabase
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('approver_id', uid)
    .eq('status', 'pending')
    .is('deleted_at', null);
  return count ?? 0;
}
// ---------------------------------------------------------------------------
// Resubmit a REJECTED request (initiator only): optionally edit title/context,
// reset to pending, clear the prior decision → re-notifies approver via trigger.
// ---------------------------------------------------------------------------
export async function resubmitApprovalRequest(id: string, title: string, description: string): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('not_authenticated');
  if (!title.trim()) throw new Error('title_required');
  const { error } = await supabase
    .from('approval_requests')
    .update({
      title: title.trim(),
      description: description.trim(),
      status: 'pending',
      decision_comment: null,
      decided_at: null,
      decided_by_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('requester_id', uid)
    .eq('status', 'rejected');
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Soft-delete own request (initiator only, not once approved).
// ---------------------------------------------------------------------------
export async function deleteApprovalRequest(id: string): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('not_authenticated');
  const { error } = await supabase
    .from('approval_requests')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('requester_id', uid)
    .neq('status', 'approved');
  if (error) throw new Error(error.message);
}
