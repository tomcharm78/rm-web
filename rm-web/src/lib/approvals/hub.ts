// Approvals aggregation hub — data layer (read-only adapters).
//
// Each adapter reads one source and returns UnifiedApproval[]. getUnifiedApprovals
// concatenates all four and sorts FIFO (createdAt ascending). Approve/reject in the
// UI calls each source's EXISTING mutation (approveClosure/rejectClosure,
// approveTransfer/rejectTransfer, approveVacation/rejectVacation,
// decideApprovalRequest) — this file does NOT mutate.
//
// Scoping: we rely on each source table's own RLS. A super_admin's query returns all
// org rows; an admin's returns only what their RLS permits (their department). We do
// NOT re-implement department walls here — keeps the hub in lockstep with the real
// permissions and avoids drift.

import { createClient } from '@/lib/supabase/client';
import type { UnifiedApproval, ApprovalHubStatus } from '@/types/approval-hub';

// ---------------------------------------------------------------- name/dept enrich
// One batched users fetch (id -> name + department_id) and one departments fetch
// (id -> name). Adapters whose source row lacks department_id derive it from the
// requester's user record via userDeptId.
type NameEntry = { name: string; nameAr: string };

type Lookups = {
  nameById: Map<string, NameEntry>;
  userDeptId: Map<string, string | null>;
  deptById: Map<string, NameEntry>;
};

// Pass user ids to resolve names + their departments. deptIds are any department ids
// already known on the source rows (closures have department_id directly).
async function buildLookups(userIds: string[], extraDeptIds: string[] = []): Promise<Lookups> {
  const supabase = createClient();
  const nameById = new Map<string, NameEntry>();
  const userDeptId = new Map<string, string | null>();
  const deptById = new Map<string, NameEntry>();

  const uids = Array.from(new Set(userIds.filter(Boolean)));
  if (uids.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, name_ar, department_id')
      .in('id', uids);
    for (const u of (users ?? []) as {
      id: string;
      name: string;
      name_ar: string | null;
      department_id: string | null;
    }[]) {
      nameById.set(u.id, { name: u.name, nameAr: u.name_ar ?? '' });
      userDeptId.set(u.id, u.department_id ?? null);
    }
  }

  const dids = Array.from(
    new Set([...extraDeptIds, ...Array.from(userDeptId.values())].filter(Boolean) as string[]),
  );
  if (dids.length > 0) {
    const { data: depts } = await supabase
      .from('departments')
      .select('id, name, name_ar')
      .in('id', dids);
    for (const d of (depts ?? []) as { id: string; name: string; name_ar: string | null }[]) {
      deptById.set(d.id, { name: d.name, nameAr: d.name_ar ?? '' });
    }
  }

  return { nameById, userDeptId, deptById };
}

function deptFields(
  deptId: string | null,
  deptById: Map<string, NameEntry>,
): { departmentId: string | null; departmentName: string; departmentNameAr: string } {
  const dep = deptId ? deptById.get(deptId) : undefined;
  return {
    departmentId: deptId,
    departmentName: dep?.name ?? '',
    departmentNameAr: dep?.nameAr ?? '',
  };
}

// ================================================================ CLOSURE adapter
type TaskClosureRow = {
  id: string;
  title: string;
  title_ar: string | null;
  department_id: string | null;
  closure_note: string | null;
  closure_requested_by: string | null;
  closure_requested_at: string | null;
  closure_rejected_at: string | null;
  closure_rejected_reason: string | null;
};

