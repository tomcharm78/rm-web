export type Admin1Status = 'pending' | 'approved' | 'rejected';
export type TaskForceStatus =
  | 'requested' | 'sourcing' | 'active' | 'completed' | 'rejected' | 'cancelled';
export type BorrowStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type TaskForceRequest = {
  id: string;
  taskId: string;
  subtaskId: string;
  requestedBy: string;
  requestNote: string;
  managingAdminId: string | null;
  admin1Status: Admin1Status;
  admin1RejectedReason: string | null;
  status: TaskForceStatus;
  createdAt: string;
  taskTitle?: string;     // enrichment (Admin 1 / lead views, same dept)
  taskTitleAr?: string;
};

export type TaskForceBorrow = {
  id: string;
  requestId: string;
  toAdminId: string;
  toDepartmentId: string | null;
  status: BorrowStatus;
  assignedMemberId: string | null;
  rejectedReason: string | null;
  createdAt: string;
  requestNote?: string;   // enrichment for the lending admin (NO task content)
  requestedBy?: string;
  subtaskId?: string;
};s