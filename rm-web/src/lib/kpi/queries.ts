import { createClient } from '@/lib/supabase/client';
import {
  dbStrategicGoalToGoal, dbDepartmentGoalToGoal,
  type StrategicGoal, type DepartmentGoal, type GoalTier,
  type StrategicGoalInput, type DepartmentGoalInput, type StrategicGoalRow, type DepartmentGoalRow,
} from '@/types/kpi';

// ---- strategic goals (org + deputyship) ----

export async function listStrategicGoals(tier?: GoalTier, year?: number): Promise<StrategicGoal[]> {
  const supabase = createClient();
  let q = supabase.from('strategic_goals').select('*').eq('status', 'active').order('created_at', { ascending: true });
  if (tier) q = q.eq('tier', tier);
  if (year) q = q.eq('year', year);
  const { data, error } = await q;
  if (error) { console.error('[listStrategicGoals]', error); throw new Error(error.message); }
  return (data as StrategicGoalRow[]).map(dbStrategicGoalToGoal);
}

export async function createStrategicGoal(input: StrategicGoalInput): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('strategic_goals').insert({
    tier: input.tier,
    parent_goal_id: input.parentGoalId ?? null,
    title: input.title.trim(),
    title_ar: (input.titleAr ?? '').trim(),
    description: (input.description ?? '').trim(),
    description_ar: (input.descriptionAr ?? '').trim(),
    year: input.year,
    q1_target: input.q1Target ?? null,
    q2_target: input.q2Target ?? null,
    q3_target: input.q3Target ?? null,
    q4_target: input.q4Target ?? null,
    created_by_id: user?.id ?? null,
  });
  if (error) { console.error('[createStrategicGoal]', error); throw new Error(error.message); }
}

export async function updateStrategicGoal(id: string, input: Partial<StrategicGoalInput>): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.titleAr !== undefined) patch.title_ar = input.titleAr.trim();
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.descriptionAr !== undefined) patch.description_ar = input.descriptionAr.trim();
  if (input.year !== undefined) patch.year = input.year;
  if (input.q1Target !== undefined) patch.q1_target = input.q1Target;
  if (input.q2Target !== undefined) patch.q2_target = input.q2Target;
  if (input.q3Target !== undefined) patch.q3_target = input.q3Target;
  if (input.q4Target !== undefined) patch.q4_target = input.q4Target;
  if (input.parentGoalId !== undefined) patch.parent_goal_id = input.parentGoalId;
  const { error } = await supabase.from('strategic_goals').update(patch).eq('id', id);
  if (error) { console.error('[updateStrategicGoal]', error); throw new Error(error.message); }
}

export async function archiveStrategicGoal(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('strategic_goals').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('[archiveStrategicGoal]', error); throw new Error(error.message); }
}

// ---- department goals ----

export async function listDepartmentGoals(departmentId?: string, year?: number): Promise<DepartmentGoal[]> {
  const supabase = createClient();
  let q = supabase.from('department_goals').select('*').eq('status', 'active').order('created_at', { ascending: true });
  if (departmentId) q = q.eq('department_id', departmentId);
  if (year) q = q.eq('year', year);
  const { data, error } = await q;
  if (error) { console.error('[listDepartmentGoals]', error); throw new Error(error.message); }
  return (data as DepartmentGoalRow[]).map(dbDepartmentGoalToGoal);
}

export async function createDepartmentGoal(input: DepartmentGoalInput): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('department_goals').insert({
    department_id: input.departmentId,
    deputyship_goal_id: input.deputyshipGoalId,
    title: input.title.trim(),
    title_ar: (input.titleAr ?? '').trim(),
    description: (input.description ?? '').trim(),
    description_ar: (input.descriptionAr ?? '').trim(),
    year: input.year,
    q1_target: input.q1Target,
    q2_target: input.q2Target,
    q3_target: input.q3Target,
    q4_target: input.q4Target,
    target_type: input.targetType ?? 'count',
    unit_label: input.unitLabel ?? '',
    formula: input.formula ?? '',
    current_value: input.currentValue ?? 0,
    created_by_id: user?.id ?? null,
  });
  if (error) { console.error('[createDepartmentGoal]', error); throw new Error(error.message); }
}

