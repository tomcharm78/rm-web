'use client';
// REPORT 4 — EMPLOYEE PERFORMANCE.
//
// A composite score on its own ("67") means nothing to a reader. Every figure
// here is therefore paired with its TIER, the report opens by explaining what
// the composite measures, and a legend states the bands. Landscape — a 12-month
// matrix needs the width.
import {
  PaginatedReport, GREEN,
  type Block, type ChartSpec, type ReportSettings,
} from './paginated-report';
import { tierFromComposite, tierLabel, type PerfTier } from '@/lib/dashboard/scoring';

export type PerfCell = { composite: number; tier: string } | null;
export type PerfRow = {
  userId: string;
  name: string;
  nameAr: string;
  cells: PerfCell[];
  yearly: number;
  yearlyTier: string;
};

export type EmployeePerfData = {
  months: string[];
  monthLabels: string[];
  rows: PerfRow[];
  orgName: string; orgNameAr: string;
  year: number;
  scopeLabel: string;
};

export function EmployeePerfReport({
  data, ar, settings,
}: { data: EmployeePerfData; ar: boolean; settings: ReportSettings }) {
  const blocks: Block[] = [];

  const ranked = [...data.rows].sort((a, b) => b.yearly - a.yearly);
  const avg = data.rows.length
    ? Math.round(data.rows.reduce((s, r) => s + r.yearly, 0) / data.rows.length)
    : 0;

  // Tier distribution — the headline interpretation.
  const dist: Record<PerfTier, number> = { low: 0, medium: 0, high: 0, super: 0 };
  for (const r of data.rows) dist[tierFromComposite(r.yearly)]++;

  const fmt = (score: number) => `${score} · ${tierLabel(tierFromComposite(score), ar)}`;

  // ---------------------------------------------------------------- §1
  blocks.push({ kind: 'h2', text: ar ? '١. كيف تُقرأ هذه الدرجات' : '1. How to read these scores' });
  blocks.push({
    kind: 'para',
    text: ar
      ? 'الدرجة المركّبة (0–100) تجمع بين حجم العمل المنجز (عدد المهام المغلقة مقارنة بخط الأساس) وسرعة الإنجاز (الأيام حتى الإغلاق). الدرجة وحدها لا تكفي — لذلك تُقرأ ضمن فئة: متميّز (80 فأكثر)، مرتفع (60–79)، متوسط (40–59)، منخفض (أقل من 40). الفراغ يعني عدم وجود نشاط مسجّل في ذلك الشهر، وليس أداءً ضعيفًا.'
      : 'The composite score (0–100) combines work volume (tasks closed against a baseline) and speed (days to close). A number alone says little — read it within its band: Super (80+), High (60–79), Medium (40–59), Low (under 40). A dash means no recorded activity that month, not poor performance.',
  });
  blocks.push({
    kind: 'table', id: 'legend', accent: '#f0f7f4',
    head: [ar ? 'الفئة' : 'Band', ar ? 'النطاق' : 'Range', ar ? 'عدد الموظفين' : 'Employees'],
    rows: [
      [tierLabel('super', ar), '80 – 100', dist.super],
      [tierLabel('high', ar), '60 – 79', dist.high],
      [tierLabel('medium', ar), '40 – 59', dist.medium],
      [tierLabel('low', ar), ar ? 'أقل من 40' : 'Under 40', dist.low],
    ],
  });

  // ---------------------------------------------------------------- §2
  blocks.push({ kind: 'h2', text: ar ? '٢. الملخص' : '2. Summary' });
  blocks.push({
    kind: 'stats',
    items: [
      { label: ar ? 'عدد الموظفين' : 'Employees', value: String(data.rows.length) },
      { label: ar ? 'متوسط الدرجة السنوية' : 'Average yearly score', value: avg ? fmt(avg) : '—' },
      { label: ar ? 'الأعلى' : 'Top', value: ranked[0] ? fmt(ranked[0].yearly) : '—' },
      { label: ar ? 'يحتاجون دعمًا' : 'Need support', value: String(dist.low), danger: dist.low > 0 },
    ],
  });
  if (dist.low > 0) {
    blocks.push({
      kind: 'note',
      danger: true,
      text: ar
        ? `${dist.low} موظف ضمن الفئة المنخفضة. قد يعكس ذلك عبء عمل غير متوازن أو مهامًا معطّلة أكثر من كونه ضعف أداء — يُنصح بمراجعة توزيع المهام قبل أي استنتاج.`
        : `${dist.low} employee(s) fall in the Low band. This may reflect uneven workload or blocked tasks rather than poor performance — review task distribution before drawing conclusions.`,
    });
  }

  // ---------------------------------------------------------------- §3
  blocks.push({ kind: 'h2', text: ar ? '٣. الدرجة السنوية لكل موظف' : '3. Yearly score per employee' });
  if (ranked.length) {
    blocks.push({ kind: 'chart', id: 'yearly' });
    blocks.push({
      kind: 'table', id: 'yearlyTbl', accent: '#f0f7f4',
      head: [ar ? 'الموظف' : 'Employee', ar ? 'الدرجة السنوية' : 'Yearly score', ar ? 'الفئة' : 'Band'],
      rows: ranked.map((r) => [
        ar ? r.nameAr || r.name : r.name,
        r.yearly,
        tierLabel(tierFromComposite(r.yearly), ar),
      ]),
    });
  } else {
    blocks.push({ kind: 'empty', text: ar ? 'لا توجد بيانات.' : 'No data.' });
  }

  // ---------------------------------------------------------------- §4
  blocks.push({ kind: 'h2', text: ar ? '٤. الأداء الشهري' : '4. Monthly performance' });
  if (ranked.length) {
    blocks.push({
      kind: 'table', id: 'matrix', accent: '#f0f7f4',
      head: [
        ar ? 'الموظف' : 'Employee',
        ...data.monthLabels,
        ar ? 'السنة' : 'Year',
      ],
      rows: ranked.map((r) => [
        ar ? r.nameAr || r.name : r.name,
        ...r.cells.map((c) => (c && c.composite > 0 ? c.composite : '—')),
        r.yearly,
      ]),
    });
    blocks.push({
      kind: 'note',
      text: ar
        ? 'الأرقام أعلاه درجات مركّبة (0–100). راجع الفئات في القسم الأول لتفسيرها.'
        : 'Figures above are composite scores (0–100). See section 1 for how to interpret them.',
    });
  } else {
    blocks.push({ kind: 'empty', text: ar ? 'لا توجد بيانات.' : 'No data.' });
  }

  const charts: ChartSpec[] = [
    {
      id: 'yearly',
      labels: ranked.map((r) => (ar ? r.nameAr || r.name : r.name)),
      values: ranked.map((r) => r.yearly),
      color: GREEN,
    },
  ];

  return (
    <PaginatedReport
      blocks={blocks}
      charts={charts}
      ar={ar}
      settings={settings}
      landscape
      title={ar ? 'تقرير أداء الموظفين' : 'Employee Performance Report'}
      subtitle={ar ? data.orgNameAr || data.orgName : data.orgName}
      meta={`${ar ? 'النطاق: ' : 'Scope: '}${data.scopeLabel} · ${ar ? 'السنة: ' : 'Year: '}${data.year}`}
    />
  );
}
