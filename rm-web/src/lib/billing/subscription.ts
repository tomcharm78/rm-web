// Subscription access — the single source of truth for what a tenant may use.
//
// Every access gate asks resolveAccess(); nothing reads plan_status directly, so
// the lifecycle rules live in ONE place. Pure and testable, the sibling of the
// pricing calculator.
//
// The lifecycle, decided up front:
//   trial      — 30 days, FULL access, no card required.
//   grace      — a ONE-TIME 60-day window after access lapses: BASIC access
//                (core modules only, premium off), data retained. Reminders go
//                out but the duration itself is unannounced.
//   suspended  — after grace: locked, but data RETAINED, never deleted.
//   active     — paid_through is in the future: FULL access.
//
// Principles:
//   • Degrade accessories, never lock out the org or its data — until suspension,
//     which still retains data so paying reinstates the tenant intact.
//   • The 60-day grace is once per customer lifetime. grace_used_at records that
//     it was spent; a later lapse does NOT reopen it — it goes straight toward
//     suspension.
//   • No retro billing. paid_through is "access good until", never a debt ledger.

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 60;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessTier = 'full' | 'basic' | 'suspended';

export type SubscriptionFields = {
  planStatus: string | null;              // trialing | active | grace | suspended | null
  trialEndsAt: string | null;
  paidThrough: string | null;
  graceStartedAt: string | null;
  graceUsedAt: string | null;
};

export type AccessResult = {
  tier: AccessTier;
  reason:
    | 'internal'          // the internal tenant — never degrades
    | 'trialing'
    | 'paid'
    | 'in_grace'
    | 'grace_exhausted'   // grace window elapsed -> suspended
    | 'grace_unavailable' // lapsed with grace already spent -> suspended
    | 'suspended';
  // present while access is degraded or ticking down, so the UI can warn.
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  daysLeft?: number;      // whole days remaining in the current window (trial/grace)
};

const ms = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null);
const daysBetween = (fromMs: number, toMs: number) => Math.ceil((toMs - fromMs) / DAY_MS);

// The core decision. `now` is injected so this stays pure and testable.
export function resolveAccess(org: SubscriptionFields, now: Date = new Date()): AccessResult {
  const t = now.getTime();

  // NULL status = the internal tenant (or any org predating the lifecycle).
  // It has no subscription and must never be degraded.
  if (org.planStatus == null || org.planStatus === 'active') {
    // 'active' still honours paid_through IF one is set — a real paid tenant.
    const paid = ms(org.paidThrough);
    if (org.planStatus == null || paid == null) {
      return { tier: 'full', reason: org.planStatus == null ? 'internal' : 'paid' };
    }
    if (t <= paid) {
      return { tier: 'full', reason: 'paid', daysLeft: Math.max(0, daysBetween(t, paid)) };
    }
    // paid tenant whose paid_through has passed — fall through to lapse handling.
    return lapse(org, now);
  }

  if (org.planStatus === 'trialing') {
    const ends = ms(org.trialEndsAt);
    if (ends != null && t <= ends) {
      return {
        tier: 'full',
        reason: 'trialing',
        trialEndsAt: new Date(ends),
        daysLeft: Math.max(0, daysBetween(t, ends)),
      };
    }
    // trial elapsed — begins the lapse path.
    return lapse(org, now);
  }

  if (org.planStatus === 'grace') {
    return lapse(org, now);
  }

  // explicit suspended
  return { tier: 'suspended', reason: 'suspended' };
}

// Shared lapse logic: what happens once paid_through / trial has passed.
// Grace applies only if it has never been used. While inside the 60-day window
// the tenant runs on BASIC; past it (or if grace was already spent) it is
// SUSPENDED.
function lapse(org: SubscriptionFields, now: Date): AccessResult {
  const t = now.getTime();
  const graceUsed = ms(org.graceUsedAt);

  // grace already consumed in a past lifetime -> straight to suspended.
  if (graceUsed != null && org.planStatus !== 'grace') {
    // If we are currently marked 'grace' we still honour the running window
    // below; otherwise a fresh lapse with grace spent means suspension.
    return { tier: 'suspended', reason: 'grace_unavailable' };
  }

  const graceStart = ms(org.graceStartedAt);
  if (graceStart != null) {
    const graceEnd = graceStart + GRACE_DAYS * DAY_MS;
    if (t <= graceEnd) {
      return {
        tier: 'basic',
        reason: 'in_grace',
        graceEndsAt: new Date(graceEnd),
        daysLeft: Math.max(0, daysBetween(t, graceEnd)),
      };
    }
    return { tier: 'suspended', reason: 'grace_exhausted' };
  }

  // Lapsed but grace has not been opened yet AND is still available: the tenant
  // is entitled to basic access; the scheduled transition (a later layer) will
  // stamp grace_started_at / grace_used_at. Resolve as in_grace so access is
  // correct even before the job runs.
  if (graceUsed == null) {
    const graceEnd = t + GRACE_DAYS * DAY_MS;
    return {
      tier: 'basic',
      reason: 'in_grace',
      graceEndsAt: new Date(graceEnd),
      daysLeft: GRACE_DAYS,
    };
  }

  return { tier: 'suspended', reason: 'grace_unavailable' };
}

// Convenience for gates that only care whether a premium module is allowed.
// full -> premium allowed; basic/suspended -> core only.
export function allowsPremium(tier: AccessTier): boolean {
  return tier === 'full';
}
