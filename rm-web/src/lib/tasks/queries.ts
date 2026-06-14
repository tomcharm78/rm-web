// Tasks data layer. UI never calls supabase.from('tasks') directly.
// Audit is automatic via DB triggers (trg_audit_tasks / trg_audit_task_semantic),
// so NO manual audit logging here. task_status_history IS written by the app on
// each status change (its INSERT policy was added in migration 0012).
//
// RLS enforces who-can-do-what; this layer adds the *default view* scoping:
// admins/super see all org tasks, rm/arm see their own (assigned or created).

import { createClient } from '@/lib/supabase/client';
import {
  dbTaskToTask,
  dbStatusHistoryToEntry,
  dbMilestoneToMilestone,
  type Task,
  type TaskRow,
  type TaskStatus,
  type TaskPriority,
  type TaskFormInput,
  type TaskStatusHistoryEntry,
  type TaskStatusHistoryRow,
  type TaskMilestone,
  type TaskMilestoneRow,
} from '@/types/task';
import type { UserRole } from '@/types';

export type TaskFilters = {
  search?: string;
  status?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  domainId?: string | 'all';
  assigneeId?: string | 'all';
  overdueOnly?: boolean;
  sourceSessionId?: string;
  includeArchived?: boolean;
};

export type TaskScope = { userId: string; role: UserRole };

export type AssignableUser = {
  id: string;
  name: string;
  nameAr: string;
  role: string;
  avatar: string | null;
};

export type DomainLite = { id: string; name: string; nameAr: string };

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ----------------------------------------------------------------- READ
export async function listTasks(filters: TaskFilters, scope: TaskScope): Promise<Task[]> {
  const supabase = createClient();
  let q = supabase.from('tasks').select('*').is('deleted_at', null);

  if (!filters.includeArchived) q = q.is('archived_at', null);

  // Default-view scope: rm/arm see only their own; admin/super see all (RLS-bounded).
  if (scope.role === 'rm' || scope.role === 'arm') {
    q = q.or(`assigned_to_id.eq.${scope.userId},created_by_id.eq.${scope.userId}`);
  }

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority);
  if (filters.domainId && filters.domainId !== 'all') q = q.eq('domain_id', filters.domainId);
  if (filters.assigneeId && filters.assigneeId !== 'all') {
    q = q.eq('assigned_to_id', filters.assigneeId);
  }
  if (filters.sourceSessionId) q = q.eq('source_session_id', filters.sourceSessionId);
  if (filters.overdueOnly) {
    q = q.lt('tat_due_date', new Date().toISOString()).not('status', 'in', '(done,cancelled)');
  }

  const { data, error } = await q.order('tat_due_date', { ascending: true });
  if (error) {
    console.error('[listTasks]', error);
    throw new Error(error.message);
  }

  let rows = (data as TaskRow[]).map(dbTaskToTask);

  // Bilingual search (client-side, on title EN+AR).
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    const sl = s.toLowerCase();
    rows = rows.filter((t) => t.title.toLowerCase().includes(sl) || t.titleAr.includes(s));
  }

  // Stable secondary sort: due date asc, then priority (critical first).
  rows.sort((a, b) => {
    const da = new Date(a.tatDueDate).getTime();
    const db = new Date(b.tatDueDate).getTime();
    if (da !== db) return da - db;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });

  return rows;
}

export async function getTask(id: string): Promise<Task | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[getTask]', error);
    throw new Error(error.message);
  }
  return data ? dbTaskToTask(data as TaskRow) : null;
}

export async function getTaskStatusHistory(taskId: string): Promise<TaskStatusHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('task_status_history')
    .select('*')
    .eq('task_id', taskId)
    .order('changed_at', { ascending: false });
  if (error) {
    console.error('[getTaskStatusHistory]', error);
    throw new Error(error.message);
  }
  return (data as TaskStatusHistoryRow[]).map(dbStatusHistoryToEntry);
}

