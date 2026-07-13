'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { getMonthlyPerformance, getYearlyPerformance, recentYearMonths } from '@/lib/dashboard/perf-queries';
import { tierColor, tierLabel, type PerfTier } from '@/lib/dashboard/scoring';
import { getDepartmentPerformance, getOrgWidePerformance } from '@/lib/dashboard/dept-queries';

type CellData = { composite: number; tier: PerfTier };
type MemberRow = { userId: string; name: string; nameAr: string; cells: (CellData | null)[] };

function monthShort(ym: string, ar: boolean): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(ar ? 'ar' : 'en', { month: 'short' });
}

function currentYear(): number { return new Date().getUTCFullYear(); }

function yearMonths(year: number): string[] {
  const now = new Date();
  const lastMonth = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
  const out: string[] = [];
  for (let m = 1; m <= lastMonth; m++) out.push(`${year}-${String(m).padStart(2, '0')}`);
  return out;
}

export function ComparisonTable({ deptId, orgWide, ar: arProp }: { deptId: string | null; orgWide?: boolean; ar?: boolean }) {
  const { language } = useLanguage();
  const ar = arProp ?? language === 'ar';
  const year = currentYear();
  const months = yearMonths(year);

  const deptQ = useQuery({
    queryKey: ['dept-perf-compare', orgWide ? 'overall' : deptId, months[0]],
    queryFn: () => orgWide ? getOrgWidePerformance(months[0]) : getDepartmentPerformance(deptId!, months[0]),
  });
  

  const members = deptQ.data?.members ?? [];

  // fetch all month × member scores
  const matrixQ = useQuery({
    queryKey: ['compare-matrix', orgWide ? 'overall' : deptId, year],
    queryFn: async () => {
      if (!members.length) return [];
      const rows: MemberRow[] = await Promise.all(
        members.map(async (m) => {
          const results = await Promise.all(months.map((ym) => getMonthlyPerformance(m.userId, ym)));
          return {
            userId: m.userId,
            name: m.name,
            nameAr: m.nameAr,
            cells: results.map((r) => ({ composite: r.composite, tier: r.tier })),
          };
        })
      );
      return rows;
    },
    enabled: members.length > 0,
  });

  // yearly summary per member
  const yearlyQ = useQuery({
    queryKey: ['yearly-compare', orgWide ? 'overall' : deptId, year],
    queryFn: async () => {
      if (!members.length) return [];
      return Promise.all(members.map((m) => getYearlyPerformance(m.userId, year)));
    },
    enabled: members.length > 0,
  });

  const matrix = matrixQ.data ?? [];
  const yearly = yearlyQ.data ?? [];

  if (deptQ.isLoading) return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>;
  if (!members.length) return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{ar ? 'لا يوجد أعضاء.' : 'No members.'}</p>;

  return (
    <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '1rem 1.25rem', marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{ar ? 'مقارنة شهرية' : 'Monthly comparison'} — {year}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ar ? 'المؤشر المركّب لكل موظف شهريًا' : 'Composite score per member per month'}</div>
        </div>
      </div>

      {matrixQ.isLoading && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ar ? 'جارٍ حساب المصفوفة…' : 'Computing matrix…'}</p>}

      {matrix.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                <th style={{ padding: '4px 6px', textAlign: 'start', minWidth: 100 }}>{ar ? 'الموظف' : 'Member'}</th>
                {months.map((ym) => (
                  <th key={ym} style={{ padding: '4px 6px', textAlign: 'center', minWidth: 44 }}>{monthShort(ym, ar)}</th>
                ))}
                <th style={{ padding: '4px 6px', textAlign: 'center', minWidth: 44, borderLeft: '1px solid var(--border)' }}>{ar ? 'السنة' : 'Year'}</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={row.userId} style={{ borderTop: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '7px 6px', fontWeight: 500 }}>{ar ? row.nameAr || row.name : row.name}</td>
                  {row.cells.map((cell, j) => (
                    <td key={j} style={{ padding: '7px 6px', textAlign: 'center' }}>
                      {cell && cell.composite > 0 ? (
                        <span style={{
                          display: 'inline-block', minWidth: 28, padding: '2px 4px',
                          borderRadius: 4, fontSize: 11, fontWeight: 500,
                          background: tierColor(cell.tier) + '22',
                          color: tierColor(cell.tier),
                        }}>
                          {cell.composite}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  ))}
                  <td style={{ padding: '7px 6px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                    {yearly[i] ? (
                      <span style={{
                        display: 'inline-block', minWidth: 28, padding: '2px 4px',
                        borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: tierColor(yearly[i].tier) + '33',
                        color: tierColor(yearly[i].tier),
                      }}>
                        {yearly[i].composite}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* tier legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {(['super', 'high', 'medium', 'low'] as PerfTier[]).map((t) => (
          <span key={t} style={{ fontSize: 11, color: tierColor(t), display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: tierColor(t), display: 'inline-block' }} />
            {tierLabel(t, ar)}
          </span>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {ar ? '— = لا نشاط هذا الشهر' : '— = no activity this month'}
        </span>
      </div>
    </div>
  );
}
