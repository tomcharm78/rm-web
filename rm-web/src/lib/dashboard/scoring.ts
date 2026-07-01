// Performance scoring engine — pure functions. No DB here; queries.ts feeds
// these the raw counts. Kept pure so scores are testable + explainable.

export type PerfTier = 'low' | 'medium' | 'high' | 'super';

// Volume baselines (accumulative, tasks closed per month), per Hatem's spec:
//   >=3 low, >=5 medium, >=12 high, >=20 super
export const VOLUME_BASELINES = { low: 3, medium: 5, high: 12, super: 20 } as const;

export function tierFromTaskCount(closed: number): PerfTier {
  if (closed >= VOLUME_BASELINES.super) return 'super';
  if (closed >= VOLUME_BASELINES.high) return 'high';
  if (closed >= VOLUME_BASELINES.medium) return 'medium';
  return 'low'; // includes below 3
}

// Map a raw task count to a 0-100 volume score, interpolating within tier bands
// so the gauge moves smoothly (0 tasks = 0; 20+ tasks = 100).
export function computeVolumeScore(closed: number): number {
  const bands: [number, number, number, number][] = [
    // [lowerCount, upperCount, lowerScore, upperScore]
    [0, 3, 0, 40],
    [3, 5, 40, 60],
    [5, 12, 60, 80],
    [12, 20, 80, 100],
  ];
  if (closed >= 20) return 100;
  for (const [lc, uc, ls, us] of bands) {
    if (closed >= lc && closed < uc) {
      const frac = uc === lc ? 0 : (closed - lc) / (uc - lc);
      return Math.round(ls + frac * (us - ls));
    }
  }
  return 0;
}

// Timeliness: blend of on-time rate (how many closed by their due date) and
// closure speed (faster = better, normalized against a 14-day reference).
export function computeTimelinessScore(opts: {
  closed: number; onTime: number; avgClosureDays: number;
}): number {
  if (opts.closed === 0) return 0;
  const onTimeRate = opts.onTime / opts.closed;          // 0..1
  const onTimePart = onTimeRate * 100;                    // 0..100
  // speed: 0 days -> 100, 14+ days -> ~40 (never punish below 0)
  const speedPart = Math.max(40, 100 - (opts.avgClosureDays / 14) * 60);
  // weight on-time more than raw speed
  return Math.round(onTimePart * 0.65 + speedPart * 0.35);
}

// Outcomes: challenges resolved weighted heaviest; if no challenge data,
// substitute closed tasks at 12 tasks == 1 challenge-equivalent.
// survey_avg (1-5) folds in when present.
export function computeOutcomesScore(opts: {
  challengesResolved: number; tasksClosed: number; surveyAvg: number | null;
}): { score: number; basis: 'challenges' | 'tasks_fallback' | 'blend' } {
  // challenge-equivalents: real challenges + fallback from tasks
  const fromTasks = opts.tasksClosed / 12;
  const equivalents = opts.challengesResolved + (opts.challengesResolved === 0 ? fromTasks : 0);

  // map equivalents to 0..100: 0 -> 0, 1 -> 60, 3+ -> 100 (challenges are hard-won)
  let challengeScore: number;
  if (equivalents >= 3) challengeScore = 100;
  else if (equivalents >= 1) challengeScore = Math.round(60 + (equivalents - 1) / 2 * 40);
  else challengeScore = Math.round(equivalents * 60);

  // survey contribution (1-5 -> 0-100) if present
  if (opts.surveyAvg != null && opts.surveyAvg > 0) {
    const surveyScore = Math.round(((opts.surveyAvg - 1) / 4) * 100);
    return { score: Math.round(challengeScore * 0.7 + surveyScore * 0.3), basis: 'blend' };
  }
  return {
    score: challengeScore,
    basis: opts.challengesResolved === 0 ? 'tasks_fallback' : 'challenges',
  };
}

export type Weights = { volume: number; timeliness: number; outcomes: number };
export const DEFAULT_WEIGHTS: Weights = { volume: 40, timeliness: 30, outcomes: 30 };

export function composite(scores: { volume: number; timeliness: number; outcomes: number }, w: Weights): number {
  const total = w.volume + w.timeliness + w.outcomes || 1;
  return Math.round(
    (scores.volume * w.volume + scores.timeliness * w.timeliness + scores.outcomes * w.outcomes) / total
  );
}

// composite 0-100 -> tier (same 4 bands, aligned to the volume feel)
export function tierFromComposite(score: number): PerfTier {
  if (score >= 80) return 'super';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function tierLabel(t: PerfTier, ar: boolean): string {
  const m: Record<PerfTier, [string, string]> = {
    low: ['Low', 'منخفض'], medium: ['Medium', 'متوسط'],
    high: ['High', 'مرتفع'], super: ['Super', 'متميّز'],
  };
  return ar ? m[t][1] : m[t][0];
}

export function tierColor(t: PerfTier): string {
  switch (t) {
    case 'super': return '#199e70';
    case 'high': return '#63991a';
    case 'medium': return '#c98500';
    default: return '#e34948';
  }
}

// A full computed result for one person for one month — the explainable shape.
export type PerfResult = {
  yearMonth: string;
  tasksClosed: number;
  tasksOnTime: number;
  challengesResolved: number;
  avgClosureDays: number;
  surveyAvg: number | null;
  volumeScore: number;
  timelinessScore: number;
  outcomesScore: number;
  outcomesBasis: 'challenges' | 'tasks_fallback' | 'blend';
  composite: number;
  tier: PerfTier;
  weights: Weights;
};
// Yearly volume: cumulative total against year-scaled baselines.
// Roughly monthly baselines × 6 (sustained half-year+ of pace):
//   >=12/yr low band, >=30 medium, >=72 high, >=120 super
export function computeYearlyVolumeScore(closedThisYear: number): number {
  const bands: [number, number, number, number][] = [
    [0, 12, 0, 40],
    [12, 30, 40, 60],
    [30, 72, 60, 80],
    [72, 120, 80, 100],
  ];
  if (closedThisYear >= 120) return 100;
  for (const [lc, uc, ls, us] of bands) {
    if (closedThisYear >= lc && closedThisYear < uc) {
      const frac = uc === lc ? 0 : (closedThisYear - lc) / (uc - lc);
      return Math.round(ls + frac * (us - ls));
    }
  }
  return 0;
}