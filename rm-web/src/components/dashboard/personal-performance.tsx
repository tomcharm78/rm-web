'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { PerfGauge } from '@/components/dashboard/perf-gauge';
import {
  getMonthlyPerformance, getYearlyPerformance, currentYearMonth, recentYearMonths,
} from '@/lib/dashboard/perf-queries';
import type { PerfResult } from '@/lib/dashboard/scoring';

function Bar({ label, hint, value, color }: { label: string; hint: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{label} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· {hint}</span></span>
        <span style={{ fontWeight: 500, color }}>{value}</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-0)', borderRadius: 99 }}>
        <div style={{ width: `${value}%`, height: 6, background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

function coachingNote(r: PerfResult, ar: boolean): string {
  const parts = [
    { key: 'volume', v: r.volumeScore },
    { key: 'timeliness', v: r.timelinessScore },
    { key: 'outcomes', v: r.outcomesScore },
  ].sort((a, b) => a.v - b.v);
  const weakest = parts[0];
  if (r.tier === 'super') return ar ? 'أداء متميّز — استمر على هذا المستوى.' : 'Excellent work — keep it up.';
  const map: Record<string, [string, string]> = {
    volume: ['Taking on a few more tasks would lift your score.', 'إنجاز مهام إضافية سيرفع تقييمك.'],
    timeliness: ['Closing tasks a little faster would move you up.', 'إغلاق المهام بسرعة أكبر سيرفع تقييمك.'],
    outcomes: ['Resolving more challenges would raise your score.', 'حل المزيد من التحديات سيرفع تقييمك.'],
  };
  return ar ? map[weakest.key][1] : map[weakest.key][0];
}

// month label like '2026-06' -> 'Jun'
function monthShort(ym: string, ar: boolean): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(ar ? 'ar' : 'en', { month: 'short' });
}

export function PersonalPerformance({ userId, userName }: { userId: string; userName?: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const ym = currentYearMonth();
  const year = new Date().getUTCFullYear();

  // last month key
  const lastMonthKey = (() => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  })();

  const monthQ = useQuery({ queryKey: ['perf-month', userId, ym], queryFn: () => getMonthlyPerformance(userId, ym) });
  const lastQ = useQuery({ queryKey: ['perf-month', userId, lastMonthKey], queryFn: () => getMonthlyPerformance(userId, lastMonthKey) });
  const yearQ = useQuery({ queryKey: ['perf-year', userId, year], queryFn: () => getYearlyPerformance(userId, year) });

  // 6-month trend for the bar chart
  const trendMonths = recentYearMonths(6).reverse();
  const trendQ = useQuery({
    queryKey: ['perf-trend', userId, trendMonths.join(',')],
    queryFn: async () => Promise.all(trendMonths.map((mk) => getMonthlyPerformance(userId, mk))),
  });

  const m = monthQ.data, last = lastQ.data, y = yearQ.data;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!trendQ.data || !canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !canvasRef.current) return;
      if (canvasRef.current._chart) canvasRef.current._chart.destroy();
      const labels = trendMonths.map((mk) => monthShort(mk, ar));
      const data = trendQ.data!.map((r) => r.composite);
      const colors = trendQ.data!.map((r) =>
        r.tier === 'super' ? '#199e70' : r.tier === 'high' ? '#63991a' : r.tier === 'medium' ? '#c98500' : '#e34948'
      );
      canvasRef.current._chart = new w.Chart(canvasRef.current, {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, barThickness: 22 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, max: 100, grid: { color: '#e1e0d9' }, ticks: { color: '#898781' } }, x: { grid: { display: false }, ticks: { color: '#898781' } } },
        },
      });
    };
    if (w.Chart) draw();
    else {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload = draw;
      document.body.appendChild(s);
    }
  }, [trendQ.data, ar, trendMonths]);

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{ar ? 'مؤشر أدائك' : 'Your performance index'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          {userName ? `${userName} · ` : ''}{ar ? 'الشهر الماضي · هذا الشهر · هذا العام' : 'last month · this month · this year'}
        </div>

        {(monthQ.isLoading || yearQ.isLoading) && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{ar ? 'جارٍ الحساب…' : 'Calculating…'}</p>}

        {m && last && y && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <PerfGauge score={last.composite} tier={last.tier} label={ar ? 'الشهر الماضي' : 'Last month'} ar={ar} size={165} />
              <PerfGauge score={m.composite} tier={m.tier} label={ar ? 'هذا الشهر' : 'This month'} ar={ar} size={165} />
              <PerfGauge score={y.composite} tier={y.tier} label={ar ? 'هذا العام' : 'This year'} ar={ar} size={165} />
            </div>

            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 14, marginTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {ar ? 'سبب التقييم — مكوّناتك هذا الشهر:' : 'Why this score — your components this month:'}
              </div>
              <Bar label={ar ? 'الكمية' : 'Volume'} hint={ar ? 'حجم الإنجاز' : 'how much you handle'} value={m.volumeScore} color="#2a78d6" />
              <Bar label={ar ? 'الالتزام بالوقت' : 'Timeliness'} hint={ar ? 'الالتزام والسرعة' : 'on-time & speed'} value={m.timelinessScore} color={m.timelinessScore < 60 ? '#eda100' : '#199e70'} />
              <Bar label={ar ? 'النتائج' : 'Outcomes'} hint={ar ? 'التحديات والأثر' : 'challenges & impact'} value={m.outcomesScore} color={m.outcomesScore < 60 ? '#eda100' : '#199e70'} />

              {m.outcomesBasis === 'tasks_fallback' && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4 }}>
                  {ar ? 'النتائج محسوبة من المهام المنجزة (لا توجد تحديات هذا الشهر).' : 'Outcomes based on closed tasks (no challenges this month).'}
                </p>
              )}

              <div style={{ marginTop: 14, background: 'var(--bg-warning)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-warning)' }}>
                {coachingNote(m, ar)}
              </div>
            </div>

            <div style={{ marginTop: 18, borderTop: '0.5px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{ar ? 'الأداء الشهري (آخر 6 أشهر)' : 'Monthly performance (last 6 months)'}</div>
              <div style={{ position: 'relative', width: '100%', height: 180 }}>
                <canvas ref={canvasRef} role="img" aria-label={ar ? 'رسم بياني للأداء الشهري' : 'Monthly performance bar chart'} />
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{ar ? 'إنجازك هذا الشهر' : 'Your month at a glance'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, textAlign: 'center' }}>
                <Stat label={ar ? 'مهام منجزة' : 'Tasks closed'} value={m.tasksClosed} />
                <Stat label={ar ? 'في الوقت' : 'On-time'} value={m.tasksClosed ? `${Math.round((m.tasksOnTime / m.tasksClosed) * 100)}%` : '—'} />
                <Stat label={ar ? 'تحديات محلولة' : 'Challenges'} value={m.challengesResolved} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 6px' }}>
      <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
