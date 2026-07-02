import { createClient } from '@/lib/supabase/client';
import {
  getMonthlyPerformance, getWeights, currentYearMonth,
} from '@/lib/dashboard/perf-queries';
import { tierFromComposite, type PerfResult, type PerfTier } from '@/lib/dashboard/scoring';

// ---- types ----

export type MemberScore = {
  userId: string;
  name: string;
  nameAr: string;
  role: string;
  rank: number;          // shared rank on ties
  result: PerfResult;
  lastResult: PerfResult | null;  // previous month for delta
  delta: number;         // composite delta vs last month (+/-)
};

export type DeptKPIs = {
  totalClosed: number;
  onTimeRate: number;     // 0-100
  avgComposite: number;
  tierCounts: Record<PerfTier, number>;
  memberCount: number;
};

// ---- helpers ----

export async function getMyDepartmentId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('users').select('department_id').eq('id', user.id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.department_id ?? null;
}

export async function listAllDepartments(): Promise<{ id: string; name: string; nameAr: string }[]> {
  const supabase = createClient();
  const { data } = await supabase.from('departments').select('id, name, name_ar').order('name');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({ id: d.id, name: d.name, nameAr: d.name_ar ?? '' }));
}

// get all staff members in a department (rm + arm + admin, not stakeholder/investor)
async function getDeptMembers(deptId: string): Promise<{ id: string; name: string; nameAr: string; role: string }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('users')
    .select('id, name, name_ar, role')
    .eq('department_id', deptId)
    .is('deleted_at', null)
    .not('role', 'in', '(investor,stakeholder,super_admin)')
    .eq('is_higher_management', false)
    .order('name');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((u: any) => ({ id: u.id, name: u.name, nameAr: u.name_ar ?? '', role: u.role }));
}

// assign ranks (shared rank on ties, e.g. 1,2,2,4)
function assignRanks(scores: { userId: string; composite: number }[]): Map<string, number> {
  const sorted = [...scores].sort((a, b) => b.composite - a.composite);
  const rankMap = new Map<string, number>();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].composite < sorted[i - 1].composite) rank = i + 1;
    rankMap.set(sorted[i].userId, rank);
  }
  return rankMap;
}

// last month key from current
function lastMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---- main dept performance query ----

export async function getDepartmentPerformance(
  deptId: string, yearMonth: string = currentYearMonth(),
): Promise<{ members: MemberScore[]; kpis: DeptKPIs }> {
  const members = await getDeptMembers(deptId);
  if (members.length === 0) return { members: [], kpis: { totalClosed: 0, onTimeRate: 0, avgComposite: 0, tierCounts: { low: 0, medium: 0, high: 0, super: 0 }, memberCount: 0 } };

  const lastYm = lastMonthKey(yearMonth);

  // compute scores in parallel
  const [currentResults, lastResults] = await Promise.all([
    Promise.all(members.map((m) => getMonthlyPerformance(m.id, yearMonth))),
    Promise.all(members.map((m) => getMonthlyPerformance(m.id, lastYm))),
  ]);

  // ranks
  const rankMap = assignRanks(members.map((m, i) => ({ userId: m.id, composite: currentResults[i].composite })));

  const memberScores: MemberScore[] = members.map((m, i) => {
    const result = currentResults[i];
    const last = lastResults[i];
    return {
      userId: m.id, name: m.name, nameAr: m.nameAr, role: m.role,
      rank: rankMap.get(m.id) ?? i + 1,
      result,
      lastResult: last,
      delta: result.composite - last.composite,
    };
  });

  // sort by rank
  memberScores.sort((a, b) => a.rank - b.rank);

  // KPIs
  const totalClosed = currentResults.reduce((s, r) => s + r.tasksClosed, 0);
  const totalOnTime = currentResults.reduce((s, r) => s + r.tasksOnTime, 0);
  const onTimeRate = totalClosed > 0 ? Math.round((totalOnTime / totalClosed) * 100) : 0;
  const avgComposite = Math.round(currentResults.reduce((s, r) => s + r.composite, 0) / members.length);
  const tierCounts: Record<PerfTier, number> = { low: 0, medium: 0, high: 0, super: 0 };
  for (const r of currentResults) tierCounts[r.tier]++;

  return { members: memberScores, kpis: { totalClosed, onTimeRate, avgComposite, tierCounts, memberCount: members.length } };
}

// ---- org-wide leaderboard (super admin) ----

export type LeaderboardEntry = {
  userId: string; name: string; nameAr: string;
  deptId: string; deptName: string; deptNameAr: string;
  rank: number; composite: number; tier: PerfTier;
};

export async function getOrgLeaderboard(yearMonth: string = currentYearMonth()): Promise<{
  top5: LeaderboardEntry[];
  employeeOfMonth: LeaderboardEntry | null;
}> {
  const supabase = createClient();

  // all staff across org (not investor/stakeholder)
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, name, name_ar, department_id, departments(name, name_ar)')
    .is('deleted_at', null)
    .not('role', 'in', '(investor,stakeholder,super_admin)')
    .eq('is_higher_management', false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users = (allUsers ?? []) as any[];
  if (users.length === 0) return { top5: [], employeeOfMonth: null };

  const results = await Promise.all(users.map((u) => getMonthlyPerformance(u.id, yearMonth)));

  const ranked = users
    .map((u, i) => ({
      userId: u.id, name: u.name, nameAr: u.name_ar ?? '',
      deptId: u.department_id ?? '',
      deptName: u.departments?.name ?? '',
      deptNameAr: u.departments?.name_ar ?? '',
      composite: results[i].composite,
      tier: results[i].tier,
      rank: 0,
    }))
    .sort((a, b) => b.composite - a.composite);

  // assign org-wide ranks
  let rank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].composite < ranked[i - 1].composite) rank = i + 1;
    ranked[i].rank = rank;
  }

  const top5 = ranked.slice(0, 5);
  const employeeOfMonth = ranked[0] ?? null;

  return { top5, employeeOfMonth };
}
