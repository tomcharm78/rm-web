'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getTeamLeaveWindow } from '@/lib/vacations/queries';
import { getMyModulesControl } from '@/lib/modules/queries';
import { leaveTypeLabel } from '@/types/vacation';

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

const LEAVE_COLORS: Record<string, string> = {
  annual: '#199e70', sick: '#e34948', emergency: '#eda100', hajj: '#7c3aed',
  maternity: '#d6488f', paternity: '#2a78d6', death: '#64748b', unpaid: '#898781',
  business: '#0891b2', other: '#c98500',
};

export function TeamLeaveGantt({ role }: { role: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const modulesCtl = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const on = (modulesCtl.data?.settings ?? {})['vacations'] === true;

  const scope = role === 'super_admin' ? 'all' : 'team';

  // rolling window: today → +90 days
  const today = new Date();
  const fromDate = iso(today);
  const toDate = iso(addDays(today, 90));
  const totalDays = daysBetween(fromDate, toDate);

  const q = useQuery({
    queryKey: ['team-leave-window', scope, fromDate],
    queryFn: () => getTeamLeaveWindow(scope as 'team' | 'all', fromDate, toDate),
    enabled: on,
  });

  // month header segments across the 90-day window
  const monthMarkers = useMemo(() => {
    const marks: { label: string; leftPct: number }[] = [];
    const cur = new Date(fromDate + 'T00:00:00Z');
    cur.setUTCDate(1);
    for (let i = 0; i < 4; i++) {
      const mStart = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + i, 1));
      const off = daysBetween(fromDate, iso(mStart));
      if (off >= 0 && off <= totalDays) {
        marks.push({
          label: mStart.toLocaleDateString(ar ? 'ar' : 'en', { month: 'short', year: '2-digit' }),
          leftPct: (off / totalDays) * 100,
        });
      }
    }
    return marks;
  }, [fromDate, totalDays, ar]);

  if (!on) return null;

  const rows = q.data ?? [];

  return (
    <div style={{ marginTop: 24, background: 'hsl(var(--card))', border: '0.5px solid hsl(var(--border))', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <CalendarRange size={18} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>{ar ? 'إجازات الفريق — 3 أشهر قادمة' : 'Team leave — next 3 months'}</div>
      </div>
      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>
        {scope === 'all' ? (ar ? 'جميع الأقسام' : 'all departments') : (ar ? 'فريقك' : 'your team')}
      </div>

      {q.isLoading ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{ar ? 'لا توجد إجازات معتمدة في هذه الفترة.' : 'No approved leave in this period.'}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 640 }}>
            {/* month header */}
            <div style={{ position: 'relative', height: 20, marginBottom: 8, marginInlineStart: 150 }}>
              {monthMarkers.map((m, i) => (
                <div key={i} style={{ position: 'absolute', insetInlineStart: `${m.leftPct}%`, fontSize: 11, color: 'hsl(var(--muted-foreground))', borderInlineStart: '0.5px solid hsl(var(--border))', paddingInlineStart: 4, height: 20 }}>
                  {m.label}
                </div>
              ))}
            </div>

            {/* rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r) => {
                const startOff = Math.max(0, daysBetween(fromDate, r.startDate));
                const endOff = Math.min(totalDays, daysBetween(fromDate, r.endDate));
                const leftPct = (startOff / totalDays) * 100;
                const widthPct = Math.max(1.5, ((endOff - startOff + 1) / totalDays) * 100);
                const color = LEAVE_COLORS[r.leaveType] ?? '#199e70';
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <div style={{ width: 150, flexShrink: 0, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingInlineEnd: 8 }}>
                      {ar ? r.nameAr || r.name : r.name}
                    </div>
                    <div style={{ position: 'relative', flex: 1, height: 24, background: 'hsl(var(--muted))', borderRadius: 4 }}>
                      <div title={`${leaveTypeLabel(r.leaveType as never, ar, r.leaveTypeOther)} · ${r.startDate} → ${r.endDate}`}
                        style={{ position: 'absolute', insetInlineStart: `${leftPct}%`, width: `${widthPct}%`, top: 3, height: 18, background: color, borderRadius: 4, display: 'flex', alignItems: 'center', paddingInline: 6, overflow: 'hidden' }}>
                        <span style={{ fontSize: 10, color: '#fff', whiteSpace: 'nowrap' }}>{leaveTypeLabel(r.leaveType as never, ar, r.leaveTypeOther)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
