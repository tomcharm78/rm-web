'use client';

import { useState, useEffect, useRef } from 'react';
import { ComparisonTable } from '@/components/dashboard/comparison-table';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { PerfGauge } from '@/components/dashboard/perf-gauge';
import { PersonalPerformance } from '@/components/dashboard/personal-performance';
import {
  getDepartmentPerformance, getOrgWidePerformance, getOrgLeaderboard, listAllDepartments,
  getMyDepartmentId, type MemberScore, type LeaderboardEntry,
} from '@/lib/dashboard/dept-queries';
import { tierLabel, tierColor, type PerfTier } from '@/lib/dashboard/scoring';
import { currentYearMonth } from '@/lib/dashboard/perf-queries';

const TIER_COLORS: Record<PerfTier, string> = {
  super: '#199e70', high: '#63991a', medium: '#c98500', low: '#e34948',
};

function TierBadge({ tier, ar }: { tier: PerfTier; ar: boolean }) {
  return (
    <span style={{
      background: TIER_COLORS[tier] + '22', color: TIER_COLORS[tier],
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500,
    }}>
      {tierLabel(tier, ar)}
    </span>
  );
}

function Delta({ v }: { v: number }) {
  if (v === 0) return <span style={{ color: '#898781', fontSize: 12 }}>—</span>;
  return <span style={{ color: v > 0 ? '#199e70' : '#e34948', fontSize: 12 }}>{v > 0 ? `▲${v}` : `▼${Math.abs(v)}`}</span>;
}

