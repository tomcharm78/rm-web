// Vacations / leave-request types — three-shape pattern + mappers.

export type LeaveType =
  | 'annual' | 'emergency' | 'maternity' | 'paternity' | 'death' | 'business'
  | 'sick' | 'hajj' | 'unpaid' | 'other';

export type VacationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

// ---- DB row (snake_case) ----
export type VacationRequestRow = {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  leave_type_other: string | null;
  start_date: string;   // 'YYYY-MM-DD'
  end_date: string;     // 'YYYY-MM-DD'
  reason: string;
  status: VacationStatus;
  approver_id: string | null;
  rejection_reason: string | null;
  conflicts: unknown;   // jsonb
  organization_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// ---- canonical (camelCase) ----
export type VacationRequest = {
  id: string;
  userId: string;
  leaveType: LeaveType;
  leaveTypeOther: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  status: VacationStatus;
  approverId: string | null;
  rejectionReason: string | null;
  conflicts: ConflictEntry[];
  createdAt: string;
  updatedAt: string;
  // enriched (joined) — optional
  requesterName?: string;
  requesterNameAr?: string;
  approverName?: string;
};

// overlap entry stored in conflicts jsonb
export type ConflictEntry = {
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
};

export function dbVacationToVacation(r: VacationRequestRow): VacationRequest {
  let conflicts: ConflictEntry[] = [];
  if (Array.isArray(r.conflicts)) conflicts = r.conflicts as ConflictEntry[];
  return {
    id: r.id,
    userId: r.user_id,
    leaveType: r.leave_type,
    leaveTypeOther: r.leave_type_other,
    startDate: r.start_date,
    endDate: r.end_date,
    reason: r.reason,
    status: r.status,
    approverId: r.approver_id,
    rejectionReason: r.rejection_reason,
    conflicts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---- form input ----
export type VacationRequestInput = {
  leaveType: LeaveType;
  leaveTypeOther?: string;
  startDate: string;
  endDate: string;
  reason: string;
};

// ---- labels ----
export const LEAVE_TYPE_LABELS: Record<LeaveType, { en: string; ar: string }> = {
  annual:    { en: 'Annual leave',     ar: 'إجازة سنوية' },
  emergency: { en: 'Emergency leave',  ar: 'إجازة طارئة' },
  maternity: { en: 'Maternity leave',  ar: 'إجازة أمومة' },
  paternity: { en: 'Paternity leave',  ar: 'إجازة أبوة' },
  death:     { en: 'Bereavement leave',ar: 'إجازة وفاة' },
  business:  { en: 'Business travel',  ar: 'مهمة عمل' },
  sick:      { en: 'Sick leave',       ar: 'إجازة مرضية' },
  hajj:      { en: 'Hajj leave',       ar: 'إجازة حج' },
  unpaid:    { en: 'Unpaid leave',     ar: 'إجازة بدون راتب' },
  other:     { en: 'Other',            ar: 'أخرى' },
};

export function leaveTypeLabel(t: LeaveType, ar: boolean, other?: string | null): string {
  if (t === 'other' && other && other.trim()) return other.trim();
  return ar ? LEAVE_TYPE_LABELS[t].ar : LEAVE_TYPE_LABELS[t].en;
}

export const STATUS_LABELS: Record<VacationStatus, { en: string; ar: string }> = {
  pending:   { en: 'Pending',  ar: 'قيد الانتظار' },
  approved:  { en: 'Approved', ar: 'موافق عليها' },
  rejected:  { en: 'Rejected', ar: 'مرفوضة' },
  cancelled: { en: 'Cancelled',ar: 'ملغاة' },
};

export function statusLabel(s: VacationStatus, ar: boolean): string {
  return ar ? STATUS_LABELS[s].ar : STATUS_LABELS[s].en;
}

export function statusColor(s: VacationStatus): string {
  switch (s) {
    case 'pending':   return '#eda100';
    case 'approved':  return '#199e70';
    case 'rejected':  return '#e34948';
    case 'cancelled': return '#898781';
  }
}

// ---- date helpers ----
// inclusive day count between two 'YYYY-MM-DD' dates
export function leaveDayCount(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00Z').getTime();
  const e = new Date(endDate + 'T00:00:00Z').getTime();
  if (e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

// today as 'YYYY-MM-DD' (UTC)
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// is the request in the future (start date after today)?
export function isFutureLeave(startDate: string): boolean {
  return startDate > todayIso();
}

// days until start (for the countdown widget); negative if started/past
export function daysUntil(startDate: string): number {
  const s = new Date(startDate + 'T00:00:00Z').getTime();
  const t = new Date(todayIso() + 'T00:00:00Z').getTime();
  return Math.round((s - t) / 86400000);
}

// two [start,end] ranges overlap (inclusive)?
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
