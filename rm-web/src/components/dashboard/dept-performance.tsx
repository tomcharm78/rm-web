'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { PerfGauge } from '@/components/dashboard/perf-gauge';
import { PersonalPerformance } from '@/components/dashboard/personal-performance';
import { ComparisonTable } from '@/components/dashboard/comparison-table';
import {
  getDepartmentPerformance, getOrgWidePerformance, getOrgLeaderboard, listAllDepartments,
  getMyDepartmentId, getDeptTrend, getOrgDeptComparison, type MemberScore, type LeaderboardEntry,
} from '@/lib/dashboard/dept-queries';
import { tierLabel, tierColor, type PerfTier } from '@/lib/dashboard/scoring';
import { currentYearMonth, recentYearMonths } from '@/lib/dashboard/perf-queries';

const TC: Record<PerfTier, string> = { super: '#199e70', high: '#63991a', medium: '#eda100', low: '#e34948' };
const GR = '#e1e0d9';
const TM = '#898781';

function TierBadge({ tier, ar }: { tier: PerfTier; ar: boolean }) {
  return <span style={{ background: TC[tier] + '22', color: TC[tier], borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>{tierLabel(tier, ar)}</span>;
}
function Delta({ v }: { v: number }) {
  if (v === 0) return <span style={{ color: TM, fontSize: 12 }}>—</span>;
  return <span style={{ color: v > 0 ? '#199e70' : '#e34948', fontSize: 12 }}>{v > 0 ? `▲${v}` : `▼${Math.abs(v)}`}</span>;
}

// ---- Donut chart — tier distribution ----
function TierDonut({ tierCounts, memberCount, ar }: { tierCounts: Record<PerfTier, number>; memberCount: number; ar: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !ref.current) return;
      if (ref.current._chart) ref.current._chart.destroy();
      const labels = ar ? ['متميّز','مرتفع','متوسط','منخفض'] : ['Super','High','Medium','Low'];
      const data = [tierCounts.super, tierCounts.high, tierCounts.medium, tierCounts.low];
      ref.current._chart = new w.Chart(ref.current, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: [TC.super, TC.high, TC.medium, TC.low], borderWidth: 0, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (d: { label: string; raw: number }) => `${d.label}: ${d.raw}` } } } },
      });
    };
    if (w.Chart) draw();
    else { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = draw; document.body.appendChild(s); }
  }, [tierCounts, ar]);

  const tiers: PerfTier[] = ['super', 'high', 'medium', 'low'];
  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{ar ? 'توزيع التقييمات' : 'Tier distribution'}</div>
      <div style={{ fontSize: 11, color: TM, marginBottom: 12 }}>{ar ? 'كيف يتوزع الفريق' : 'how the team is spread'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <canvas ref={ref} role="img" aria-label="Donut chart showing tier distribution" />
        </div>
        <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {tiers.map((t) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: TC[t], flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>{tierLabel(t, ar)} <strong>{tierCounts[t]}</strong> · {memberCount > 0 ? Math.round((tierCounts[t] / memberCount) * 100) : 0}%</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Horizontal bar chart — composite scores per person ----
function ScoreBar({ members, ar, onSelect }: { members: MemberScore[]; ar: boolean; onSelect: (id: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!members.length || !ref.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !ref.current) return;
      if (ref.current._chart) ref.current._chart.destroy();
      const labels = members.map((m) => ar ? m.nameAr || m.name : m.name);
      const data = members.map((m) => m.result.composite);
      const colors = members.map((m) => TC[m.result.tier]);
      ref.current._chart = new w.Chart(ref.current, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, barThickness: 18 }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, max: 100, grid: { color: GR }, ticks: { color: TM, font: { size: 10 } }, border: { display: false } }, y: { grid: { display: false }, ticks: { color: TM, font: { size: 11 } } } },
          onClick: (_: Event, els: { index: number }[]) => { if (els.length) onSelect(members[els[0].index].userId); },
        },
      });
    };
    if (w.Chart) draw();
    else { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = draw; document.body.appendChild(s); }
  }, [members, ar, onSelect]);

  const h = Math.max(160, members.length * 34 + 40);
  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{ar ? 'المؤشر المركّب لكل موظف' : 'Composite score per person'}</div>
      <div style={{ fontSize: 11, color: TM, marginBottom: 10 }}>{ar ? 'انقر على الشريط للتفاصيل' : 'click a bar to drill in'}</div>
      <div style={{ position: 'relative', height: h }}>
        <canvas ref={ref} role="img" aria-label="Horizontal bar chart of composite scores" />
      </div>
    </div>
  );
}

