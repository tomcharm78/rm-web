import { createClient } from '@/lib/supabase/client';
import {
  dbVacationToVacation, rangesOverlap, isFutureLeave,
  type VacationRequest, type VacationRequestInput, type VacationRequestRow,
  type ConflictEntry, type VacationStatus,
} from '@/types/vacation';

// ---- listing (RLS already scopes: own + direct reports + super) ----
// view: 'mine' = my own requests; 'team' = my direct reports' requests (manager view)
export async function listVacations(view: 'mine' | 'team' | 'all'): Promise<VacationRequest[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let q = supabase.from('vacation_requests').select('*').is('deleted_at', null).is('archived_at', null).order('created_at', { ascending: false });

  if (view === 'mine') {
    q = q.eq('user_id', user.id);
  } else if (view === 'team') {
    // direct reports' user_ids
    const { data: reports } = await supabase.from('users').select('id').eq('admin_id', user.id).is('deleted_at', null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = (reports ?? []).map((r: any) => r.id);
    if (!ids.length) return [];
    q = q.in('user_id', ids);
  }
  // 'all' (super) → no extra filter, RLS returns everything

  const { data, error } = await q;
  if (error) { console.error('[listVacations]', error); throw new Error(error.message); }
  const rows = (data as VacationRequestRow[]).map(dbVacationToVacation);

  // enrich with requester + approver names
  const userIds = Array.from(new Set(rows.flatMap((r) => [r.userId, r.approverId].filter(Boolean) as string[])));
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, name, name_ar').in('id', userIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameById = new Map((users ?? []).map((u: any) => [u.id, { name: u.name as string, nameAr: (u.name_ar ?? '') as string }]));
    for (const r of rows) {
      const req = nameById.get(r.userId);
      if (req) { r.requesterName = req.name; r.requesterNameAr = req.nameAr; }
      if (r.approverId) r.approverName = nameById.get(r.approverId)?.name;
    }
  }
  return rows;
}

// ---- conflict detection: who else in the SAME DEPARTMENT is off during these dates ----
export async function computeConflicts(startDate: string, endDate: string, excludeUserId?: string): Promise<ConflictEntry[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // my department
  const { data: me } = await supabase.from('users').select('department_id').eq('id', user.id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptId = (me as any)?.department_id;
  if (!deptId) return [];

  // department members
  const { data: members } = await supabase.from('users').select('id, name').eq('department_id', deptId).is('deleted_at', null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberRows = (members ?? []) as any[];
  const memberIds = memberRows.filter((m) => m.id !== (excludeUserId ?? user.id)).map((m) => m.id);
  if (!memberIds.length) return [];
  const nameById = new Map(memberRows.map((m) => [m.id, m.name as string]));

  // their approved/pending requests that overlap the window
  const { data: others } = await supabase.from('vacation_requests')
    .select('user_id, start_date, end_date, status')
    .in('user_id', memberIds).is('deleted_at', null)
    .in('status', ['approved', 'pending']);

  const conflicts: ConflictEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (others ?? []) as any[]) {
    if (rangesOverlap(startDate, endDate, o.start_date, o.end_date)) {
      conflicts.push({ userId: o.user_id, name: nameById.get(o.user_id) ?? '', startDate: o.start_date, endDate: o.end_date });
    }
  }
  return conflicts;
}

// ---- create (self) ----
export async function createVacation(input: VacationRequestInput): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  // guard: block a self-overlapping pending/approved request
  const { data: mine } = await supabase.from('vacation_requests')
    .select('start_date, end_date')
    .eq('user_id', user.id).is('deleted_at', null)
    .in('status', ['pending', 'approved']);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (mine ?? []) as any[]) {
    if (input.startDate <= m.end_date && m.start_date <= input.endDate) {
      throw new Error('You already have a leave request that overlaps these dates.');
    }
  }

  // compute conflicts at creation time (stored for the approver to see)
  const conflicts = await computeConflicts(input.startDate, input.endDate);

  const { error } = await supabase.from('vacation_requests').insert({
    user_id: user.id,
    leave_type: input.leaveType,
    leave_type_other: input.leaveType === 'other' ? (input.leaveTypeOther ?? '').trim() : null,
    start_date: input.startDate,
    end_date: input.endDate,
    reason: input.reason.trim(),
    status: 'pending',
    conflicts: conflicts,
  });
  if (error) { console.error('[createVacation]', error); throw new Error(error.message); }
}