async function getClosureApprovals(status: ApprovalHubStatus): Promise<UnifiedApproval[]> {
  const supabase = createClient();

  if (status === 'pending' || status === 'rejected') {
    let q = supabase
      .from('tasks')
      .select(
        'id, title, title_ar, department_id, closure_note, closure_requested_by, closure_requested_at, closure_rejected_at, closure_rejected_reason',
      )
      .is('deleted_at', null);
    if (status === 'pending') q = q.not('closure_requested_at', 'is', null).neq('status', 'done');
    else q = q.not('closure_rejected_at', 'is', null);

    const { data, error } = await q;
    if (error) {
      console.error('[getClosureApprovals] pending/rejected', error);
      return [];
    }
    const rows = (data ?? []) as TaskClosureRow[];
    if (rows.length === 0) return [];

    const { nameById, deptById } = await buildLookups(
      rows.map((r) => r.closure_requested_by ?? ''),
      rows.map((r) => r.department_id ?? ''),
    );

    return rows.map((r) => {
      const req = r.closure_requested_by ? nameById.get(r.closure_requested_by) : undefined;
      const createdAt =
        status === 'pending'
          ? r.closure_requested_at ?? new Date(0).toISOString()
          : r.closure_rejected_at ?? new Date(0).toISOString();
      return {
        key: `task_closure:${r.id}`,
        kind: 'task_closure' as const,
        sourceId: r.id,
        title: r.title,
        titleAr: r.title_ar ?? '',
        detail: r.closure_note ?? null,
        detailAr: null,
        requesterId: r.closure_requested_by,
        requesterName: req?.name ?? '',
        requesterNameAr: req?.nameAr ?? '',
        ...deptFields(r.department_id, deptById),
        status,
        createdAt,
        decidedAt: status === 'rejected' ? r.closure_rejected_at : null,
        decisionComment: status === 'rejected' ? r.closure_rejected_reason : null,
        detailHref: `/tasks/${r.id}`,
      } satisfies UnifiedApproval;
    });
  }

  // APPROVED: reconstruct from task_status_history.
  const { data: hist, error: histErr } = await supabase
    .from('task_status_history')
    .select('id, task_id, changed_by_id, changed_at, change_reason')
    .eq('change_reason', 'Closure approved');
  if (histErr) {
    console.error('[getClosureApprovals] approved history', histErr.message, histErr.code, histErr.details, histErr.hint);
    return [];
  }
  const histRows = (hist ?? []) as {
    id: string;
    task_id: string;
    changed_by_id: string | null;
    changed_at: string | null;
    change_reason: string;
  }[];
  if (histRows.length === 0) return [];

  const taskIds = Array.from(new Set(histRows.map((h) => h.task_id)));
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, title_ar, department_id')
    .in('id', taskIds);
  const taskById = new Map(
    ((tasks ?? []) as {
      id: string;
      title: string;
      title_ar: string | null;
      department_id: string | null;
    }[]).map((t) => [t.id, t]),
  );

  const { nameById, deptById } = await buildLookups(
    histRows.map((h) => h.changed_by_id ?? ''),
    (tasks ?? []).map((t: { department_id: string | null }) => t.department_id ?? ''),
  );

  return histRows.map((h) => {
    const t = taskById.get(h.task_id);
    const approver = h.changed_by_id ? nameById.get(h.changed_by_id) : undefined;
    return {
      key: `task_closure:${h.task_id}:${h.id}`,
      kind: 'task_closure' as const,
      sourceId: h.task_id,
      title: t?.title ?? '(task)',
      titleAr: t?.title_ar ?? '',
      detail: null,
      detailAr: null,
      requesterId: null,
      requesterName: approver?.name ?? '',
      requesterNameAr: approver?.nameAr ?? '',
      ...deptFields(t?.department_id ?? null, deptById),
      status: 'approved' as const,
      createdAt: h.changed_at ?? new Date(0).toISOString(),
      decidedAt: h.changed_at,
      decisionComment: null,
      detailHref: `/tasks/${h.task_id}`,
    } satisfies UnifiedApproval;
  });
}