// ---- Scatter chart — workload (tasks) vs score ----
function WorkloadScatter({ members, ar }: { members: MemberScore[]; ar: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!members.length || !ref.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !ref.current) return;
      if (ref.current._chart) ref.current._chart.destroy();
      const pts = members.map((m) => ({ x: m.result.tasksClosed, y: m.result.composite, label: ar ? m.nameAr || m.name : m.name }));
      ref.current._chart = new w.Chart(ref.current, {
        type: 'scatter',
        data: { datasets: [{ data: pts, backgroundColor: members.map((m) => TC[m.result.tier]), pointRadius: 8, pointHoverRadius: 10 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (d: { raw: { x: number; y: number; label: string } }) => `${d.raw.label}: ${d.raw.x} tasks · score ${d.raw.y}` } } },
          scales: {
            x: { title: { display: true, text: ar ? 'المهام المنجزة' : 'Tasks closed', color: TM, font: { size: 10 } }, grid: { color: GR }, ticks: { color: TM, font: { size: 10 } }, border: { display: false }, min: 0 },
            y: { title: { display: true, text: ar ? 'المؤشر المركّب' : 'Composite score', color: TM, font: { size: 10 } }, beginAtZero: true, max: 100, grid: { color: GR }, ticks: { color: TM, font: { size: 10 } }, border: { display: false } },
          },
        },
      });
    };
    if (w.Chart) draw();
    else { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = draw; document.body.appendChild(s); }
  }, [members, ar]);

  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{ar ? 'الحجم مقابل الجودة' : 'Workload vs. score'}</div>
      <div style={{ fontSize: 11, color: TM, marginBottom: 10 }}>{ar ? 'هل الكمية تعكس الجودة؟' : 'is high volume rewarded?'}</div>
      <div style={{ position: 'relative', height: 190 }}>
        <canvas ref={ref} role="img" aria-label="Scatter chart of tasks closed vs composite score" />
      </div>
    </div>
  );
}
// ---- Performance trend chart — dept avg composite + tasks closed ----
function TrendChart({ data, ar }: { data: { ym: string; avgComposite: number; totalClosed: number }[]; ar: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!data.length || !ref.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !ref.current) return;
      if (ref.current._chart) ref.current._chart.destroy();
      const labels = data.map((d) => { const [y, m] = d.ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(ar ? 'ar' : 'en', { month: 'short' }); });
      ref.current._chart = new w.Chart(ref.current, {
        type: 'bar',
        data: { labels, datasets: [
          { type: 'line', label: ar ? 'متوسط المهام' : 'Tasks trend', data: data.map((d) => d.totalClosed), borderColor: '#2a78d6', backgroundColor: 'rgba(42,120,214,0.08)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#2a78d6', yAxisID: 'y' },
          { type: 'bar', label: ar ? 'المهام المنجزة' : 'Tasks closed', data: data.map((d) => d.totalClosed), backgroundColor: '#eda100', borderRadius: 4, barThickness: 20, yAxisID: 'y1' },
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: {
          y: { beginAtZero: true, grid: { color: GR }, ticks: { color: TM, font: { size: 10 } }, border: { display: false } },
          x: { grid: { display: false }, ticks: { color: TM, font: { size: 10 } } },
        }},
      });
    };
    if (w.Chart) draw();
    else { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = draw; document.body.appendChild(s); }
  }, [data, ar]);
  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{ar ? 'مسار الأداء' : 'Performance trend'}</div>
          <div style={{ fontSize: 11, color: TM }}>{ar ? 'متوسط المؤشر والمهام المنجزة — آخر 6 أشهر' : 'avg score and tasks closed — last 6 months'}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: TM }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 2, background: '#2a78d6', display: 'inline-block', borderRadius: 2 }} />{ar ? 'المؤشر' : 'Score'}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#eda100', display: 'inline-block', borderRadius: 2 }} />{ar ? 'المهام' : 'Tasks'}</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 180 }}>
        <canvas ref={ref} role="img" aria-label={ar ? 'مخطط مسار أداء القسم' : 'Department performance trend chart'} />
      </div>
    </div>
  );
}

