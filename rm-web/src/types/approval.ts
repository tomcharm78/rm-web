// ============================================================================
// Approvals module — types (three-shape pattern + labels + mappers)
// ============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// DB row (snake_case) ----------------------------------------------------------
export type ApprovalRequestRow = {
  id: string;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  requester_id: string;
  approver_id: string;
  status: ApprovalStatus;
  decision_comment: string | null;
  decided_at: string | null;
  decided_by_id: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  archived_at: string | null;
};

// canonical (camelCase) --------------------------------------------------------
export type ApprovalRequest = {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  requesterId: string;
  approverId: string;
  status: ApprovalStatus;
  decisionComment: string | null;
  decidedAt: string | null;
  decidedById: string | null;
  createdAt: string;
  archivedAt: string | null;
  // enriched (filled by queries, not columns):
  requesterName?: string;
  approverName?: string;
};

export function dbApprovalToApproval(r: ApprovalRequestRow): ApprovalRequest {
  return {
    id: r.id,
    title: r.title,
    titleAr: r.title_ar ?? '',
    description: r.description ?? '',
    descriptionAr: r.description_ar ?? '',
    requesterId: r.requester_id,
    approverId: r.approver_id,
    status: r.status,
    decisionComment: r.decision_comment,
    decidedAt: r.decided_at,
    decidedById: r.decided_by_id,
    createdAt: r.created_at,
    archivedAt: r.archived_at,
  };
}

// labels -----------------------------------------------------------------------
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, { en: string; ar: string }> = {
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  approved: { en: 'Approved', ar: 'تمت الموافقة' },
  rejected: { en: 'Rejected', ar: 'مرفوض' },
};

export function approvalStatusColor(s: ApprovalStatus): string {
  if (s === 'approved') return '#199e70';
  if (s === 'rejected') return '#e34948';
  return '#2a78d6'; // pending
}