// --------------------------------------------------------------- LOOKUPS
export async function listTaskDomains(): Promise<DomainLite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('domains')
    .select('id, name, name_ar')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as { id: string; name: string; name_ar: string }[]).map((d) => ({
    id: d.id,
    name: d.name,
    nameAr: d.name_ar,
  }));
}

export async function listSubDomains(domainId: string): Promise<DomainLite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sub_domains')
    .select('id, name, name_ar')
    .eq('domain_id', domainId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as { id: string; name: string; name_ar: string }[]).map((d) => ({
    id: d.id,
    name: d.name,
    nameAr: d.name_ar,
  }));
}

// Active rm/arm/admin in org; optionally only those mapped to a given domain.
export async function listAssignableUsers(domainId?: string): Promise<AssignableUser[]> {
  const supabase = createClient();

  let ids: string[] | null = null;
  if (domainId) {
    const { data: ud, error: udErr } = await supabase
      .from('user_domains')
      .select('user_id')
      .eq('domain_id', domainId);
    if (udErr) throw new Error(udErr.message);
    ids = (ud as { user_id: string }[]).map((x) => x.user_id);
    if (ids.length === 0) return [];
  }

  let q = supabase
    .from('users')
    .select('id, name, name_ar, role, avatar')
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('role', ['rm', 'arm', 'admin']);
  if (ids) q = q.in('id', ids);

  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as { id: string; name: string; name_ar: string; role: string; avatar: string | null }[]).map(
    (u) => ({ id: u.id, name: u.name, nameAr: u.name_ar, role: u.role, avatar: u.avatar })
  );
}

// ---------------------------------------------------------------- WRITE
// Create. status / tat_start_at / completion_percentage use DB defaults.
// description columns are NOT NULL with '' default, so we send '' never null.
export async function createTask(input: TaskFormInput): Promise<Task> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');

  const { data: me } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', authUser.id)
    .single();
  if (!me) throw new Error('user_lookup_failed');

  if (!input.tatDueDate) throw new Error('due_date_required');
  if (!input.assignedToId) throw new Error('assignee_required');
  if (!input.domainId) throw new Error('domain_required');
  if (!input.title.trim() || !input.titleAr.trim()) throw new Error('title_required');

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      organization_id: (me as { organization_id: string }).organization_id,
      title: input.title.trim(),
      title_ar: input.titleAr.trim(),
      description: input.description.trim(),
      description_ar: input.descriptionAr.trim(),
      priority: input.priority,
      domain_id: input.domainId,
      sub_domain_id: input.subDomainId,
      assigned_to_id: input.assignedToId,
      created_by_id: authUser.id,
      tat_due_date: new Date(input.tatDueDate).toISOString(),
      source_session_id: input.sourceSessionId ?? null,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[createTask]', error);
    throw new Error(error.message);
  }
  return dbTaskToTask(data as TaskRow);
}

// Edit fields (not status — status moves through the workflow).
export async function updateTask(taskId: string, input: TaskFormInput): Promise<Task> {
  const supabase = createClient();
  if (!input.tatDueDate) throw new Error('due_date_required');
  if (!input.title.trim() || !input.titleAr.trim()) throw new Error('title_required');

  const { data, error } = await supabase
    .from('tasks')
    .update({
      title: input.title.trim(),
      title_ar: input.titleAr.trim(),
      description: input.description.trim(),
      description_ar: input.descriptionAr.trim(),
      priority: input.priority,
      domain_id: input.domainId,
      sub_domain_id: input.subDomainId,
      assigned_to_id: input.assignedToId,
      tat_due_date: new Date(input.tatDueDate).toISOString(),
    })
    .eq('id', taskId)
    .select('*')
    .single();
  if (error) {
    console.error('[updateTask]', error);
    throw new Error(error.message);
  }
  return dbTaskToTask(data as TaskRow);
}