// ---- Dept comparison — stacked bar by tier (super admin only) ----
function DeptComparisonChart({ data, ar }: { data: { deptId: string; name: string; nameAr: string; tierCounts: Record<PerfTier, number> }[]; ar: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!data.length || !ref.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !ref.current) return;
      if (ref.current._chart) ref.current._chart.destroy();
      const labels = data.map((d) => ar ? d.nameAr || d.name : d.name);
      const mkDs = (tier: PerfTier, color: string, label: string) => ({ label, data: data.map((d) => d.tierCounts[tier]), backgroundColor: color, borderRadius: 0, barThickness: 32 });
      ref.current._chart = new w.Chart(ref.current, {
        type: 'bar',
        data: { labels, datasets: [mkDs('super', TC.super, ar ? 'متميّز' : 'Super'), mkDs('high', TC.high, ar ? 'مرتفع' : 'High'), mkDs('medium', TC.medium, ar ? 'متوسط' : 'Medium'), mkDs('low', TC.low, ar ? 'منخفض' : 'Low')] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: TM, font: { size: 11 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: GR }, ticks: { color: TM, font: { size: 10 }, stepSize: 1 }, border: { display: false } },
        }},
      });
    };
    if (w.Chart) draw();
    else { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = draw; document.body.appendChild(s); }
  }, [data, ar]);
  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{ar ? 'مقارنة الأقسام' : 'Department comparison'}</div>
      <div style={{ fontSize: 11, color: TM, marginBottom: 10 }}>{ar ? 'توزيع التقييمات لكل قسم' : 'tier breakdown per department'}</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['super', 'high', 'medium', 'low'] as PerfTier[]).map((t) => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: TC[t], display: 'inline-block' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{tierLabel(t, ar)}</span>
          </span>
        ))}
      </div>
      <div style={{ position: 'relative', height: 160 }}>
        <canvas ref={ref} role="img" aria-label={ar ? 'مخطط مقارنة الأقسام' : 'Department comparison stacked bar chart'} />
      </div>
    </div>
  );
}

