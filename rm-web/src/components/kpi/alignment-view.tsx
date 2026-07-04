'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getGoalProgress, getDepartmentAlignment, type GoalProgress } from '@/lib/kpi/alignment-queries';
import { paceLabel, paceColor, currentQuarter } from '@/types/kpi';

export function AlignmentView({ scopeDeptId, deptNameById, ar: arProp }: {
  scopeDeptId: string | null;
  deptNameById?: Map<string, string>;
  ar?: boolean;
}) {
  const { language } = useLanguage();
  const ar = arProp ?? language === 'ar';
  const year = new Date().getUTCFullYear();
  const q = currentQuarter();

  const progressQ = useQuery({ queryKey: ['goal-progress', year, scopeDeptId], queryFn: () => getGoalProgress(year, scopeDeptId) });
  const alignQ = useQuery({ queryKey: ['dept-alignment', year, scopeDeptId], queryFn: () => getDepartmentAlignment(year, scopeDeptId) });

  const goals = progressQ.data ?? [];
  const align = alignQ.data ?? [];

  // attention distribution: sort by linkedTotal desc
  const byAttention = [...goals].sort((a, b) => b.linkedTotal - a.linkedTotal);
  const maxLinked = Math.max(1, ...byAttention.map((g) => g.linkedTotal));

  // deviation flags: goals behind/deviated
  const flagged = goals.filter((g) => g.pace !== 'on_track' && g.target > 0);

  return (
    <div style={{ marginTop: 28, borderLeft: '3px solid #199e70', paddingLeft: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TrendingUp size={18} style={{ color: '#199e70' }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>{ar ? 'مواءمة الأداء مع الأهداف' : 'Strategic alignment'}</div>
      </div>
      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>
        {ar ? `التقدّم مقابل الأهداف الربعية · الربع ${q} · ${year}` : `progress vs quarterly targets · Q${q} · ${year}`}
      </div>

      {progressQ.isLoading ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : goals.length === 0 ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{ar ? 'لا توجد أهداف تنفيذية لهذه السنة.' : 'No executive goals for this year.'}</p>
      ) : (
        <>
          {/* deviation flags */}
          {flagged.length > 0 && (
            <div style={{ background: '#e3494811', border: '0.5px solid #e3494844', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <AlertTriangle size={14} style={{ color: '#e34948' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#e34948' }}>{ar ? 'أهداف بحاجة إلى انتباه' : 'Goals needing attention'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {flagged.map((g) => (
                  <div key={g.goalId} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{ar ? g.titleAr || g.title : g.title}{!scopeDeptId && deptNameById?.get(g.departmentId) ? ` · ${deptNameById.get(g.departmentId)}` : ''}</span>
                    <span style={{ color: paceColor(g.pace), fontWeight: 500, flexShrink: 0 }}>{g.achieved}/{g.target} · {paceLabel(g.pace, ar)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* per-goal progress vs target */}
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{ar ? 'التقدّم لكل هدف' : 'Progress per goal'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {goals.map((g) => <ProgressBar key={g.goalId} g={g} ar={ar} deptName={!scopeDeptId ? deptNameById?.get(g.departmentId) : undefined} />)}
          </div>

          {/* attention distribution */}
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{ar ? 'توزيع الاهتمام (عدد العناصر المرتبطة)' : 'Attention distribution (linked items)'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {byAttention.map((g) => (
              <div key={g.goalId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 12, width: 160, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ar ? g.titleAr || g.title : g.title}</div>
                <div style={{ flex: 1, height: 18, background: 'hsl(var(--muted))', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${(g.linkedTotal / maxLinked) * 100}%`, height: '100%', background: g.linkedTotal === 0 ? '#e34948' : '#2a78d6', borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 12, width: 30, textAlign: 'end', flexShrink: 0, color: g.linkedTotal === 0 ? '#e34948' : 'hsl(var(--foreground))' }}>{g.linkedTotal}</div>
              </div>
            ))}
          </div>

          {/* per-department alignment */}
          {align.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{ar ? 'مواءمة الأقسام (العمل المنجز الذي خدم الأهداف)' : 'Department alignment (completed work that served goals)'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {align.map((d) => (
                  <div key={d.departmentId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 12, width: 160, flexShrink: 0 }}>{deptNameById?.get(d.departmentId) ?? '—'}</div>
                    <div style={{ flex: 1, height: 18, background: 'hsl(var(--muted))', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${d.alignmentPct}%`, height: '100%', background: d.alignmentPct >= 60 ? '#199e70' : d.alignmentPct >= 30 ? '#eda100' : '#e34948', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 12, width: 74, textAlign: 'end', flexShrink: 0 }}>{d.alignmentPct}% <span style={{ color: 'hsl(var(--muted-foreground))' }}>({d.alignedCompleted}/{d.totalCompleted})</span></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ProgressBar({ g, ar, deptName }: { g: GoalProgress; ar: boolean; deptName?: string }) {
  const pct = g.target > 0 ? Math.min(100, Math.round((g.achieved / g.target) * 100)) : 0;
  const color = paceColor(g.pace);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 500 }}>{ar ? g.titleAr || g.title : g.title}{deptName ? <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}> · {deptName}</span> : null}</span>
        <span style={{ color, fontWeight: 500 }}>{g.achieved}/{g.target} · {paceLabel(g.pace, ar)}</span>
      </div>
      <div style={{ height: 8, background: 'hsl(var(--muted))', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}