// ---- KPI tiles ----
function KpiTiles({ kpis, ar }: { kpis: ReturnType<typeof getDepartmentPerformance> extends Promise<infer T> ? T : never; ar: boolean }) {
  const { totalClosed, onTimeRate, avgComposite, tierCounts, memberCount } = (kpis as { totalClosed: number; onTimeRate: number; avgComposite: number; tierCounts: Record<PerfTier, number>; memberCount: number });
  const tiles = [
    { label: ar ? 'مهام منجزة' : 'Tasks closed', value: totalClosed },
    { label: ar ? 'نسبة الالتزام' : 'On-time rate', value: `${onTimeRate}%` },
    { label: ar ? 'متوسط المؤشر' : 'Avg score', value: avgComposite },
    { label: ar ? 'متميّز' : 'Super', value: tierCounts.super, color: '#199e70' },
    { label: ar ? 'مرتفع' : 'High', value: tierCounts.high, color: '#63991a' },
    { label: ar ? 'متوسط' : 'Medium', value: tierCounts.medium, color: '#c98500' },
    { label: ar ? 'منخفض' : 'Low', value: tierCounts.low, color: '#e34948' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 10, marginBottom: 20 }}>
      {tiles.map((t, i) => (
        <div key={i} style={{ background: 'var(--surface-1)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: t.color ?? 'var(--text-primary)' }}>{t.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---- ranked table ----
function RankedTable({ members, ar, onSelect }: { members: MemberScore[]; ar: boolean; onSelect: (id: string) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'left' }}>
            <th style={{ padding: '6px 4px', fontWeight: 400 }}>#</th>
            <th style={{ padding: '6px 4px', fontWeight: 400 }}>{ar ? 'الموظف' : 'Officer'}</th>
            <th style={{ padding: '6px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'المؤشر' : 'Score'}</th>
            <th style={{ padding: '6px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'التقييم' : 'Tier'}</th>
            <th style={{ padding: '6px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'الكمية' : 'Vol'}</th>
            <th style={{ padding: '6px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'الوقت' : 'Time'}</th>
            <th style={{ padding: '6px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'النتائج' : 'Out'}</th>
            <th style={{ padding: '6px 4px', fontWeight: 400, textAlign: 'center' }}>{ar ? 'التغيير' : 'Δ'}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }}
              onClick={() => onSelect(m.userId)}>
              <td style={{ padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>{m.rank}</td>
              <td style={{ padding: '8px 4px' }}>
                <div style={{ fontWeight: 500 }}>{ar ? m.nameAr || m.name : m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.role}</div>
              </td>
              <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600, color: TIER_COLORS[m.result.tier] }}>{m.result.composite}</td>
              <td style={{ padding: '8px 4px', textAlign: 'center' }}><TierBadge tier={m.result.tier} ar={ar} /></td>
              <td style={{ padding: '8px 4px', textAlign: 'center' }}>{m.result.volumeScore}</td>
              <td style={{ padding: '8px 4px', textAlign: 'center' }}>{m.result.timelinessScore}</td>
              <td style={{ padding: '8px 4px', textAlign: 'center' }}>{m.result.outcomesScore}</td>
              <td style={{ padding: '8px 4px', textAlign: 'center' }}><Delta v={m.delta} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- workload bar chart ----
function WorkloadChart({ members, ar }: { members: MemberScore[]; ar: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!members.length || !canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const draw = () => {
      if (!w.Chart || !canvasRef.current) return;
      if (canvasRef.current._chart) canvasRef.current._chart.destroy();
      canvasRef.current._chart = new w.Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels: members.map((m) => ar ? m.nameAr || m.name : m.name),
          datasets: [{ data: members.map((m) => m.result.tasksClosed), backgroundColor: members.map((m) => TIER_COLORS[m.result.tier]), borderRadius: 4, barThickness: 20 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#e1e0d9' }, ticks: { color: '#898781' } }, x: { grid: { display: false }, ticks: { color: '#898781' } } } },
      });
    };
    if (w.Chart) draw();
    else { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = draw; document.body.appendChild(s); }
  }, [members, ar]);
  return (
    <div style={{ position: 'relative', height: 160, marginTop: 12 }}>
      <canvas ref={canvasRef} role="img" aria-label={ar ? 'توزيع العمل' : 'Workload distribution'} />
    </div>
  );
}

// ---- employee of month card ----
function EmployeeOfMonth({ entry, ar }: { entry: LeaderboardEntry; ar: boolean }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#1a6b4a,#199e70)', borderRadius: 12, padding: '1rem 1.25rem', color: '#fff', marginBottom: 16 }}>
      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>🏆 {ar ? 'موظف الشهر' : 'Employee of the month'}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{ar ? entry.nameAr || entry.name : entry.name}</div>
      <div style={{ fontSize: 12, opacity: 0.85 }}>{ar ? entry.deptNameAr || entry.deptName : entry.deptName}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 13 }}>
        <span>{ar ? 'المؤشر:' : 'Score:'} <strong>{entry.composite}</strong></span>
        <span>{ar ? 'التقييم:' : 'Tier:'} <strong>{tierLabel(entry.tier, ar)}</strong></span>
      </div>
    </div>
  );
}

// ---- top 5 leaderboard ----
function Leaderboard({ entries, ar }: { entries: LeaderboardEntry[]; ar: boolean }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{ar ? 'أفضل 5 موظفين' : 'Top 5 performers'}</div>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          {entries.map((e) => (
            <tr key={e.userId} style={{ borderTop: '0.5px solid var(--border)' }}>
              <td style={{ padding: '7px 4px', color: 'var(--text-muted)', width: 24 }}>{e.rank}</td>
              <td style={{ padding: '7px 4px' }}>
                <div style={{ fontWeight: 500 }}>{ar ? e.nameAr || e.name : e.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ar ? e.deptNameAr || e.deptName : e.deptName}</div>
              </td>
              <td style={{ padding: '7px 4px', textAlign: 'right' }}>
                <TierBadge tier={e.tier} ar={ar} />
                <span style={{ marginLeft: 8, fontWeight: 600, color: TIER_COLORS[e.tier] }}>{e.composite}</span>
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

  const myDeptQ = useQuery({ queryKey: ['my-dept-id'], queryFn: getMyDepartmentId, enabled: isAdmin });
  const allDeptsQ = useQuery({ queryKey: ['all-depts'], queryFn: listAllDepartments, enabled: isSuper });
  const leaderQ = useQuery({ queryKey: ['org-leaderboard', ym], queryFn: () => getOrgLeaderboard(ym), enabled: isSuper });

  const deptId = isSuper ? selectedDeptId : (myDeptQ.data ?? null);
  const isOverall = deptId === 'overall';
  const deptPerfQ = useQuery({
    queryKey: ['dept-perf', deptId, ym],
    queryFn: () => isOverall ? getOrgWidePerformance(ym) : getDepartmentPerformance(deptId!, ym),
    enabled: !!deptId,
  });

  const deptPerf = deptPerfQ.data;

  return (
    <div style={{ marginTop: 24 }}>
      {/* super: employee of month + top 5 + dept slicer */}
      {isSuper && (
        <>
          {leaderQ.data?.employeeOfMonth && <EmployeeOfMonth entry={leaderQ.data.employeeOfMonth} ar={ar} />}
          {leaderQ.data?.top5?.length ? <Leaderboard entries={leaderQ.data.top5} ar={ar} /> : null}

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{ar ? 'عرض قسم محدد:' : 'View department:'}</label>
            <select
              value={selectedDeptId ?? ''}
              onChange={(e) => { setSelectedDeptId(e.target.value || null); setSelectedUserId(null); }}
              style={{ borderRadius: 8, border: '0.5px solid var(--border)', padding: '6px 10px', fontSize: 13, background: 'var(--surface-1)' }}
            >
              <option value="overall">{ar ? 'الكل — نظرة شاملة' : 'Overall — all departments'}</option>
              <option value="">{ar ? '— قسم محدد —' : '— specific department —'}</option>
              {(allDeptsQ.data ?? []).map((d) => <option key={d.id} value={d.id}>{ar ? d.nameAr || d.name : d.name}</option>)}
            </select>
          </div>
        </>
      )}

      {/* dept view */}
      {deptId && deptPerf && (
        <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{isOverall ? (ar ? 'الأداء العام — جميع الأقسام' : 'Overall performance — all departments') : (ar ? 'أداء القسم' : 'Department performance')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{ym} · {deptPerf.kpis.memberCount} {ar ? 'عضو' : 'members'}</div>

          <KpiTiles kpis={deptPerf.kpis} ar={ar} />

          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{ar ? 'الترتيب والأداء الفردي' : 'Rankings & individual performance'}</div>

          {/* person slicer */}
          <div style={{ marginBottom: 12 }}>
            <select
              value={selectedUserId ?? ''}
              onChange={(e) => setSelectedUserId(e.target.value || null)}
              style={{ borderRadius: 8, border: '0.5px solid var(--border)', padding: '6px 10px', fontSize: 13, background: 'var(--surface-1)' }}
            >
              <option value="">{ar ? '— عرض الجدول الكامل —' : '— show full table —'}</option>
              {deptPerf.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  #{m.rank} {ar ? m.nameAr || m.name : m.name}
                </option>
              ))}
            </select>
          </div>

          {/* drill-in: individual view */}
          {selectedUserId ? (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setSelectedUserId(null)} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, background: 'none', border: 'none', cursor: 'pointer' }}>
                ← {ar ? 'رجوع للجدول' : 'Back to table'}
              </button>
              {(() => {
                const member = deptPerf.members.find((m) => m.userId === selectedUserId);
                return member ? (
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>
                      {ar ? `الترتيب #${member.rank} من ${deptPerf.kpis.memberCount} في القسم` : `Ranked #${member.rank} of ${deptPerf.kpis.memberCount} in department`}
                    </div>
                    <PersonalPerformance userId={selectedUserId} userName={ar ? member.nameAr || member.name : member.name} />
                  </div>
                ) : null;
              })()}
            </div>
          ) : (
            <>
              <RankedTable members={deptPerf.members} ar={ar} onSelect={setSelectedUserId} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 16, marginBottom: 4 }}>{ar ? 'توزيع العمل (المهام المنجزة لكل موظف)' : 'Workload balance (tasks closed per person)'}</div>
              <WorkloadChart members={deptPerf.members} ar={ar} />
            </>
          )}
        {!selectedUserId && deptId && (
          <ComparisonTable deptId={isOverall ? null : deptId} orgWide={isOverall} ar={ar} />
        )}
        </div>
      )}

      {isAdmin && !deptId && !myDeptQ.isLoading && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{ar ? 'لم يتم تعيين قسم لحسابك.' : 'No department assigned to your account.'}</div>
      )}
    </div>
  );
}