// ---- KPI tiles ----
function KpiTiles({ kpis, ar }: { kpis: { totalClosed: number; onTimeRate: number; avgComposite: number; tierCounts: Record<PerfTier, number>; memberCount: number }; ar: boolean }) {
  const tiles = [
    { label: ar ? 'مهام منجزة' : 'Tasks closed', value: kpis.totalClosed },
    { label: ar ? 'نسبة الالتزام' : 'On-time rate', value: `${kpis.onTimeRate}%` },
    { label: ar ? 'متوسط المؤشر' : 'Avg score', value: kpis.avgComposite },
    { label: ar ? 'عدد الموظفين' : 'Members', value: kpis.memberCount },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
      {tiles.map((t, i) => (
        <div key={i} style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius)', padding: '12px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-primary)' }}>{t.value}</div>
          <div style={{ fontSize: 11, color: TM }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---- ranked table (detail view, collapsible) ----
function RankedTable({ members, ar, onSelect }: { members: MemberScore[]; ar: boolean; onSelect: (id: string) => void }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 4 }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr style={{ color: TM, fontSize: 11, textAlign: 'left' }}>
            <th style={{ padding: '4px 4px', fontWeight: 400 }}>#</th>
            <th style={{ padding: '4px 4px', fontWeight: 400 }}>{ar ? 'الموظف' : 'Officer'}</th>
            <th style={{ padding: '4px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'المؤشر' : 'Score'}</th>
            <th style={{ padding: '4px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'التقييم' : 'Tier'}</th>
            <th style={{ padding: '4px 4px', fontWeight: 400, textAlign: 'center' }}>Vol</th>
            <th style={{ padding: '4px 4px', fontWeight: 400, textAlign: 'center' }}>Time</th>
            <th style={{ padding: '4px 4px', fontWeight: 400, textAlign: 'center' }}>Out</th>
            <th style={{ padding: '4px 4px', fontWeight: 400, textAlign: 'center' }}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }} onClick={() => onSelect(m.userId)}>
              <td style={{ padding: '6px 4px', color: TM, fontWeight: 500 }}>{m.rank}</td>
              <td style={{ padding: '6px 4px' }}>
                <div style={{ fontWeight: 500 }}>{ar ? m.nameAr || m.name : m.name}</div>
                <div style={{ fontSize: 10, color: TM }}>{m.role}</div>
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, color: TC[m.result.tier] }}>{m.result.composite}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center' }}><TierBadge tier={m.result.tier} ar={ar} /></td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: TM }}>{m.result.volumeScore}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: TM }}>{m.result.timelinessScore}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: TM }}>{m.result.outcomesScore}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center' }}><Delta v={m.delta} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- employee of month card ----
function EmployeeOfMonth({ entry, ar }: { entry: LeaderboardEntry; ar: boolean }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#1a6b4a,#199e70)', borderRadius: 12, padding: '1rem 1.25rem', color: '#fff', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>🏆 {ar ? 'موظف الشهر' : 'Employee of the month'}</div>
        <div style={{ fontSize: 17, fontWeight: 500 }}>{ar ? entry.nameAr || entry.name : entry.name}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{ar ? entry.deptNameAr || entry.deptName : entry.deptName}</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 14, fontSize: 12 }}>
          <span>{ar ? 'المؤشر:' : 'Score:'} <strong>{entry.composite}</strong></span>
          <span>{ar ? 'التقييم:' : 'Tier:'} <strong>{tierLabel(entry.tier, ar)}</strong></span>
        </div>
      </div>
      <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 16px' }}>
        <div style={{ fontSize: 28, fontWeight: 500 }}>{entry.composite}</div>
        <div style={{ fontSize: 11, opacity: 0.8 }}>{ar ? 'مؤشر' : 'Score'}</div>
      </div>
    </div>
  );
}

