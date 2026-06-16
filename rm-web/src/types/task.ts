// Task module types. Three-shape pattern: TaskRow (DB snake_case) →
// Task (app camelCase) → TaskPublicDTO (integrations) + mappers.
// Timestamps are ISO strings (matches the rest of the app; the UI formats
// them with new Date(...)). Audit is automatic via DB triggers — never logged
// here. task_status_history IS written by the app on each status change.

export const TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, { en: string; ar: string }> = {
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  in_progress: { en: 'In progress', ar: 'قيد التنفيذ' },
  blocked: { en: 'Blocked', ar: 'متوقفة' },
  done: { en: 'Done', ar: 'منجزة' },
  cancelled: { en: 'Cancelled', ar: 'ملغاة' },
};

export const PRIORITY_LABELS: Record<TaskPriority, { en: string; ar: string }> = {
  low: { en: 'Low', ar: 'منخفضة' },
  medium: { en: 'Medium', ar: 'متوسطة' },
  high: { en: 'High', ar: 'عالية' },
  critical: { en: 'Critical', ar: 'حرجة' },
};

// ---- DB row (snake_case) ----
export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  status: TaskStatus;
  priority: TaskPriority;
  domain_id: string;
  sub_domain_id: string | null;
  assigned_to_id: string;
  created_by_id: string;
  tat_start_at: string;
  tat_due_date: string;
  completion_percentage: number;
  completed_at: string | null;
  closure_note: string | null;
  closure_requested_at: string | null;
  closure_requested_by: string | null;
  closure_rejected_at: string | null;
  closure_rejected_reason: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  declined_by: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  source_session_id: string | null;
  archived_at: string | null;
  archived_by_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  external_id: string | null;
  source_system: string | null;
  source_metadata: Record<string, unknown> | null;
};

// ---- App type (camelCase) ----
export type Task = {
  id: string;
  organizationId: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  status: TaskStatus;
  priority: TaskPriority;
  domainId: string;
  subDomainId: string | null;
  assignedToId: string;
  createdById: string;
  tatStartAt: string;
  tatDueDate: string;
  completionPercentage: number;
  completedAt: string | null;
  closureNote: string | null;
  closureRequestedAt: string | null;
  closureRequestedBy: string | null;
  closureRejectedAt: string | null;
  closureRejectedReason: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  declinedBy: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  sourceSessionId: string | null;
  archivedAt: string | null;
  archivedById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  externalId: string | null;
  sourceSystem: string | null;
  sourceMetadata: Record<string, unknown> | null;
};

export function dbTaskToTask(r: TaskRow): Task {
  return {
    id: r.id,
    organizationId: r.organization_id,
    title: r.title,
    titleAr: r.title_ar,
    description: r.description,
    descriptionAr: r.description_ar,
    status: r.status,
    priority: r.priority,
    domainId: r.domain_id,
    subDomainId: r.sub_domain_id,
    assignedToId: r.assigned_to_id,
    createdById: r.created_by_id,
    tatStartAt: r.tat_start_at,
    tatDueDate: r.tat_due_date,
    completionPercentage: r.completion_percentage,
    completedAt: r.completed_at,
    closureNote: r.closure_note,
    closureRequestedAt: r.closure_requested_at,
    closureRequestedBy: r.closure_requested_by,
    closureRejectedAt: r.closure_rejected_at,
    closureRejectedReason: r.closure_rejected_reason,
    acceptedAt: r.accepted_at,
    declinedAt: r.declined_at,
    declineReason: r.decline_reason,
    declinedBy: r.declined_by,
    cancelReason: r.cancel_reason,
    cancelledAt: r.cancelled_at,
    sourceSessionId: r.source_session_id,
    archivedAt: r.archived_at,
    archivedById: r.archived_by_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    externalId: r.external_id,
    sourceSystem: r.source_system,
    sourceMetadata: r.source_metadata,
  };
}

// ---- Status history (app writes this on each status change) ----
export type TaskStatusHistoryRow = {
  id: string;
  task_id: string;
  from_status: TaskStatus;
  to_status: TaskStatus;
  changed_by_id: string;
  change_reason: string | null;
  changed_at: string;
};

export type TaskStatusHistoryEntry = {
  id: string;
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  changedById: string;
  changeReason: string | null;
  changedAt: string;
};

export function dbStatusHistoryToEntry(r: TaskStatusHistoryRow): TaskStatusHistoryEntry {
  return {
    id: r.id,
    taskId: r.task_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    changedById: r.changed_by_id,
    changeReason: r.change_reason,
    changedAt: r.changed_at,
  };
}

