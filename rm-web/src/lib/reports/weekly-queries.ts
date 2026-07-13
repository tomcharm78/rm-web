// WEEKLY REPORT queries — the *delta* report ("what moved this week"), as
// distinct from Report 1's *state* report ("how things stand").
//
// Design principle: direct attention, don't dump metrics. Three sections:
//   §1 Movement  — new / closed / carried-over (overdue = severity WITHIN carried)
//   §2 Capacity  — who's available, how loaded, employee ACTIVITY (never scored)
//   §3 Attention — overdue & stalled watchlist (named), approvals bottlenecks
//
// RLS scopes every read: super/pmo org-wide, admin their department, pm assigned.
import { createClient } from '@/lib/supabase/client';

const OPEN_TASK_STATUSES = ['pending', 'in_progress', 'blocked'];
const ACTIVE_CHALLENGE_STATUSES = ['open', 'investigating', 'mitigation_in_progress'];
const CLOSED_TASK_STATUSES = ['done'];
const RESOLVED_CHALLENGE_STATUSES = ['resolved', 'closed'];

/** The Monday→Sunday window containing `ref` (defaults to now). */
/** The Sunday→Saturday window containing `ref`. Saudi weeks start on Sunday. */
export function weekWindow(ref: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(ref);
  const day = d.getDay(); // Sunday = 0 — the Saudi week start
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

// ---------------------------------------------------------------- §1 MOVEMENT
export type MovementBucket = {
  label: string;
  labelAr: string;
  newCount: number;
  closedCount: number;
  carriedOver: number;    // still open, created BEFORE this week
  overdueInCarried: number; // severity within carried-over — not a separate bucket
};

export type Movement = {
  tasks: MovementBucket;
  challenges: MovementBucket;
  investors: MovementBucket;
  sessionsHeld: number;
  challengeProgress: { id: string; title: string; titleAr: string; pct: number }[];
};

export async function getWeeklyMovement(ref: Date = new Date()): Promise<Movement> {
  const supabase = createClient();
  const { start, end } = weekWindow(ref);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const nowIso = new Date().toISOString();

  // --- tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, status, created_at, updated_at, tat_due_date')
    .is('deleted_at', null);
  const t = tasks ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tNew = t.filter((x: any) => x.created_at >= startIso && x.created_at < endIso).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tClosed = t.filter((x: any) => CLOSED_TASK_STATUSES.includes(x.status) && x.updated_at >= startIso && x.updated_at < endIso).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tCarried = t.filter((x: any) => OPEN_TASK_STATUSES.includes(x.status) && x.created_at < startIso);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tOverdue = tCarried.filter((x: any) => x.tat_due_date && x.tat_due_date < nowIso).length;

  // --- challenges
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id, title, title_ar, status, completion_percentage, created_at, updated_at')
    .is('deleted_at', null);
  const c = challenges ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cNew = c.filter((x: any) => x.created_at >= startIso && x.created_at < endIso).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cClosed = c.filter((x: any) => RESOLVED_CHALLENGE_STATUSES.includes(x.status) && x.updated_at >= startIso && x.updated_at < endIso).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cCarried = c.filter((x: any) => ACTIVE_CHALLENGE_STATUSES.includes(x.status) && x.created_at < startIso);
  // Challenges are long-running — their progress % is the signal, so surface it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const challengeProgress = c
    .filter((x: any) => ACTIVE_CHALLENGE_STATUSES.includes(x.status))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((x: any) => ({ id: x.id, title: x.title, titleAr: x.title_ar ?? '', pct: x.completion_percentage ?? 0 }))
    .sort((a, b) => a.pct - b.pct);

  // --- investors (no status column — "onboarded" = created)
  const { data: investors } = await supabase
    .from('investors')
    .select('id, created_at')
    .is('deleted_at', null);
  const inv = investors ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iNew = inv.filter((x: any) => x.created_at >= startIso && x.created_at < endIso).length;

  // --- sessions held this week
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, meeting_date')
    .gte('meeting_date', startIso)
    .lt('meeting_date', endIso)
    .is('deleted_at', null);

  return {
    tasks: {
      label: 'Tasks', labelAr: 'المهام',
      newCount: tNew, closedCount: tClosed,
      carriedOver: tCarried.length, overdueInCarried: tOverdue,
    },
    challenges: {
      label: 'Challenges', labelAr: 'التحديات',
      newCount: cNew, closedCount: cClosed,
      carriedOver: cCarried.length, overdueInCarried: 0,
    },
    investors: {
      label: 'Investors onboarded', labelAr: 'المستثمرون الجدد',
      newCount: iNew, closedCount: 0, carriedOver: 0, overdueInCarried: 0,
    },
    sessionsHeld: (sessions ?? []).length,
    challengeProgress,
  };
}

// ---------------------------------------------------------------- §2 CAPACITY
export type CapacityPerson = {
  userId: string;
  name: string;
  nameAr: string;
  departmentName: string;
  onLeave: boolean;
  leaveFrom?: string;
  leaveTo?: string;
  // ACTIVITY ONLY — deliberately not a performance score. Weekly scoring is
  // statistically noisy and risks becoming surveillance; scored performance
  // belongs to the monthly/quarterly cadence.
  tasksClosed: number;
  sessionsHeld: number;
};

export async function getWeeklyCapacity(ref: Date = new Date()): Promise<CapacityPerson[]> {
  const supabase = createClient();
  const { start, end } = weekWindow(ref);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const startDate = startIso.slice(0, 10);
  const endDate = endIso.slice(0, 10);

  const { data: users } = await supabase
    .from('users')
    .select('id, name, name_ar, departments!users_department_id_fkey(name, name_ar)')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');

  // Approved leave overlapping this week.
  const { data: leave } = await supabase
    .from('vacation_requests')
    .select('user_id, start_date, end_date')
    .eq('status', 'approved')
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .is('deleted_at', null);
  const leaveByUser = new Map<string, { from: string; to: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (leave ?? []) as any[]) leaveByUser.set(l.user_id, { from: l.start_date, to: l.end_date });

  // Activity: tasks closed this week.
  const { data: closed } = await supabase
    .from('tasks')
    .select('assigned_to_id')
    .in('status', CLOSED_TASK_STATUSES)
    .gte('updated_at', startIso)
    .lt('updated_at', endIso)
    .is('deleted_at', null);
  const closedByUser = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (closed ?? []) as any[]) {
    if (t.assigned_to_id) closedByUser.set(t.assigned_to_id, (closedByUser.get(t.assigned_to_id) ?? 0) + 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((users ?? []) as any[]).map((u) => {
    const lv = leaveByUser.get(u.id);
    return {
      userId: u.id,
      name: u.name ?? '',
      nameAr: u.name_ar ?? '',
      departmentName: u.departments?.name ?? '',
      onLeave: !!lv,
      leaveFrom: lv?.from,
      leaveTo: lv?.to,
      tasksClosed: closedByUser.get(u.id) ?? 0,
      sessionsHeld: 0,
    };
  });
}

// ---------------------------------------------------------------- §3 ATTENTION
export type WatchItem = {
  id: string;
  kind: 'task' | 'challenge';
  title: string;
  titleAr: string;
  assigneeName: string;
  daysOverdue?: number;
  pct?: number;
  reason: string;   // why it's on the watchlist
  reasonAr: string;
};

/** Named overdue tasks + stalled challenges — the "needs your attention" page. */
export async function getWeeklyAttention(): Promise<WatchItem[]> {
  const supabase = createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const items: WatchItem[] = [];

  // Overdue tasks, worst first.
  const { data: overdue } = await supabase
    .from('tasks')
    .select('id, title, title_ar, tat_due_date, users!tasks_assigned_to_id_fkey(name, name_ar)')
    .in('status', OPEN_TASK_STATUSES)
    .lt('tat_due_date', nowIso)
    .is('deleted_at', null)
    .order('tat_due_date', { ascending: true })
    .limit(25);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (overdue ?? []) as any[]) {
    const days = Math.floor((now.getTime() - new Date(t.tat_due_date).getTime()) / 86400000);
    items.push({
      id: t.id, kind: 'task',
      title: t.title ?? '', titleAr: t.title_ar ?? '',
      assigneeName: t.users?.name ?? '—',
      daysOverdue: days,
      reason: `Overdue by ${days} day(s)`,
      reasonAr: `متأخرة ${days} يوم`,
    });
  }

  // Stalled challenges — active but little/no progress.
  const { data: stalled } = await supabase
    .from('challenges')
    .select('id, title, title_ar, completion_percentage, users!challenges_assigned_to_id_fkey(name, name_ar)')
    .in('status', ACTIVE_CHALLENGE_STATUSES)
    .lte('completion_percentage', 25)
    .is('deleted_at', null)
    .order('completion_percentage', { ascending: true })
    .limit(15);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (stalled ?? []) as any[]) {
    items.push({
      id: c.id, kind: 'challenge',
      title: c.title ?? '', titleAr: c.title_ar ?? '',
      assigneeName: c.users?.name ?? '—',
      pct: c.completion_percentage ?? 0,
      reason: `Stalled at ${c.completion_percentage ?? 0}%`,
      reasonAr: `متعثر عند ${c.completion_percentage ?? 0}%`,
    });
  }

  return items;
}