// ---- top 5 leaderboard ----
function Leaderboard({ entries, ar }: { entries: LeaderboardEntry[]; ar: boolean }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{ar ? 'أفضل 5 موظفين' : 'Top 5 performers'}</div>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          {entries.map((e) => (
            <tr key={e.userId} style={{ borderTop: '0.5px solid var(--border)' }}>
              <td style={{ padding: '7px 4px', color: TM, width: 24 }}>{e.rank}</td>
              <td style={{ padding: '7px 4px' }}>
                <div style={{ fontWeight: 500 }}>{ar ? e.nameAr || e.name : e.name}</div>
                <div style={{ fontSize: 11, color: TM }}>{ar ? e.deptNameAr || e.deptName : e.deptName}</div>
              </td>
              <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                <TierBadge tier={e.tier} ar={ar} />
                <span style={{ marginLeft: 8, fontWeight: 600, color: TC[e.tier] }}>{e.composite}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- main component ----
export function DeptPerformanceView({ role, userId }: { role: string; userId: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const ym = currentYearMonth();
  const isSuper = role === 'super_admin';
  const isAdmin = role === 'admin';

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(isSuper ? 'overall' : null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const myDeptQ = useQuery({ queryKey: ['my-dept-id'], queryFn: getMyDepartmentId, enabled: isAdmin });
  const allDeptsQ = useQuery({ queryKey: ['all-depts'], queryFn: listAllDepartments, enabled: isSuper });
  const leaderQ = useQuery({ queryKey: ['org-leaderboard', ym], queryFn: () => getOrgLeaderboard(ym), enabled: isSuper });

  const deptId = isSuper ? selectedDeptId : (myDeptQ.data ?? null);
  const isOverall = deptId === 'overall';

  const trendMonths = recentYearMonths(6).reverse();
  const trendQ = useQuery({
    queryKey: ['dept-trend', deptId, trendMonths.join(',')],
    queryFn: () => getDeptTrend(deptId, trendMonths),
    enabled: !!deptId,
  });

  const deptCompareQ = useQuery({
    queryKey: ['dept-compare', ym, (allDeptsQ.data ?? []).map((d) => d.id).join(',')],
    queryFn: () => getOrgDeptComparison(ym, allDeptsQ.data ?? []),
    enabled: isSuper && !!(allDeptsQ.data?.length),
  });
  const deptPerfQ = useQuery({
    queryKey: ['dept-perf', deptId, ym],
    queryFn: () => isOverall ? getOrgWidePerformance(ym) : getDepartmentPerformance(deptId!, ym),
    enabled: !!deptId,
  });
  const deptPerf = deptPerfQ.data;

  return (
    <div style={{ marginTop: 24 }}>
      {isSuper && (
        <>
          {leaderQ.data?.employeeOfMonth && <EmployeeOfMonth entry={leaderQ.data.employeeOfMonth} ar={ar} />}
          {leaderQ.data?.top5?.length ? <Leaderboard entries={leaderQ.data.top5} ar={ar} /> : null}
          <div style={{ marginBottom: 14 }}>
            <select value={selectedDeptId ?? ''} onChange={(e) => { setSelectedDeptId(e.target.value || null); setSelectedUserId(null); setShowTable(false); }}
              style={{ borderRadius: 8, border: '0.5px solid var(--border)', padding: '6px 10px', fontSize: 13, background: 'var(--surface-1)' }}>
              <option value="overall">{ar ? 'الكل — نظرة شاملة' : 'Overall — all departments'}</option>
              <option value="">{ar ? '— قسم محدد —' : '— specific department —'}</option>
              {(allDeptsQ.data ?? []).map((d) => <option key={d.id} value={d.id}>{ar ? d.nameAr || d.name : d.name}</option>)}
            </select>
          </div>
        </>
      )}

      {deptId && deptPerf && (
        <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
            {isOverall ? (ar ? 'الأداء العام — جميع الأقسام' : 'Overall — all departments') : (ar ? 'أداء القسم' : 'Department performance')}
          </div>
          <div style={{ fontSize: 11, color: TM, marginBottom: 14 }}>{ym} · {deptPerf.kpis.memberCount} {ar ? 'عضو' : 'members'}</div>

          {!selectedUserId && (
            <>
              <KpiTiles kpis={deptPerf.kpis} ar={ar} />
              {trendQ.data && <TrendChart data={trendQ.data} ar={ar} />}
              {isSuper && isOverall && deptCompareQ.data && deptCompareQ.data.length > 1 && (
                <DeptComparisonChart data={deptCompareQ.data} ar={ar} />
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
                <TierDonut tierCounts={deptPerf.kpis.tierCounts} memberCount={deptPerf.kpis.memberCount} ar={ar} />
                <ScoreBar members={deptPerf.members} ar={ar} onSelect={setSelectedUserId} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <WorkloadScatter members={deptPerf.members} ar={ar} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ar ? 'عرض جدول التفاصيل' : 'Detailed rankings table'}</div>
                <button onClick={() => setShowTable((x) => !x)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface-1)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                  {showTable ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'عرض' : 'Show')}
                </button>
              </div>
              {showTable && <RankedTable members={deptPerf.members} ar={ar} onSelect={setSelectedUserId} />}
            </>
          )}

          {selectedUserId && (() => {
            const member = deptPerf.members.find((m) => m.userId === selectedUserId);
            return (
              <div>
                <button onClick={() => setSelectedUserId(null)} style={{ fontSize: 12, color: TM, marginBottom: 12, background: 'none', border: 'none', cursor: 'pointer' }}>
                  ← {ar ? 'رجوع' : 'Back'}
                </button>
                {member && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {ar ? `الترتيب #${member.rank} من ${deptPerf.kpis.memberCount}` : `Ranked #${member.rank} of ${deptPerf.kpis.memberCount}`}
                  </div>
                )}
                <PersonalPerformance userId={selectedUserId} userName={member ? (ar ? member.nameAr || member.name : member.name) : undefined} />
              </div>
            );
          })()}

          {!selectedUserId && deptId && (
            <ComparisonTable deptId={isOverall ? null : deptId} orgWide={isOverall} ar={ar} />
          )}
        </div>
      )}

      {isAdmin && !deptId && !myDeptQ.isLoading && (
        <div style={{ color: TM, fontSize: 13 }}>{ar ? 'لم يتم تعيين قسم لحسابك.' : 'No department assigned to your account.'}</div>
      )}
    </div>
  );
}