export async function updateDepartmentGoal(id: string, input: Partial<DepartmentGoalInput>): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.titleAr !== undefined) patch.title_ar = input.titleAr.trim();
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.descriptionAr !== undefined) patch.description_ar = input.descriptionAr.trim();
  if (input.year !== undefined) patch.year = input.year;
  if (input.deputyshipGoalId !== undefined) patch.deputyship_goal_id = input.deputyshipGoalId;
  if (input.q1Target !== undefined) patch.q1_target = input.q1Target;
  if (input.q2Target !== undefined) patch.q2_target = input.q2Target;
  if (input.q3Target !== undefined) patch.q3_target = input.q3Target;
  if (input.q4Target !== undefined) patch.q4_target = input.q4Target;
  if (input.targetType !== undefined) patch.target_type = input.targetType;
  if (input.formula !== undefined) patch.formula = input.formula;
  if (input.unitLabel !== undefined) patch.unit_label = input.unitLabel;
  if (input.currentValue !== undefined) patch.current_value = input.currentValue;
  const { error } = await supabase.from('department_goals').update(patch).eq('id', id);
  if (error) { console.error('[updateDepartmentGoal]', error); throw new Error(error.message); }
}

export async function archiveDepartmentGoal(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('department_goals').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('[archiveDepartmentGoal]', error); throw new Error(error.message); }
}
// ---- deputyship ↔ org goal parents (many-to-many) ----

export async function listGoalParents(deputyshipGoalId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('strategic_goal_parents')
    .select('org_goal_id')
    .eq('deputyship_goal_id', deputyshipGoalId);
  if (error) { console.error('[listGoalParents]', error); throw new Error(error.message); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.org_goal_id as string);
}

// replace the full set of org-goal parents for a deputyship goal
export async function setGoalParents(deputyshipGoalId: string, orgGoalIds: string[]): Promise<void> {
  const supabase = createClient();
  // delete existing, then insert the new set
  const { error: delErr } = await supabase
    .from('strategic_goal_parents')
    .delete()
    .eq('deputyship_goal_id', deputyshipGoalId);
  if (delErr) { console.error('[setGoalParents delete]', delErr); throw new Error(delErr.message); }
  if (orgGoalIds.length === 0) return;
  const rows = orgGoalIds.map((org_goal_id) => ({ deputyship_goal_id: deputyshipGoalId, org_goal_id }));
  const { error: insErr } = await supabase.from('strategic_goal_parents').insert(rows);
  if (insErr) { console.error('[setGoalParents insert]', insErr); throw new Error(insErr.message); }
}
// ---- task ↔ executive goal links ----

export async function listTaskGoals(taskId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('task_goals').select('department_goal_id').eq('task_id', taskId);
  if (error) { console.error('[listTaskGoals]', error); throw new Error(error.message); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.department_goal_id as string);
}

export async function setTaskGoals(taskId: string, goalIds: string[]): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Stamp the capacity this link was made in (role at link time).
  let linkedByRole: string | null = null;
  if (user) {
    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linkedByRole = (me as any)?.role ?? null;
  }
  const isGov = linkedByRole === 'pmo' || linkedByRole === 'pm';
  // Capture the pre-change state so a governance edit can be logged to history.
  let priorIds: string[] = [];
  if (isGov) {
    const { data: prior } = await supabase.from('task_goals').select('department_goal_id').eq('task_id', taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    priorIds = (prior ?? []).map((r: any) => r.department_goal_id as string);
  }
  const { error: delErr } = await supabase.from('task_goals').delete().eq('task_id', taskId);
  if (delErr) { console.error('[setTaskGoals delete]', delErr); throw new Error(delErr.message); }
  if (goalIds.length > 0) {
    const rows = goalIds.map((department_goal_id) => ({ task_id: taskId, department_goal_id, linked_by_id: user?.id ?? null, linked_by_role: linkedByRole }));
    const { error: insErr } = await supabase.from('task_goals').insert(rows);
    if (insErr) { console.error('[setTaskGoals insert]', insErr); throw new Error(insErr.message); }
  }
  // Governance link change -> record "Linked by PM" in task status history.
  if (isGov && JSON.stringify(priorIds.sort()) !== JSON.stringify([...goalIds].sort())) {
    const { data: cur } = await supabase.from('tasks').select('status').eq('id', taskId).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (cur as any)?.status ?? null;
    if (st) {
      await supabase.from('task_status_history').insert({
        task_id: taskId, from_status: st, to_status: st,
        changed_by_id: user?.id ?? null, change_reason: 'Linked by PM',
      });
    }
  }
}