// Status change + history row. done sets completed_at/100%; cancelled needs a reason.
export async function updateTaskStatus(
  taskId: string,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  opts?: { changeReason?: string; closureNote?: string; cancelReason?: string }
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');

  if (toStatus === 'cancelled' && !(opts?.cancelReason && opts.cancelReason.trim())) {
    throw new Error('cancel_reason_required');
  }

  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === 'done') {
    patch.completed_at = new Date().toISOString();
    patch.completion_percentage = 100;
    if (opts?.closureNote?.trim()) patch.closure_note = opts.closureNote.trim();
  }
  if (toStatus === 'cancelled') {
    patch.cancelled_at = new Date().toISOString();
    patch.cancel_reason = opts!.cancelReason!.trim();
  }

  const { error: upErr } = await supabase.from('tasks').update(patch).eq('id', taskId);
  if (upErr) {
    console.error('[updateTaskStatus] update', upErr);
    throw new Error(upErr.message);
  }

  const { error: histErr } = await supabase.from('task_status_history').insert({
    task_id: taskId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by_id: authUser.id,
    change_reason: opts?.changeReason?.trim() || opts?.cancelReason?.trim() || null,
  });
  if (histErr) {
    console.error('[updateTaskStatus] history', histErr);
    throw new Error(`Status changed, but history failed: ${histErr.message}`);
  }
}

export async function updateTaskCompletion(taskId: string, percentage: number): Promise<void> {
  const supabase = createClient();
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));
  const { error } = await supabase
    .from('tasks')
    .update({ completion_percentage: pct })
    .eq('id', taskId);
  if (error) throw new Error(error.message);
}

// Direct reassign (admin/super). Audit trigger logs old/new assignee.
export async function reassignTask(taskId: string, newAssigneeId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('tasks')
    .update({ assigned_to_id: newAssigneeId })
    .eq('id', taskId);
  if (error) throw new Error(error.message);
}

export async function cancelTask(
  taskId: string,
  fromStatus: TaskStatus,
  reason: string
): Promise<void> {
  await updateTaskStatus(taskId, fromStatus, 'cancelled', { cancelReason: reason });
}

export async function archiveTask(taskId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');
  const { error } = await supabase
    .from('tasks')
    .update({ archived_at: new Date().toISOString(), archived_by_id: authUser.id })
    .eq('id', taskId);
  if (error) throw new Error(error.message);
}

export async function unarchiveTask(taskId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('tasks')
    .update({ archived_at: null, archived_by_id: null })
    .eq('id', taskId);
  if (error) throw new Error(error.message);
}

export async function softDeleteTask(taskId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId);
  if (error) throw new Error(error.message);
}
export type UserName = { id: string; name: string; nameAr: string };

export async function listUserNames(): Promise<UserName[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('users').select('id, name, name_ar');
  if (error) throw new Error(error.message);
  return (data as { id: string; name: string; name_ar: string }[]).map((u) => ({
    id: u.id,
    name: u.name,
    nameAr: u.name_ar,
  }));
}

// ========================= Milestones =========================
// Progress is computed from the milestone checklist (checked / total) and stored
// on the task. Only the assignee can write milestones (RLS task_milestones_*).

async function recomputeTaskCompletion(
  supabase: ReturnType<typeof createClient>,
  taskId: string
): Promise<void> {
  const { data } = await supabase.from('task_milestones').select('is_done').eq('task_id', taskId);
  const items = (data ?? []) as { is_done: boolean }[];
  const pct =
    items.length === 0 ? 0 : Math.round((items.filter((m) => m.is_done).length / items.length) * 100);
  await supabase.from('tasks').update({ completion_percentage: pct }).eq('id', taskId);
}

export async function listTaskMilestones(taskId: string): Promise<TaskMilestone[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('task_milestones')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as TaskMilestoneRow[]).map(dbMilestoneToMilestone);
}

