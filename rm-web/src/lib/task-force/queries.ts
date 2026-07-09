import { createClient } from '@/lib/supabase/client';
import type { TaskForceRequest, TaskForceBorrow } from '@/types/task-force';

async function uid(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRequest(r: any): TaskForceRequest {
  return {
    id: r.id, taskId: r.task_id, subtaskId: r.subtask_id, requestedBy: r.requested_by,
    requestNote: r.request_note ?? '', managingAdminId: r.managing_admin_id,
    admin1Status: r.admin1_status, admin1RejectedReason: r.admin1_rejected_reason,
    status: r.status, createdAt: r.created_at,
    taskTitle: r.tasks?.title, taskTitleAr: r.tasks?.title_ar,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBorrow(b: any): TaskForceBorrow {
  const r = b.task_force_requests;
  return {
    id: b.id, requestId: b.request_id, toAdminId: b.to_admin_id, toDepartmentId: b.to_department_id,
    status: b.status, assignedMemberId: b.assigned_member_id, rejectedReason: b.rejected_reason,
    createdAt: b.created_at,
    requestNote: r?.request_note ?? '', requestedBy: r?.requested_by, subtaskId: r?.subtask_id,
  };
}

// ============ RM/ARM (the lead) ============
export async function requestTaskForce(taskId: string, subtaskId: string, requestNote: string): Promise<void> {
  const supabase = createClient();
  const me = await uid();
  if (!me) throw new Error('not authenticated');
  const { data: meRow, error: meErr } = await supabase
    .from('users').select('admin_id').eq('id', me).single();
  if (meErr) throw new Error(meErr.message);
  const managingAdminId = (meRow as { admin_id: string | null }).admin_id;
  const { error } = await supabase.from('task_force_requests').insert({
    task_id: taskId, subtask_id: subtaskId, requested_by: me,
    request_note: requestNote, managing_admin_id: managingAdminId,
    admin1_status: 'pending', status: 'requested',
  });
  if (error) throw new Error(error.message);
}

export async function getTaskForceForSubtask(subtaskId: string): Promise<TaskForceRequest | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('task_force_requests')
    .select('*')
    .eq('subtask_id', subtaskId)
    .is('deleted_at', null)
    .in('status', ['requested', 'sourcing', 'active'])
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRequest(data) : null;
}

export async function cancelTaskForceRequest(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('task_force_requests')
    .update({ status: 'cancelled', deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ============ Admin 1 (managing admin) ============
export async function listIncomingTaskForceRequests(): Promise<TaskForceRequest[]> {
  const supabase = createClient();
  const me = await uid();
  if (!me) return [];
  const { data, error } = await supabase
    .from('task_force_requests')
    .select('*, tasks(title, title_ar)')
    .eq('managing_admin_id', me)
    .eq('admin1_status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => mapRequest(r));
}

export async function admin1Approve(requestId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('task_force_requests')
    .update({ admin1_status: 'approved', status: 'sourcing', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function admin1Reject(requestId: string, reason: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('task_force_requests')
    .update({
      admin1_status: 'rejected', status: 'rejected',
      admin1_rejected_reason: reason, updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}
export async function listOtherDeptAdmins(): Promise<{ id: string; name: string; nameAr: string; departmentId: string | null; departmentName: string | null }[]> {
  const supabase = createClient();
  const me = await uid();
  if (!me) return [];
  const { data: meRow } = await supabase.from('users').select('department_id').eq('id', me).single();
  const myDept = (meRow as { department_id: string | null } | null)?.department_id ?? null;
  let q = supabase
    .from('users')
    .select('id, name, name_ar, department_id, departments!users_department_id_fkey(name)')
    .eq('role', 'admin').eq('is_active', true).is('deleted_at', null).neq('id', me);
  if (myDept) q = q.neq('department_id', myDept);
  const { data, error } = await q.order('name');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, nameAr: r.name_ar,
    departmentId: r.department_id, departmentName: r.departments?.name ?? null,
  }));
}

export async function fanOutBorrows(
  requestId: string,
  admins: { id: string; departmentId: string | null }[],
): Promise<void> {
  const supabase = createClient();
  if (admins.length === 0) return;
  const rows = admins.map((a) => ({
    request_id: requestId, to_admin_id: a.id, to_department_id: a.departmentId, status: 'pending',
  }));
  const { error } = await supabase.from('task_force_borrows').insert(rows);
  if (error) throw new Error(error.message);
}

// ============ Lending admin ============
export async function listIncomingBorrows(): Promise<TaskForceBorrow[]> {
  const supabase = createClient();
  const me = await uid();
  if (!me) return [];
  const { data, error } = await supabase
    .from('task_force_borrows')
    .select('*, task_force_requests(request_note, requested_by, subtask_id)')
    .eq('to_admin_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((b: any) => mapBorrow(b));
}

export async function approveBorrow(borrowId: string, memberId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc('approve_borrow', {
    p_borrow_id: borrowId, p_member_id: memberId,
  });
  if (error) throw new Error(error.message);
}

export async function rejectBorrow(borrowId: string, reason: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('task_force_borrows')
    .update({ status: 'rejected', rejected_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', borrowId);
  if (error) throw new Error(error.message);
}

export async function listMyTeam(): Promise<{ id: string; name: string; nameAr: string }[]> {
  const supabase = createClient();
  const me = await uid();
  if (!me) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, name, name_ar')
    .eq('admin_id', me).eq('is_active', true).is('deleted_at', null)
    .in('role', ['rm', 'arm'])
    .order('name');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((u: any) => ({ id: u.id, name: u.name, nameAr: u.name_ar }));
}
export async function taskHasActiveTaskForce(taskId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('task_force_requests')
    .select('id')
    .eq('task_id', taskId)
    .in('status', ['sourcing', 'active'])
    .is('deleted_at', null)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}