// KPI SCORECARD data — one card per department goal.
// Pulls: the goal (+ quarterly targets, unit), its parent deputyship goal, its
// owning department (= مالك المؤشر), and the tasks linked to it with completion.
import { createClient } from '@/lib/supabase/client';

export type ScorecardTask = {
  id: string;
  title: string;
  titleAr: string;
  status: string;
  completionPct: number; // derived below
};

export type Scorecard = {
  goalId: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  year: number;
  q1: number; q2: number; q3: number; q4: number;
  targetType: string;   // count | percentage | sar
  unitLabel: string;
  currentValue: number;
  departmentName: string;
  departmentNameAr: string;
  deputyshipGoalTitle: string;
  deputyshipGoalTitleAr: string;
  tasks: ScorecardTask[];
};

// Tasks have no numeric completion column; derive a sensible % from status.
function taskCompletion(status: string): number {
  switch (status) {
    case 'done': return 100;
    case 'in_progress': return 50;
    case 'blocked': return 25;
    default: return 0; // pending / cancelled
  }
}

export async function getScorecards(deptId: string | null, year: number): Promise<Scorecard[]> {
  const supabase = createClient();

  let goalsQ = supabase
    .from('department_goals')
    .select(`
      id, title, title_ar, description, description_ar, year,
      q1_target, q2_target, q3_target, q4_target,
      target_type, unit_label, current_value,
      departments(name, name_ar),
      deputyship_goal:strategic_goals!department_goals_deputyship_goal_id_fkey(title, title_ar)
    `)
    .eq('status', 'active')
    .eq('year', year)
    .order('department_id')
    .order('created_at');
  if (deptId) goalsQ = goalsQ.eq('department_id', deptId);

  const { data: goals, error } = await goalsQ;
  if (error) { console.error('[getScorecards] goals:', error); throw new Error(error.message); }
  if (!goals || goals.length === 0) return [];

  // Linked tasks for all goals in one read.
  const goalIds = goals.map((g) => g.id as string);
  const { data: links } = await supabase
    .from('task_goals')
    .select('department_goal_id, tasks(id, title, title_ar, status, completion_percentage)')
    .in('department_goal_id', goalIds);

  const tasksByGoal = new Map<string, ScorecardTask[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of (links ?? []) as any[]) {
    if (!l.tasks) continue;
    const list = tasksByGoal.get(l.department_goal_id) ?? [];
    list.push({
      id: l.tasks.id,
      title: l.tasks.title ?? '',
      titleAr: l.tasks.title_ar ?? '',
      status: l.tasks.status ?? '',
      completionPct: l.tasks.completion_percentage ?? taskCompletion(l.tasks.status ?? ''),
    });
    tasksByGoal.set(l.department_goal_id, list);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (goals as any[]).map((g) => ({
    goalId: g.id,
    title: g.title ?? '',
    titleAr: g.title_ar ?? '',
    description: g.description ?? '',
    descriptionAr: g.description_ar ?? '',
    year: g.year,
    q1: g.q1_target ?? 0, q2: g.q2_target ?? 0, q3: g.q3_target ?? 0, q4: g.q4_target ?? 0,
    targetType: g.target_type ?? 'count',
    unitLabel: g.unit_label ?? '',
    currentValue: Number(g.current_value ?? 0),
    departmentName: g.departments?.name ?? '',
    departmentNameAr: g.departments?.name_ar ?? '',
    deputyshipGoalTitle: g.deputyship_goal?.title ?? '',
    deputyshipGoalTitleAr: g.deputyship_goal?.title_ar ?? '',
    tasks: tasksByGoal.get(g.id) ?? [],
  }));
}