export async function addTaskMilestone(taskId: string, title: string, titleAr: string): Promise<TaskMilestone> {
  const supabase = createClient();
  if (!title.trim()) throw new Error('milestone_title_required');
  const { count } = await supabase
    .from('task_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);
  const { data, error } = await supabase
    .from('task_milestones')
    .insert({ task_id: taskId, title: title.trim(), title_ar: titleAr.trim(), sort_order: count ?? 0 })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  await recomputeTaskCompletion(supabase, taskId);
  return dbMilestoneToMilestone(data as TaskMilestoneRow);
}

export async function editTaskMilestone(milestoneId: string, title: string, titleAr: string): Promise<void> {
  const supabase = createClient();
  if (!title.trim()) throw new Error('milestone_title_required');
  const { error } = await supabase
    .from('task_milestones')
    .update({ title: title.trim(), title_ar: titleAr.trim(), updated_at: new Date().toISOString() })
    .eq('id', milestoneId);
  if (error) throw new Error(error.message);
}

export async function toggleTaskMilestone(milestoneId: string, taskId: string, isDone: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('task_milestones')
    .update({ is_done: isDone, updated_at: new Date().toISOString() })
    .eq('id', milestoneId);
  if (error) throw new Error(error.message);
  await recomputeTaskCompletion(supabase, taskId);
}

export async function deleteTaskMilestone(milestoneId: string, taskId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('task_milestones').delete().eq('id', milestoneId);
  if (error) throw new Error(error.message);
  await recomputeTaskCompletion(supabase, taskId);
}
// ====================== Closure approval ======================
// Assignee submits a closing statement (requires >=1 milestone). Admin approves
// (task -> Done) or rejects with a reason (back to the assignee). closure_note
// holds the statement; closure_requested_at flags "awaiting approval".

export async function submitClosure(taskId: string, statement: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');
  if (!statement.trim()) throw new Error('closure_statement_required');

  const { count } = await supabase
    .from('task_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);
  if (!count || count < 1) throw new Error('milestones_required');

  const { error } = await supabase
    .from('tasks')
    .update({
      closure_note: statement.trim(),
      closure_requested_at: new Date().toISOString(),
      closure_requested_by: authUser.id,
      closure_rejected_at: null,
      closure_rejected_reason: null,
    })
    .eq('id', taskId);
  if (error) throw new Error(error.message);
}

export async function approveClosure(taskId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('not_authenticated');

  const { data: cur, error: curErr } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .single();
  if (curErr || !cur) throw new Error('task_lookup_failed');
  const fromStatus = (cur as { status: TaskStatus }).status;

  const { error } = await supabase
    .from('tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completion_percentage: 100,
      closure_requested_at: null,
    })
    .eq('id', taskId);
  if (error) throw new Error(error.message);

  const { error: histErr } = await supabase.from('task_status_history').insert({
    task_id: taskId,
    from_status: fromStatus,
    to_status: 'done',
    changed_by_id: authUser.id,
    change_reason: 'Closure approved',
  });
  if (histErr) throw new Error(`Approved, but history failed: ${histErr.message}`);
}

export async function rejectClosure(taskId: string, reason: string): Promise<void> {
  const supabase = createClient();
  if (!reason.trim()) throw new Error('reject_reason_required');
  const { error } = await supabase
    .from('tasks')
    .update({
      closure_requested_at: null,
      closure_rejected_at: new Date().toISOString(),
      closure_rejected_reason: reason.trim(),
    })
    .eq('id', taskId);
  if (error) throw new Error(error.message);
}

// Domains a given user belongs to (for deriving a task's domain from its assignee).
export async function listUserDomains(userId: string): Promise<DomainLite[]> {
  const supabase = createClient();
  const { data: ud, error: udErr } = await supabase
    .from('user_domains')
    .select('domain_id')
    .eq('user_id', userId);
  if (udErr) throw new Error(udErr.message);
  const ids = (ud as { domain_id: string }[]).map((x) => x.domain_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('domains')
    .select('id, name, name_ar')
    .in('id', ids)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as { id: string; name: string; name_ar: string }[]).map((d) => ({
    id: d.id,
    name: d.name,
    nameAr: d.name_ar,
  }));
}