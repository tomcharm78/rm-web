import { createClient } from '@/lib/supabase/client';
import {
  computeVolumeScore, computeYearlyVolumeScore, computeTimelinessScore, computeOutcomesScore,
  composite, tierFromComposite, DEFAULT_WEIGHTS,
  type Weights, type PerfResult,
} from '@/lib/dashboard/scoring';

// ---- month helpers ----

// yearMonth like '2026-06'; returns [startISO, endISO) bounds
export function monthBounds(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// list recent year-months, newest first
export function recentYearMonths(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

// ---- weights ----

export async function getWeights(departmentId?: string | null): Promise<Weights> {
  const supabase = createClient();
  // prefer a department-specific row; fall back to the org default (department_id null)
  const { data } = await supabase
    .from('performance_weights')
    .select('department_id, volume_weight, timeliness_weight, outcomes_weight');
  const rows = data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptRow = departmentId ? rows.find((r: any) => r.department_id === departmentId) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgRow = rows.find((r: any) => r.department_id === null);
  const chosen = deptRow ?? orgRow;
  if (!chosen) return DEFAULT_WEIGHTS;
  return {
    volume: chosen.volume_weight,
    timeliness: chosen.timeliness_weight,
    outcomes: chosen.outcomes_weight,
  };
}

// ---- the core: compute one person's month live from real data ----

export async function getMonthlyPerformance(userId: string, yearMonth: string): Promise<PerfResult> {
  const supabase = createClient();
  const { start, end } = monthBounds(yearMonth);

  // 1) tasks assigned to this user that reached 'done' — closure timestamp from status history
  // fetch this user's tasks + their due dates + start
  const { data: myTasks } = await supabase
    .from('tasks')
    .select('id, tat_start_at, tat_due_date, status, department_id')
    .eq('assigned_to_id', userId)
    .is('deleted_at', null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (myTasks ?? []) as any[];
  const taskIds = tasks.map((t) => t.id);

  // closure events in this month (to_status='done') from history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let closures: any[] = [];
  if (taskIds.length) {
    const { data: hist } = await supabase
      .from('task_status_history')
      .select('task_id, to_status, changed_at')
      .in('task_id', taskIds)
      .eq('to_status', 'done')
      .gte('changed_at', start)
      .lt('changed_at', end);
    closures = hist ?? [];
  }

  // dedupe: one closure per task (a task could be reopened+closed; take the latest in-month)
  const closedInMonth = new Map<string, string>(); // taskId -> changed_at
  for (const c of closures) {
    const prev = closedInMonth.get(c.task_id);
    if (!prev || c.changed_at > prev) closedInMonth.set(c.task_id, c.changed_at);
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  let onTime = 0;
  let totalClosureDays = 0;
  let closedCount = 0;
  let deptId: string | null = null;

  for (const [taskId, closedAt] of closedInMonth) {
    const t = taskById.get(taskId);
    if (!t) continue;
    closedCount++;
    deptId = deptId ?? t.department_id ?? null;
    // on-time = closed on/before due date
    if (t.tat_due_date && new Date(closedAt) <= new Date(t.tat_due_date)) onTime++;
    // closure speed
    if (t.tat_start_at) {
      const days = (new Date(closedAt).getTime() - new Date(t.tat_start_at).getTime()) / (1000 * 60 * 60 * 24);
      if (days >= 0) totalClosureDays += days;
    }
  }
  const avgClosureDays = closedCount > 0 ? totalClosureDays / closedCount : 0;

  // 2) challenges resolved/closed by this user in the month
  const { data: myChallenges } = await supabase
    .from('challenges')
    .select('id, status, closed_by_id, assigned_to_id, closed_at')
    .is('deleted_at', null)
    .or(`assigned_to_id.eq.${userId},closed_by_id.eq.${userId}`)
    .in('status', ['resolved', 'closed'])
    .gte('closed_at', start)
    .lt('closed_at', end);
  const challengesResolved = (myChallenges ?? []).length;

  // 3) survey average — investors this user handled? For v1, org-level survey avg
  // (attributing surveys to a specific RM needs a link we don't have yet), so leave null
  // unless a per-user signal exists later. Keeps outcomes honest (falls back to tasks).
  const surveyAvg: number | null = null;

  // 4) weights (department override or org default)
  const weights = await getWeights(deptId);

  // 5) score
  const volumeScore = computeVolumeScore(closedCount);
  const timelinessScore = computeTimelinessScore({ closed: closedCount, onTime, avgClosureDays });
  const outcomes = computeOutcomesScore({ challengesResolved, tasksClosed: closedCount, surveyAvg });
  const compositeScore = composite(
    { volume: volumeScore, timeliness: timelinessScore, outcomes: outcomes.score },
    weights,
  );

  return {
    yearMonth,
    tasksClosed: closedCount,
    tasksOnTime: onTime,
    challengesResolved,
    avgClosureDays: Math.round(avgClosureDays * 10) / 10,
    surveyAvg,
    volumeScore,
    timelinessScore,
    outcomesScore: outcomes.score,
    outcomesBasis: outcomes.basis,
    composite: compositeScore,
    tier: tierFromComposite(compositeScore),
    weights,
  };
}

// yearly = aggregate of the 12 months of a year (or year-to-date)
export async function getYearlyPerformance(userId: string, year: number): Promise<PerfResult> {
  const now = new Date();
  const lastMonth = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
  const months: string[] = [];
  for (let m = 1; m <= lastMonth; m++) months.push(`${year}-${String(m).padStart(2, '0')}`);

  const results = await Promise.all(months.map((ym) => getMonthlyPerformance(userId, ym)));

  // aggregate raw counts across the year, then re-score on the totals
  const tasksClosed = results.reduce((s, r) => s + r.tasksClosed, 0);
  const tasksOnTime = results.reduce((s, r) => s + r.tasksOnTime, 0);
  const challengesResolved = results.reduce((s, r) => s + r.challengesResolved, 0);
  const closureDaysWeighted = results.reduce((s, r) => s + r.avgClosureDays * r.tasksClosed, 0);
  const avgClosureDays = tasksClosed > 0 ? closureDaysWeighted / tasksClosed : 0;
  const weights = results[results.length - 1]?.weights ?? DEFAULT_WEIGHTS;

  // yearly volume: cumulative total against year-scaled baselines
  // (monthly 3/5/12/20 → yearly ~12/30/72/120, i.e. sustained monthly pace)
  const volumeScore = computeYearlyVolumeScore(tasksClosed);
  const timelinessScore = computeTimelinessScore({ closed: tasksClosed, onTime: tasksOnTime, avgClosureDays });
  const outcomes = computeOutcomesScore({ challengesResolved, tasksClosed, surveyAvg: null });
  const compositeScore = composite(
    { volume: volumeScore, timeliness: timelinessScore, outcomes: outcomes.score }, weights,
  );

  return {
    yearMonth: String(year),
    tasksClosed, tasksOnTime, challengesResolved,
    avgClosureDays: Math.round(avgClosureDays * 10) / 10,
    surveyAvg: null,
    volumeScore, timelinessScore, outcomesScore: outcomes.score, outcomesBasis: outcomes.basis,
    composite: compositeScore, tier: tierFromComposite(compositeScore), weights,
  };
}
