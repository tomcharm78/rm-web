// KPI / Strategic Goals types — three-shape pattern + mappers.

export type GoalTier = 'organization' | 'deputyship';
export type GoalStatus = 'active' | 'archived';
export type Quarter = 1 | 2 | 3 | 4;

// ---- Strategic goal (org + deputyship) ----
export type StrategicGoalRow = {
  id: string;
  organization_id: string;
  tier: GoalTier;
  parent_goal_id: string | null;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  year: number;
  q1_target: number | null;
  q2_target: number | null;
  q3_target: number | null;
  q4_target: number | null;
  status: GoalStatus;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StrategicGoal = {
  id: string;
  tier: GoalTier;
  parentGoalId: string | null;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  year: number;
  q1Target: number | null;
  q2Target: number | null;
  q3Target: number | null;
  q4Target: number | null;
  status: GoalStatus;
  createdAt: string;
};

export function dbStrategicGoalToGoal(r: StrategicGoalRow): StrategicGoal {
  return {
    id: r.id, tier: r.tier, parentGoalId: r.parent_goal_id,
    title: r.title, titleAr: r.title_ar,
    description: r.description, descriptionAr: r.description_ar,
    year: r.year,
    q1Target: r.q1_target, q2Target: r.q2_target, q3Target: r.q3_target, q4Target: r.q4_target,
    status: r.status, createdAt: r.created_at,
  };
}

// ---- Department goal (admin-set, links to a deputyship goal) ----
export type DepartmentGoalRow = {
  id: string;
  organization_id: string;
  department_id: string;
  deputyship_goal_id: string;
  target_type: TargetType;
  unit_label: string;
  current_value: number;
  title: string;
  title_ar: string;
  description: string;
  description_ar: string;
  year: number;
  q1_target: number;
  q2_target: number;
  q3_target: number;
  q4_target: number;
  status: GoalStatus;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DepartmentGoal = {
  id: string;
  departmentId: string;
  deputyshipGoalId: string;
  targetType: TargetType;
  unitLabel: string;
  formula: string;
  currentValue: number;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  year: number;
  q1Target: number;
  q2Target: number;
  q3Target: number;
  q4Target: number;
  status: GoalStatus;
  createdAt: string;
};

export function dbDepartmentGoalToGoal(r: DepartmentGoalRow): DepartmentGoal {
  return {
    id: r.id, departmentId: r.department_id, deputyshipGoalId: r.deputyship_goal_id,
    targetType: r.target_type, unitLabel: r.unit_label ?? '', currentValue: r.current_value ?? 0, formula: r.formula ?? '',
    title: r.title, titleAr: r.title_ar,
    description: r.description, descriptionAr: r.description_ar,
    year: r.year,
    q1Target: r.q1_target, q2Target: r.q2_target, q3Target: r.q3_target, q4Target: r.q4_target,
    status: r.status, createdAt: r.created_at,
  };
}

// ---- form inputs ----
export type StrategicGoalInput = {
  tier: GoalTier;
  parentGoalId?: string | null;
  title: string; titleAr: string;
  description?: string; descriptionAr?: string;
  year: number;
  q1Target?: number | null; q2Target?: number | null; q3Target?: number | null; q4Target?: number | null;
};

export type DepartmentGoalInput = {
  departmentId: string;
  deputyshipGoalId: string;
  targetType?: TargetType;
  unitLabel?: string;
  formula?: string;
  currentValue?: number;
  title: string; titleAr: string;
  description?: string; descriptionAr?: string;
  year: number;
  q1Target: number; q2Target: number; q3Target: number; q4Target: number;
};

// ---- helpers ----
export function currentQuarter(date = new Date()): Quarter {
  const m = date.getUTCMonth(); // 0-11
  return (Math.floor(m / 3) + 1) as Quarter;
}

export function quarterTarget(g: { q1Target: number | null; q2Target: number | null; q3Target: number | null; q4Target: number | null }, q: Quarter): number {
  const map = { 1: g.q1Target, 2: g.q2Target, 3: g.q3Target, 4: g.q4Target };
  return map[q] ?? 0;
}

export function yearlyTarget(g: { q1Target: number | null; q2Target: number | null; q3Target: number | null; q4Target: number | null }): number {
  return (g.q1Target ?? 0) + (g.q2Target ?? 0) + (g.q3Target ?? 0) + (g.q4Target ?? 0);
}

// bounds of a quarter [start, end) as ISO
export function quarterBounds(year: number, q: Quarter): { start: string; end: string } {
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// how far through the current quarter are we (0..1) — for prorated on-track pace
export function quarterElapsedFraction(year: number, q: Quarter, now = new Date()): number {
  const { start, end } = quarterBounds(year, q);
  const s = new Date(start).getTime(), e = new Date(end).getTime(), n = now.getTime();
  if (n <= s) return 0;
  if (n >= e) return 1;
  return (n - s) / (e - s);
}

export type PaceStatus = 'on_track' | 'deviated' | 'behind';

// achieved vs prorated expected → status
export function paceStatus(achieved: number, quarterTargetVal: number, elapsedFraction: number): PaceStatus {
  if (quarterTargetVal <= 0) return 'on_track';
  const expected = quarterTargetVal * elapsedFraction;
  if (achieved >= expected) return 'on_track';
  if (achieved >= expected * 0.7) return 'deviated'; // within 30% of pace = amber
  return 'behind'; // red
}

export function paceLabel(s: PaceStatus, ar: boolean): string {
  const m: Record<PaceStatus, [string, string]> = {
    on_track: ['On track', 'على المسار'],
    deviated: ['Deviated', 'انحراف'],
    behind: ['Behind', 'متأخّر'],
  };
  return ar ? m[s][1] : m[s][0];
}

export function paceColor(s: PaceStatus): string {
  switch (s) {
    case 'on_track': return '#199e70';
    case 'deviated': return '#eda100';
    case 'behind': return '#e34948';
  }
}
// ---- target types (slice 3b) ----
export type TargetType = 'count' | 'percentage' | 'sar';

export function targetTypeLabel(t: TargetType, ar: boolean): string {
  const m: Record<TargetType, [string, string]> = {
    count: ['Count', 'عدد'],
    percentage: ['Percentage', 'نسبة مئوية'],
    sar: ['SAR amount', 'مبلغ بالريال'],
  };
  return ar ? m[t][1] : m[t][0];
}

// format an achieved/target value by type + unit
export function formatGoalValue(value: number, type: TargetType, unitLabel?: string): string {
  if (type === 'percentage') return `${value}%`;
  if (type === 'sar') return `SAR ${value.toLocaleString()}`;
  return unitLabel ? `${value} ${unitLabel}` : `${value}`;
}