// ---- Form input (create/edit). tatDueDate REQUIRED (tat_due_date is NOT NULL). ----
export type TaskFormInput = {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  priority: TaskPriority;
  domainId: string;
  subDomainId: string | null;
  assignedToId: string;
  tatDueDate: string; // ISO datetime
  sourceSessionId?: string | null;
};

// ---- Integration DTO (MOH later) ----
export type TaskPublicDTO = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedToId: string;
  dueDate: string;
  completionPercentage: number;
};

export function taskToPublicDTO(t: Task): TaskPublicDTO {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignedToId: t.assignedToId,
    dueDate: t.tatDueDate,
    completionPercentage: t.completionPercentage,
  };
}

// ---- Helper: overdue if past due and not finished ----
export function isOverdue(t: Task): boolean {
  if (t.status === 'done' || t.status === 'cancelled') return false;
  return new Date(t.tatDueDate).getTime() < Date.now();
}
// ---- Task Milestones (assignee checklist → computed progress) ----
// Stored in table public.task_milestones. ("KPIs" is a separate concept to be
// added later, linked to tasks and milestones.)
export type TaskMilestoneRow = {
  id: string;
  task_id: string;
  title: string;
  title_ar: string;
  is_done: boolean;
  sort_order: number;
  assigned_to_id: string | null;
  due_date: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
};

export type SubtaskSupportStatus = 'requested' | 'accepted' | 'declined';
export type MilestoneSubtaskRow = {
  id: string;
  milestone_id: string;
  title: string;
  title_ar: string;
  is_done: boolean;
  sort_order: number;
  assigned_to_id: string | null;
  support_status: SubtaskSupportStatus | null;
  support_decline_reason: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
};

export type MilestoneSubtask = {
  id: string;
  milestoneId: string;
  title: string;
  titleAr: string;
  isDone: boolean;
  sortOrder: number;
  assignedToId: string | null;
  supportStatus: SubtaskSupportStatus | null;
  supportDeclineReason: string | null;
};

export type TaskMilestone = {
  id: string;
  taskId: string;
  title: string;
  titleAr: string;
  isDone: boolean;
  sortOrder: number;
  assignedToId: string | null;
  dueDate: string | null;
  subtasks: MilestoneSubtask[];
};

export function dbSubtaskToSubtask(r: MilestoneSubtaskRow): MilestoneSubtask {
  return {
    id: r.id,
    milestoneId: r.milestone_id,
    title: r.title,
    titleAr: r.title_ar,
    isDone: r.is_done,
    sortOrder: r.sort_order,
    assignedToId: r.assigned_to_id,
    supportStatus: r.support_status,
    supportDeclineReason: r.support_decline_reason,
  };
}

export function dbMilestoneToMilestone(r: TaskMilestoneRow): TaskMilestone {
  return {
    id: r.id,
    taskId: r.task_id,
    title: r.title,
    titleAr: r.title_ar,
    isDone: r.is_done,
    sortOrder: r.sort_order,
    assignedToId: r.assigned_to_id,
    dueDate: r.due_date,
    subtasks: [],
  };
}

// % for a single milestone: from its sub-tasks (done/total) if any, else its own done flag.
export function milestoneOneProgress(m: TaskMilestone): number {
  if (m.subtasks.length > 0) {
    const done = m.subtasks.filter((s) => s.isDone).length;
    return Math.round((done / m.subtasks.length) * 100);
  }
  return m.isDone ? 100 : 0;
}

// Task % = simple average of each milestone's progress. 0 if no milestones.
export function milestoneProgress(items: TaskMilestone[]): number {
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, m) => acc + milestoneOneProgress(m), 0);
  return Math.round(sum / items.length);
}
// ===================== Transfer requests =====================
export type TransferStatus = 'requested' | 'approved' | 'rejected' | 'executed';

export type TransferRequestRow = {
  id: string;
  task_id: string | null;
  requester_id: string;
  target_user_id: string;
  reason: string;
  status: TransferStatus;
  approved_by_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  organization_id: string;
};

export type TransferRequest = {
  id: string;
  taskId: string | null;
  requesterId: string;
  targetUserId: string;
  reason: string;
  status: TransferStatus;
  approvedById: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

export function dbTransferToTransfer(r: TransferRequestRow): TransferRequest {
  return {
    id: r.id,
    taskId: r.task_id,
    requesterId: r.requester_id,
    targetUserId: r.target_user_id,
    reason: r.reason,
    status: r.status,
    approvedById: r.approved_by_id,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at,
  };
}