// RM Platform pricing — the single source of truth for quotes, invoices and
// (later) the payment webhook. A pure function: same input, same output, no I/O,
// trivially testable.
//
// MARGINAL pricing: each seat is charged at the band it falls in, then summed.
// This is the only model where the total ALWAYS rises with headcount and the
// blended per-seat rate ALWAYS falls — no cliffs, no band-boundary inversions,
// and the falling blended rate IS the volume discount a large customer expects.
//
// Every rate here is a DIAL. The numbers are market-positioned, not yet
// validated against per-tenant cost — once hosting (sccc/Oracle) is quoted, drop
// the cost into estimateMargin() below and each plan's margin becomes visible.

export type PricingBand = {
  upTo: number | null;   // inclusive upper seat number for this band; null = no ceiling
  // For a FLAT band, `flat` is the whole-band price and `perSeat` is 0.
  // For a PER-SEAT band, `perSeat` applies to each seat that falls in the band.
  flat: number;
  perSeat: number;
  tierLabel: string;
  tierLabelAr: string;
};

// The model. Order matters — bands are consumed low to high.
export const PRICING_BANDS: PricingBand[] = [
  { upTo: 19,   flat: 900, perSeat: 0,  tierLabel: 'Small Business', tierLabelAr: 'الأعمال الصغيرة' },
  { upTo: 49,   flat: 0,   perSeat: 40, tierLabel: 'Mid-size',       tierLabelAr: 'المتوسطة' },
  { upTo: 99,   flat: 0,   perSeat: 28, tierLabel: 'Corporate',      tierLabelAr: 'الشركات' },
  { upTo: null, flat: 0,   perSeat: 20, tierLabel: 'Enterprise',     tierLabelAr: 'المؤسسات' },
];

// Annual billing: pay for this many months, get 12. 10 => ~17% off.
export const ANNUAL_MONTHS_CHARGED = 10;

export type QuoteLine = {
  band: string;
  bandAr: string;
  seatsInBand: number;
  rate: number;        // per-seat rate, or the flat amount if seatsInBand is the base band
  isFlat: boolean;
  amount: number;
};

export type Quote = {
  seats: number;
  tierLabel: string;
  tierLabelAr: string;
  lines: QuoteLine[];
  monthlyList: number;        // before any discount
  discountPct: number;        // founding-partner or promo, 0..100
  monthlyNet: number;         // after discount
  blendedPerSeat: number;     // monthlyNet / seats
  annualNet: number;          // monthlyNet * ANNUAL_MONTHS_CHARGED
  annualSavingVsMonthly: number;
};

// The tier a company of this size sits in — the LABEL for the top band its
// headcount reaches, used for display ("you're on the Corporate plan").
function tierForSeats(seats: number): { label: string; labelAr: string } {
  let chosen = PRICING_BANDS[0];
  let floor = 1;
  for (const band of PRICING_BANDS) {
    if (seats >= floor) chosen = band;
    if (band.upTo !== null) floor = band.upTo + 1;
  }
  return { label: chosen.tierLabel, labelAr: chosen.tierLabelAr };
}

export function buildQuote(seatsInput: number, discountPct = 0): Quote {
  const seats = Math.max(0, Math.floor(seatsInput));
  const lines: QuoteLine[] = [];
  let monthlyList = 0;
  let bandFloor = 1; // first seat number in the current band

  for (const band of PRICING_BANDS) {
    if (seats < bandFloor) break;
    const bandCeiling = band.upTo ?? Infinity;
    // how many of this company's seats land in this band
    const seatsInBand = Math.min(seats, bandCeiling) - bandFloor + 1;
    if (seatsInBand <= 0) {
      if (band.upTo !== null) bandFloor = band.upTo + 1;
      continue;
    }

    if (band.flat > 0) {
      // Base band: a flat price covering every seat up to its ceiling.
      lines.push({
        band: band.tierLabel, bandAr: band.tierLabelAr,
        seatsInBand, rate: band.flat, isFlat: true, amount: band.flat,
      });
      monthlyList += band.flat;
    } else {
      const amount = seatsInBand * band.perSeat;
      lines.push({
        band: band.tierLabel, bandAr: band.tierLabelAr,
        seatsInBand, rate: band.perSeat, isFlat: false, amount,
      });
      monthlyList += amount;
    }

    if (band.upTo === null) break;
    bandFloor = band.upTo + 1;
  }

  const pct = Math.min(100, Math.max(0, discountPct));
  const monthlyNet = Math.round(monthlyList * (1 - pct / 100));
  const annualNet = monthlyNet * ANNUAL_MONTHS_CHARGED;
  const tier = tierForSeats(seats);

  return {
    seats,
    tierLabel: tier.label,
    tierLabelAr: tier.labelAr,
    lines,
    monthlyList,
    discountPct: pct,
    monthlyNet,
    blendedPerSeat: seats > 0 ? Math.round(monthlyNet / seats) : 0,
    annualNet,
    annualSavingVsMonthly: monthlyNet * 12 - annualNet,
  };
}

// ---- margin (fill in once hosting is quoted) -------------------------------
// Per-tenant monthly cost = a fixed floor (hosting/DB/storage share) + a
// per-seat variable (AI inference, support load). Leave at 0 until real numbers
// exist; then a quote's margin is monthlyNet - estimated cost.
export type CostAssumptions = { fixedPerTenant: number; variablePerSeat: number };

export function estimateMargin(q: Quote, cost: CostAssumptions): {
  cost: number; margin: number; marginPct: number;
} {
  const c = cost.fixedPerTenant + cost.variablePerSeat * q.seats;
  const margin = q.monthlyNet - c;
  return {
    cost: c,
    margin,
    marginPct: q.monthlyNet > 0 ? Math.round((margin / q.monthlyNet) * 100) : 0,
  };
}
