// KPI SCORECARD data — one card per department goal.
//
// Three fields the card needs are NOT stored as such:
//   • رمز المؤشر (code)      -> DERIVED: DD-KK. DD is the department's ordinal by
//     creation order; KK is the goal's ordinal within that department, also by
//     creation order. Codes are internal, so deriving them keeps the schema lean.
//   • مصدر البيانات (source) -> the organisation's own name (always the deputyship).
//     Taken from org context rather than hardcoded, so it stays correct when a
//     second deputyship is onboarded.
//   • معادلة القياس (formula) -> the one field we DID add to the schema.
import { createClient } from '@/lib/supabase/client';

export type ScorecardTask = {
  id: string;
  title: string;
  titleAr: string;
  status: string;
  completionPct: number;
};

export type Scorecard = {
  goalId: string;
  code: string;              // DD-KK, derived
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  formula: string;
  year: number;
  q1: number; q2: number; q3: number; q4: number;
  targetType: string;
  unitLabel: string;
  currentValue: number;
  departmentName: string;
  departmentNameAr: string;
  deputyshipGoalTitle: string;
  deputyshipGoalTitleAr: string;
  orgGoalTitle: string;
  orgGoalTitleAr: string;
  tasks: ScorecardTask[];
};

function taskCompletion(status: string): number {
  switch (status) {
    case 'done': return 100;
    case 'in_progress': return 50;
    case 'blocked': return 25;
    default: return 0;
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export async function getScorecards(deptId: string | null, year: number): Promise<Scorecard[]> {
  const supabase = createClient();

  // Department ordinals: every department, ordered by creation. This must be the
  // FULL list (not the scoped one), or a filtered view would renumber departments.
  const { data: allDepts } = await supabase
    .from('departments')
    .select('id, created_at')
    .is('deleted_at', null)
    .order('created_at');
  const deptOrdinal = new Map<string, number>();
  (allDepts ?? []).forEach((d, i) => deptOrdinal.set(d.id as string, i + 1));

  // Same for goals WITHIN each department — fetch all goals for the year so the
  // ordinal is stable regardless of the scope being viewed.
  const { data: allGoals } = await supabase
    .from('department_goals')
    .select('id, department_id, created_at')
    .eq('status', 'active')
    .eq('year', year)
    .order('created_at');
  const goalOrdinal = new Map<string, number>();
  const seen = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const g of (allGoals ?? []) as any[]) {
    const n = (seen.get(g.department_id) ?? 0) + 1;
    seen.set(g.department_id, n);
    goalOrdinal.set(g.id, n);
  }

  let goalsQ = supabase
    .from('department_goals')
    .select(`
      id, department_id, title, title_ar, description, description_ar, formula, year,
      q1_target, q2_target, q3_target, q4_target,
      target_type, unit_label, current_value,
      departments(name, name_ar),
      deputyship_goal_id,
      deputyship_goal:strategic_goals!department_goals_deputyship_goal_id_fkey(title, title_ar, parent_goal_id)
    `)
    .eq('status', 'active')
    .eq('year', year)
    .order('department_id')
    .order('created_at');
  if (deptId) goalsQ = goalsQ.eq('department_id', deptId);

  const { data: goals, error } = await goalsQ;
  if (error) { console.error('[getScorecards] goals:', error); throw new Error(error.message); }
  if (!goals || goals.length === 0) return [];

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

  // Deputyship goals link UP to organisation goals through a JOIN TABLE
  // (strategic_goal_parents) — it is MANY-TO-MANY, not a parent_goal_id column
  // (that column exists but is unused). A deputyship goal may roll up to several
  // organisation goals, so we collect them all.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const depGoalIds = Array.from(new Set((goals as any[])
    .map((g) => g.deputyship_goal_id)
    .filter(Boolean)));

  const orgGoalsByDepGoal = new Map<string, { title: string; titleAr: string }[]>();
  if (depGoalIds.length) {
    const { data: parentLinks } = await supabase
      .from('strategic_goal_parents')
      .select('deputyship_goal_id, org_goal:strategic_goals!strategic_goal_parents_org_goal_id_fkey(title, title_ar)')
      .in('deputyship_goal_id', depGoalIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of (parentLinks ?? []) as any[]) {
      if (!l.org_goal) continue;
      const list = orgGoalsByDepGoal.get(l.deputyship_goal_id) ?? [];
      list.push({ title: l.org_goal.title ?? '', titleAr: l.org_goal.title_ar ?? '' });
      orgGoalsByDepGoal.set(l.deputyship_goal_id, list);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (goals as any[]).map((g) => ({
    goalId: g.id,
    code: `${pad2(deptOrdinal.get(g.department_id) ?? 0)}-${pad2(goalOrdinal.get(g.id) ?? 0)}`,
    title: g.title ?? '',
    titleAr: g.title_ar ?? '',
    description: g.description ?? '',
    descriptionAr: g.description_ar ?? '',
    formula: g.formula ?? '',
    year: g.year,
    q1: g.q1_target ?? 0, q2: g.q2_target ?? 0, q3: g.q3_target ?? 0, q4: g.q4_target ?? 0,
    targetType: g.target_type ?? 'count',
    unitLabel: g.unit_label ?? '',
    currentValue: Number(g.current_value ?? 0),
    departmentName: g.departments?.name ?? '',
    departmentNameAr: g.departments?.name_ar ?? '',
    deputyshipGoalTitle: g.deputyship_goal?.title ?? '',
    deputyshipGoalTitleAr: g.deputyship_goal?.title_ar ?? '',
    orgGoalTitle: (orgGoalsByDepGoal.get(g.deputyship_goal_id) ?? []).map((o) => o.title).join(' · '),
    orgGoalTitleAr: (orgGoalsByDepGoal.get(g.deputyship_goal_id) ?? []).map((o) => o.titleAr || o.title).join(' · '),
    tasks: tasksByGoal.get(g.id) ?? [],
  }));
}
