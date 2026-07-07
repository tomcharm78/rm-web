import { createClient } from '@/lib/supabase/client';

export type LinkageRow = {
  kind: 'task' | 'challenge';
  id: string;
  title: string;
  titleAr: string;
  departmentId: string | null;
  linked: boolean;
  goalTitles: string[];
  status: 'open' | 'closed';
  dueDate: string | null;
  href: string;
};

// admin = own department; super = all (scopeDeptId null).
export async function getLinkageOverview(scopeDeptId: string | null): Promise<LinkageRow[]> {
  const supabase = createClient();

  // ---- tasks (have department_id directly) ----
  let tq = supabase.from('tasks').select('id, title, title_ar, department_id, status, tat_due_date').is('deleted_at', null);
  if (scopeDeptId) tq = tq.eq('department_id', scopeDeptId);
  const { data: tasks } = await tq;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskRows = (tasks ?? []) as any[];

  // ---- challenges (derive department from assignee) ----
  const { data: challenges } = await supabase
    .from('challenges')
    .select('id, title, title_ar, status, assigned_to_id');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const challengeRows = (challenges ?? []) as any[];

  // map assignee -> department for challenge scoping
  const assigneeIds = Array.from(new Set(challengeRows.map((c) => c.assigned_to_id).filter(Boolean)));
  const deptByUser = new Map<string, string | null>();
  if (assigneeIds.length) {
    const { data: users } = await supabase.from('users').select('id, department_id').in('id', assigneeIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of (users ?? []) as any[]) deptByUser.set(u.id, u.department_id ?? null);
  }

  // ---- links (with goal titles) ----
  const { data: taskLinks } = await supabase.from('task_goals').select('task_id, department_goals(title, title_ar)');
  const { data: challengeLinks } = await supabase.from('challenge_goals').select('challenge_id, department_goals(title, title_ar)');

  const taskGoalMap = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (taskLinks ?? []) as any[]) {
    if (!l.department_goals) continue;
    const arr = taskGoalMap.get(l.task_id) ?? [];
    arr.push(l.department_goals.title);
    taskGoalMap.set(l.task_id, arr);
  }
  const challengeGoalMap = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (challengeLinks ?? []) as any[]) {
    if (!l.department_goals) continue;
    const arr = challengeGoalMap.get(l.challenge_id) ?? [];
    arr.push(l.department_goals.title);
    challengeGoalMap.set(l.challenge_id, arr);
  }

  const taskClosed = (s: string) => s === 'done' || s === 'cancelled';
  const challengeClosed = (s: string) => s === 'resolved' || s === 'closed';

  const rows: LinkageRow[] = [];

  for (const t of taskRows) {
    const goals = taskGoalMap.get(t.id) ?? [];
    rows.push({
      kind: 'task', id: t.id, title: t.title, titleAr: t.title_ar ?? '',
      departmentId: t.department_id ?? null,
      linked: goals.length > 0, goalTitles: goals,
      status: taskClosed(t.status) ? 'closed' : 'open',
      dueDate: t.tat_due_date ?? null,
      href: `/tasks/${t.id}`,
    });
  }
  for (const c of challengeRows) {
    const deptId = c.assigned_to_id ? (deptByUser.get(c.assigned_to_id) ?? null) : null;
    // scope: if admin (scopeDeptId set), only include challenges whose assignee is in that department
    if (scopeDeptId && deptId !== scopeDeptId) continue;
    const goals = challengeGoalMap.get(c.id) ?? [];
    rows.push({
      kind: 'challenge', id: c.id, title: c.title, titleAr: c.title_ar ?? '',
      departmentId: deptId,
      linked: goals.length > 0, goalTitles: goals,
      status: challengeClosed(c.status) ? 'closed' : 'open',
      dueDate: null,
      href: `/challenges/${c.id}`,
    });
  }

  // surface unlinked-open items first (they need attention)
  rows.sort((a, b) => {
    const aPri = (!a.linked && a.status === 'open') ? 0 : 1;
    const bPri = (!b.linked && b.status === 'open') ? 0 : 1;
    return aPri - bPri;
  });

  return rows;
}
