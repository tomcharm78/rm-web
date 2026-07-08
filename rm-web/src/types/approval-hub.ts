// Approvals aggregation hub — shared types.
//
// The hub is a READ-LAYER over four existing approval sources. It does NOT own
// any approve/reject logic; each adapter maps its source rows into the single
// UnifiedApproval shape below, and the hub calls each source's EXISTING
// approve/reject mutation. Nothing in the underlying flows is rewired.
//
// Sources (kinds):
//   task_closure  -> flags on the `tasks` row (closure_requested_at, etc.)
//   transfer      -> `transfer_requests` table
//   vacation      -> vacation rows (status column)
//   letter        -> `approval_requests` table (Phase 1)

export type ApprovalKind = 'task_closure' | 'transfer' | 'vacation' | 'letter';

export type ApprovalHubStatus = 'pending' | 'approved' | 'rejected';

// One normalized row displayed in the hub, regardless of source.
export type UnifiedApproval = {
  // Composite identity: kind + the source row id. Unique across the merged list.
  key: string; // `${kind}:${sourceId}`
  kind: ApprovalKind;
  sourceId: string; // the id to pass to the source's approve/reject mutation

  title: string;
  titleAr: string;

  // Free-text context shown under the title (closure statement, transfer reason,
  // vacation dates+reason, letter description). Optional.
  detail: string | null;
  detailAr: string | null;

  requesterId: string | null;
  requesterName: string;
  requesterNameAr: string;

  departmentId: string | null;
  departmentName: string;
  departmentNameAr: string;

  status: ApprovalHubStatus;
  createdAt: string; // ISO — drives FIFO (ascending)
  decidedAt: string | null;
  decisionComment: string | null;

  // Where the link icon jumps to. null = no detail route (stays in hub).
  detailHref: string | null;

  // Extra ids some mutations need (e.g. transfer approve needs taskId + targetUserId).
  meta?: Record<string, string | null>;
};

// Labels for the kind badge (EN/AR).
export const APPROVAL_KIND_LABELS: Record<ApprovalKind, { en: string; ar: string }> = {
  task_closure: { en: 'Task closure', ar: 'إغلاق مهمة' },
  transfer: { en: 'Task transfer', ar: 'نقل مهمة' },
  vacation: { en: 'Leave request', ar: 'طلب إجازة' },
  letter: { en: 'Letter / proposal', ar: 'خطاب / مقترح' },
};