// ---- challenge ↔ executive goal links ----

export async function listChallengeGoals(challengeId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('challenge_goals').select('department_goal_id').eq('challenge_id', challengeId);
  if (error) { console.error('[listChallengeGoals]', error); throw new Error(error.message); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.department_goal_id as string);
}

export async function setChallengeGoals(challengeId: string, goalIds: string[]): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let linkedByRole: string | null = null;
  if (user) {
    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linkedByRole = (me as any)?.role ?? null;
  }
  const isGov = linkedByRole === 'pmo' || linkedByRole === 'pm';
  let priorIds: string[] = [];
  if (isGov) {
    const { data: prior } = await supabase.from('challenge_goals').select('department_goal_id').eq('challenge_id', challengeId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    priorIds = (prior ?? []).map((r: any) => r.department_goal_id as string);
  }
  const { error: delErr } = await supabase.from('challenge_goals').delete().eq('challenge_id', challengeId);
  if (delErr) { console.error('[setChallengeGoals delete]', delErr); throw new Error(delErr.message); }
  if (goalIds.length > 0) {
    const rows = goalIds.map((department_goal_id) => ({ challenge_id: challengeId, department_goal_id, linked_by_id: user?.id ?? null, linked_by_role: linkedByRole }));
    const { error: insErr } = await supabase.from('challenge_goals').insert(rows);
    if (insErr) { console.error('[setChallengeGoals insert]', insErr); throw new Error(insErr.message); }
  }
  if (isGov && JSON.stringify(priorIds.sort()) !== JSON.stringify([...goalIds].sort())) {
    const { data: cur } = await supabase.from('challenges').select('status').eq('id', challengeId).single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (cur as any)?.status ?? null;
    if (st) {
      await supabase.from('challenge_status_history').insert({
        challenge_id: challengeId, from_status: st, to_status: st,
        changed_by_id: user?.id ?? null, reason: 'Linked by PM',
      });
    }
  }
}

// list the admin's own department executive goals (for the linking picker)
export async function listMyDepartmentExecutiveGoals(): Promise<{ id: string; title: string; titleAr: string }[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase.from('users').select('role, department_id').eq('id', user.id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (me as any)?.role;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deptId = (me as any)?.department_id;

  // Governance goal picker: PMO sees ALL departments' goals; PM sees goals for
  // their assigned departments. RLS still guards the underlying reads.
  let goalsQuery = supabase.from('department_goals').select('id, title, title_ar').eq('status', 'active');
  if (role === 'pmo') {
    // org-wide: no department filter
  } else if (role === 'pm') {
    const { data: asgn } = await supabase.from('pm_department_assignments').select('department_id').eq('pm_id', user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deptIds = (asgn ?? []).map((a: any) => a.department_id as string);
    if (deptIds.length === 0) return [];
    goalsQuery = goalsQuery.in('department_id', deptIds);
  } else {
    if (!deptId) return [];
    goalsQuery = goalsQuery.eq('department_id', deptId);
  }
  const { data } = await goalsQuery.order('created_at');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((g: any) => ({ id: g.id, title: g.title, titleAr: g.title_ar ?? '' }));
}