import { createClient } from '@/lib/supabase/client';
import {
  currentQuarter, quarterBounds, quarterTarget, quarterElapsedFraction,
  paceStatus, type PaceStatus, type Quarter,
} from '@/types/kpi';

// ---- per executive-goal progress vs this quarter's target ----

export type GoalProgress = {
  goalId: string;
  title: string;
  titleAr: string;
  departmentId: string;
  deputyshipGoalId: string;
  quarter: Quarter;
  target: number;
  achieved: number;
  linkedTotal: number;
  pace: PaceStatus;
  targetType: 'count' | 'percentage' | 'sar';
  unitLabel: string;
};

export async function getGoalProgress(year: number, scopeDeptId: string | null): Promise<GoalProgress[]> {
  const supabase = createClient();
  const q = currentQuarter();
  const { start, end } = quarterBounds(year, q);
  const elapsed = quarterElapsedFraction(year, q);

  // 1. executive goals in scope
  let gq = supabase.from('department_goals').select('id, title, title_ar, department_id, deputyship_goal_id, q1_target, q2_target, q3_target, q4_target, target_type, unit_label, current_value').eq('status', 'active').eq('year', year);
  if (scopeDeptId) gq = gq.eq('department_id', scopeDeptId);
  const { data: goals } = await gq;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goalRows = (goals ?? []) as any[];
  if (!goalRows.length) return [];

  const goalIds = goalRows.map((g) => g.id);

  // 2. links: which tasks / challenges serve each goal
  const { data: tLinks } = await supabase.from('task_goals').select('task_id, department_goal_id').in('department_goal_id', goalIds);
  const { data: cLinks } = await supabase.from('challenge_goals').select('challenge_id, department_goal_id').in('department_goal_id', goalIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskLinks = (tLinks ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const challengeLinks = (cLinks ?? []) as any[];

  const linkedTaskIds = Array.from(new Set(taskLinks.map((l) => l.task_id)));
  const linkedChallengeIds = Array.from(new Set(challengeLinks.map((l) => l.challenge_id)));

  // 3. which linked tasks were COMPLETED (to_status='done') this quarter
  const completedTaskIds = new Set<string>();
  if (linkedTaskIds.length) {
    const { data: hist } = await supabase.from('task_status_history')
      .select('task_id, changed_at').in('task_id', linkedTaskIds)
      .eq('to_status', 'done').gte('changed_at', start).lt('changed_at', end);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const h of (hist ?? []) as any[]) completedTaskIds.add(h.task_id);
  }

  // 4. which linked challenges are resolved/closed (use status; challenges lack a clean closed-at in scope, count current status)
  const resolvedChallengeIds = new Set<string>();
  if (linkedChallengeIds.length) {
    const { data: ch } = await supabase.from('challenges')
      .select('id, status').in('id', linkedChallengeIds).in('status', ['resolved', 'closed']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (ch ?? []) as any[]) resolvedChallengeIds.add(c.id);
  }

  // 5. tally per goal
  const taskByGoal = new Map<string, string[]>();
  for (const l of taskLinks) {
    const arr = taskByGoal.get(l.department_goal_id) ?? [];
    arr.push(l.task_id); taskByGoal.set(l.department_goal_id, arr);
  }
  const challengeByGoal = new Map<string, string[]>();
  for (const l of challengeLinks) {
    const arr = challengeByGoal.get(l.department_goal_id) ?? [];
    arr.push(l.challenge_id); challengeByGoal.set(l.department_goal_id, arr);
  }

  return goalRows.map((g) => {
    const tIds = taskByGoal.get(g.id) ?? [];
    const cIds = challengeByGoal.get(g.id) ?? [];
    const targetType = (g.target_type ?? 'count') as 'count' | 'percentage' | 'sar';
    // count goals auto-tally from completed linked work; percentage/SAR use admin-reported current_value
    const autoAchieved = tIds.filter((id) => completedTaskIds.has(id)).length + cIds.filter((id) => resolvedChallengeIds.has(id)).length;
    const achieved = targetType === 'count' ? autoAchieved : Number(g.current_value ?? 0);
    const target = quarterTarget(
      { q1Target: g.q1_target, q2Target: g.q2_target, q3Target: g.q3_target, q4Target: g.q4_target }, q
    );
    return {
      goalId: g.id, title: g.title, titleAr: g.title_ar ?? '',
      departmentId: g.department_id, deputyshipGoalId: g.deputyship_goal_id,
      quarter: q, target, achieved,
      linkedTotal: tIds.length + cIds.length,
      pace: paceStatus(achieved, target, elapsed),
      targetType, unitLabel: g.unit_label ?? '',
    };
  });
}

// ---- per-department alignment: completed work that served goals vs unaligned ----

export type DeptAlignment = {
  departmentId: string;
  alignedCompleted: number;   // completed tasks that were linked to >=1 goal
  totalCompleted: number;     // all completed tasks in the quarter
  alignmentPct: number;       // aligned / total * 100
};

export async function getDepartmentAlignment(year: number, scopeDeptId: string | null): Promise<DeptAlignment[]> {
  const supabase = createClient();
  const q = currentQuarter();
  const { start, end } = quarterBounds(year, q);

  // completed tasks this quarter (from history), with their department
  let tq = supabase.from('tasks').select('id, department_id').is('deleted_at', null);
  if (scopeDeptId) tq = tq.eq('department_id', scopeDeptId);
  const { data: tasks } = await tq;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taskRows = (tasks ?? []) as any[];
  const taskDept = new Map<string, string | null>(taskRows.map((t) => [t.id, t.department_id ?? null]));
  const taskIds = taskRows.map((t) => t.id);
  if (!taskIds.length) return [];

  // completed this quarter
  const completed = new Set<string>();
  const { data: hist } = await supabase.from('task_status_history')
    .select('task_id, changed_at').in('task_id', taskIds)
    .eq('to_status', 'done').gte('changed_at', start).lt('changed_at', end);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (hist ?? []) as any[]) completed.add(h.task_id);

  // which are linked to any goal
  const { data: links } = await supabase.from('task_goals').select('task_id').in('task_id', Array.from(completed).length ? Array.from(completed) : ['x']);
  const linkedTasks = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (links ?? []) as any[]) linkedTasks.add(l.task_id);

  // tally per department
  const agg = new Map<string, { aligned: number; total: number }>();
  for (const tid of completed) {
    const dept = taskDept.get(tid);
    if (!dept) continue;
    const cur = agg.get(dept) ?? { aligned: 0, total: 0 };
    cur.total += 1;
    if (linkedTasks.has(tid)) cur.aligned += 1;
    agg.set(dept, cur);
  }

  return Array.from(agg.entries()).map(([departmentId, v]) => ({
    departmentId,
    alignedCompleted: v.aligned,
    totalCompleted: v.total,
    alignmentPct: v.total > 0 ? Math.round((v.aligned / v.total) * 100) : 0,
  }));
}