// ---- approvals bottlenecks: what's waiting, and WHO is sitting on it
export type ApprovalBottleneck = {
  kind: string;
  title: string;
  approverName: string;
  daysWaiting: number;
};

export async function getApprovalBottlenecks(): Promise<{
  pendingTotal: number;
  oldestDays: number;
  items: ApprovalBottleneck[];
}> {
  const supabase = createClient();
  const now = Date.now();
  const items: ApprovalBottleneck[] = [];

  // Letters / proposals awaiting a decision.
  const { data: reqs } = await supabase
    .from('approval_requests')
    .select('id, title, created_at, status, users!approval_requests_approver_id_fkey(name)')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (reqs ?? []) as any[]) {
    items.push({
      kind: 'letter',
      title: r.title ?? '',
      approverName: r.users?.name ?? '—',
      daysWaiting: Math.floor((now - new Date(r.created_at).getTime()) / 86400000),
    });
  }

  // Leave requests awaiting approval.
  const { data: leave } = await supabase
    .from('vacation_requests')
    .select('id, created_at, users!vacation_requests_approver_id_fkey(name)')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (leave ?? []) as any[]) {
    items.push({
      kind: 'leave',
      title: 'Leave request',
      approverName: l.users?.name ?? '—',
      daysWaiting: Math.floor((now - new Date(l.created_at).getTime()) / 86400000),
    });
  }

  items.sort((a, b) => b.daysWaiting - a.daysWaiting);
  return {
    pendingTotal: items.length,
    oldestDays: items[0]?.daysWaiting ?? 0,
    items: items.slice(0, 15),
  };
}