// ---- approve (direct manager or super) ----
export async function approveVacation(id: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const { error } = await supabase.from('vacation_requests')
    .update({ status: 'approved' as VacationStatus, approver_id: user.id, rejection_reason: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending');
  if (error) { console.error('[approveVacation]', error); throw new Error(error.message); }
}

// ---- reject (direct manager or super) with reason ----
export async function rejectVacation(id: string, reason: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const { error } = await supabase.from('vacation_requests')
    .update({ status: 'rejected' as VacationStatus, approver_id: user.id, rejection_reason: reason.trim(), updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending');
  if (error) { console.error('[rejectVacation]', error); throw new Error(error.message); }
}

// ---- cancel (requester, future-dated pending/approved only) ----
export async function cancelVacation(id: string, startDate: string, status: VacationStatus): Promise<void> {
  if (!isFutureLeave(startDate)) throw new Error('Only future-dated leave can be cancelled.');
  if (status !== 'pending' && status !== 'approved') throw new Error('Only pending or approved leave can be cancelled.');
  const supabase = createClient();
  const { error } = await supabase.from('vacation_requests')
    .update({ status: 'cancelled' as VacationStatus, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('[cancelVacation]', error); throw new Error(error.message); }
}

// ---- my next approved upcoming leave (for the dashboard countdown) ----
export async function getMyUpcomingLeave(): Promise<VacationRequest | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('vacation_requests')
    .select('*').eq('user_id', user.id).eq('status', 'approved')
    .gt('start_date', today).is('deleted_at', null)
    .order('start_date', { ascending: true }).limit(1);
  if (error) { console.error('[getMyUpcomingLeave]', error); return null; }
  if (!data || !data.length) return null;
  return dbVacationToVacation(data[0] as VacationRequestRow);
}

// ---- pending approvals count for a manager (dashboard tile) ----
export async function getPendingApprovalsCount(): Promise<number> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data: reports } = await supabase.from('users').select('id').eq('admin_id', user.id).is('deleted_at', null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = (reports ?? []).map((r: any) => r.id);
  if (!ids.length) return 0;
  const { count } = await supabase.from('vacation_requests')
    .select('id', { count: 'exact', head: true })
    .in('user_id', ids).eq('status', 'pending').is('deleted_at', null);
  return count ?? 0;
}
// ---- archive (manager/super) ----
export async function archiveVacation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('vacation_requests')
    .update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('[archiveVacation]', error); throw new Error(error.message); }
}
// ---- team leave for the 3-month Gantt (admin=direct reports, super=all) ----
export type TeamLeaveRow = {
  id: string;
  userId: string;
  name: string;
  nameAr: string;
  leaveType: string;
  leaveTypeOther: string | null;
  startDate: string;
  endDate: string;
};

export async function getTeamLeaveWindow(scope: 'team' | 'all', fromDate: string, toDate: string): Promise<TeamLeaveRow[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let userIds: string[] | null = null;
  if (scope === 'team') {
    const { data: reports } = await supabase.from('users').select('id').eq('admin_id', user.id).is('deleted_at', null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userIds = (reports ?? []).map((r: any) => r.id);
    if (!userIds.length) return [];
  }

  let q = supabase.from('vacation_requests')
    .select('id, user_id, leave_type, leave_type_other, start_date, end_date')
    .eq('status', 'approved').is('deleted_at', null)
    .lte('start_date', toDate).gte('end_date', fromDate); // overlaps the window
  if (userIds) q = q.in('user_id', userIds);

  const { data, error } = await q;
  if (error) { console.error('[getTeamLeaveWindow]', error); return []; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];

  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const nameById = new Map<string, { name: string; nameAr: string }>();
  if (ids.length) {
    const { data: users } = await supabase.from('users').select('id, name, name_ar').in('id', ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (users ?? []) as any[]) nameById.set(u.id, { name: u.name, nameAr: u.name_ar ?? '' });
  }

  return rows.map((r) => ({
    id: r.id, userId: r.user_id,
    name: nameById.get(r.user_id)?.name ?? '', nameAr: nameById.get(r.user_id)?.nameAr ?? '',
    leaveType: r.leave_type, leaveTypeOther: r.leave_type_other,
    startDate: r.start_date, endDate: r.end_date,
  }));
}