// ================================================================ TRANSFER adapter
type TransferRow = {
  id: string;
  task_id: string | null;
  requester_id: string;
  target_user_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

async function getTransferApprovals(status: ApprovalHubStatus): Promise<UnifiedApproval[]> {
  const supabase = createClient();
  // rork-era enum: transfer_status = requested/approved/rejected/executed (no 'pending').
  const dbstatus = status === 'pending' ? 'requested' : status;
  // Rork-era enum: transfer_status = requested/approved/rejected/executed (no 'pending').
  const dbStatus = status === 'pending' ? 'requested' : status;
  const { data, error } = await supabase
    .from('transfer_requests')
    .select('id, task_id, requester_id, target_user_id, reason, status, rejection_reason, created_at, updated_at')
    .eq('status', dbStatus)
    .is('deleted_at', null);
  if (error) {
    console.error('[getTransferApprovals]', error.message, error.code, error.details, error.hint);
    return [];
  }
  const rows = (data ?? []) as TransferRow[];
  if (rows.length === 0) return [];

  // Resolve requester + target names, and requester department.
  const { nameById, userDeptId, deptById } = await buildLookups([
    ...rows.map((r) => r.requester_id),
    ...rows.map((r) => r.target_user_id),
  ]);

  return rows.map((r) => {
    const req = nameById.get(r.requester_id);
    const target = nameById.get(r.target_user_id);
    const deptId = userDeptId.get(r.requester_id) ?? null;
    return {
      key: `transfer:${r.id}`,
      kind: 'transfer' as const,
      sourceId: r.id,
      title: `Transfer to ${target?.name ?? 'user'}`,
      titleAr: `نقل إلى ${target?.nameAr || target?.name || 'مستخدم'}`,
      detail: r.reason,
      detailAr: null,
      requesterId: r.requester_id,
      requesterName: req?.name ?? '',
      requesterNameAr: req?.nameAr ?? '',
      ...deptFields(deptId, deptById),
      status,
      createdAt: r.created_at,
      decidedAt: status === 'pending' ? null : r.updated_at,
      decisionComment: status === 'rejected' ? r.rejection_reason : null,
      detailHref: r.task_id ? `/tasks/${r.task_id}` : null,
      meta: { taskId: r.task_id, targetUserId: r.target_user_id },
    } satisfies UnifiedApproval;
  });
}

// ================================================================ VACATION adapter
type VacationRow = {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

async function getVacationApprovals(status: ApprovalHubStatus): Promise<UnifiedApproval[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vacation_requests')
    .select('id, user_id, leave_type, start_date, end_date, reason, status, rejection_reason, created_at, updated_at')
    .eq('status', status)
    .is('deleted_at', null)
    .is('archived_at', null);
  if (error) {
    console.error('[getVacationApprovals]', error);
    return [];
  }
  const rows = (data ?? []) as VacationRow[];
  if (rows.length === 0) return [];

  const { nameById, userDeptId, deptById } = await buildLookups(rows.map((r) => r.user_id));

  return rows.map((r) => {
    const req = nameById.get(r.user_id);
    const deptId = userDeptId.get(r.user_id) ?? null;
    return {
      key: `vacation:${r.id}`,
      kind: 'vacation' as const,
      sourceId: r.id,
      title: `${r.leave_type} leave (${r.start_date} → ${r.end_date})`,
      titleAr: `إجازة (${r.start_date} → ${r.end_date})`,
      detail: r.reason,
      detailAr: null,
      requesterId: r.user_id,
      requesterName: req?.name ?? '',
      requesterNameAr: req?.nameAr ?? '',
      ...deptFields(deptId, deptById),
      status,
      createdAt: r.created_at,
      decidedAt: status === 'pending' ? null : r.updated_at,
      decisionComment: status === 'rejected' ? r.rejection_reason : null,
      detailHref: `/vacations?highlight=${r.id}`,
    } satisfies UnifiedApproval;
  });
}

// ================================================================ LETTER adapter
type LetterRow = {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  requester_id: string;
  status: 'pending' | 'approved' | 'rejected';
  decision_comment: string | null;
  decided_at: string | null;
  created_at: string;
};

async function getLetterApprovals(status: ApprovalHubStatus): Promise<UnifiedApproval[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('approval_requests')
    .select(
      'id, title, title_ar, description, description_ar, requester_id, status, decision_comment, decided_at, created_at',
    )
    .eq('status', status)
    .is('deleted_at', null);
  if (error) {
    console.error('[getLetterApprovals]', error);
    return [];
  }
  const rows = (data ?? []) as LetterRow[];
  if (rows.length === 0) return [];

  const { nameById, userDeptId, deptById } = await buildLookups(rows.map((r) => r.requester_id));

  return rows.map((r) => {
    const req = nameById.get(r.requester_id);
    const deptId = userDeptId.get(r.requester_id) ?? null;
    return {
      key: `letter:${r.id}`,
      kind: 'letter' as const,
      sourceId: r.id,
      title: r.title,
      titleAr: r.title_ar ?? '',
      detail: r.description,
      detailAr: r.description_ar,
      requesterId: r.requester_id,
      requesterName: req?.name ?? '',
      requesterNameAr: req?.nameAr ?? '',
      ...deptFields(deptId, deptById),
      status,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      decisionComment: r.decision_comment,
      detailHref: null, // stays in the hub
    } satisfies UnifiedApproval;
  });
}

// ================================================================ public entry
export async function getUnifiedApprovals(status: ApprovalHubStatus): Promise<UnifiedApproval[]> {
  const results = await Promise.all([
    getClosureApprovals(status),
    getTransferApprovals(status),
    getVacationApprovals(status),
    getLetterApprovals(status),
  ]);
  const merged = results.flat();
  merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // FIFO: oldest first
  return merged;
}

// Count of everything currently pending (for the dashboard tile).
export async function getPendingApprovalsCount(): Promise<number> {
  const rows = await getUnifiedApprovals('pending');
  return rows.length;
}
