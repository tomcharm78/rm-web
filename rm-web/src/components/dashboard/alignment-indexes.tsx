'use client';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import { createClient } from '@/lib/supabase/client';
import { getMyDepartmentId } from '@/lib/dashboard/dept-queries';
import {
  getOverallAlignment, getPerDepartmentAlignment, getDeputyshipGoalIndex,
  getSingleDepartmentAlignment, getEmployeeAlignment,
  alignmentBand, BAND_COLOR,
} from '@/lib/kpi/dashboard-alignment-queries';

const GR = '#e1e0d9';
const TM = '#898781';
const YEAR = new Date().getFullYear();

function bandLabel(pct: number, ar: boolean): string {
  const b = alignmentBand(pct);
  if (ar) return b === 'high' ? 'ممتاز' : b === 'good' ? 'جيد' : b === 'mid' ? 'منخفض' : 'ضعيف';
  return b === 'high' ? 'Strong' : b === 'good' ? 'Good' : b === 'mid' ? 'Low' : 'Weak';
}

function AlignBar({ label, sub, pct }: { label: string; sub?: string; pct: number }) {
  const color = BAND_COLOR[alignmentBand(pct)];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--foreground))' }}>
          {label}
          {sub ? <span style={{ color: TM, fontWeight: 400, marginInlineStart: 6, fontSize: 11 }}>{sub}</span> : null}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{pct}%</div>
      </div>
      <div style={{ position: 'relative', height: 8, borderRadius: 6, background: GR, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: pct + '%', background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ ar }: { ar: boolean }) {
  return <div style={{ fontSize: 12, color: TM }}>{ar ? 'لا توجد بيانات محاذاة بعد لهذا الربع.' : 'No alignment data for this quarter yet.'}</div>;
}

export function AlignmentIndexes({ role, userId }: { role: string; userId: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const kpisOn = useQuery({
    queryKey: ['module-kpis-enabled'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.from('org_module_settings').select('enabled').eq('module_key', 'kpis').maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any)?.enabled ?? false;
    },
  });

  const isSuper = role === 'super_admin';
  const enabled = kpisOn.data === true;

  const overallQ = useQuery({ queryKey: ['align-overall', YEAR], queryFn: () => getOverallAlignment(YEAR), enabled: enabled && isSuper });
  const perDeptQ = useQuery({ queryKey: ['align-per-dept', YEAR], queryFn: () => getPerDepartmentAlignment(YEAR), enabled: enabled && isSuper });
  const depGoalQ = useQuery({ queryKey: ['align-dep-goals', YEAR], queryFn: () => getDeputyshipGoalIndex(YEAR), enabled: enabled && isSuper });

  const myDeptQ = useQuery({ queryKey: ['my-dept-id', userId], queryFn: getMyDepartmentId, enabled: enabled && !isSuper });
  const myDeptId = myDeptQ.data ?? null;
  const deptAlignQ = useQuery({ queryKey: ['align-my-dept', YEAR, myDeptId], queryFn: () => getSingleDepartmentAlignment(YEAR, myDeptId!), enabled: enabled && !isSuper && !!myDeptId });
  const empAlignQ = useQuery({ queryKey: ['align-employees', YEAR, myDeptId], queryFn: () => getEmployeeAlignment(YEAR, myDeptId!), enabled: enabled && !isSuper && !!myDeptId });

  if (!enabled) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: 4 }}>
        {ar ? 'محاذاة المؤشرات الاستراتيجية' : 'Strategic Alignment'}
      </div>
      <div style={{ fontSize: 12, color: TM, marginBottom: 16 }}>
        {ar ? 'نسبة العمل المنجز المرتبط بالأهداف — للربع الحالي' : 'Share of completed work linked to goals — current quarter'}
      </div>

      {isSuper ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title={ar ? 'محاذاة جميع الإدارات لأهداف الوكالة' : 'All-Departments Alignment'}>
            {overallQ.isError ? <Empty ar={ar} /> : overallQ.data && overallQ.data.totalCompleted > 0 ? (
              <AlignBar
                label={ar ? 'الإجمالي' : 'Overall'}
                sub={overallQ.data.alignedCompleted + '/' + overallQ.data.totalCompleted + ' · ' + bandLabel(overallQ.data.alignmentPct, ar)}
                pct={overallQ.data.alignmentPct}
              />
            ) : <Empty ar={ar} />}
          </Card>

          <Card title={ar ? 'المحاذاة حسب الإدارة' : 'Per-Department Alignment'}>
            {perDeptQ.isError ? <Empty ar={ar} /> : (perDeptQ.data ?? []).length ? (
              (perDeptQ.data ?? []).map((d) => (
                <AlignBar
                  key={d.departmentId}
                  label={(ar ? d.departmentNameAr || d.departmentName : d.departmentName) || '—'}
                  sub={d.alignedCompleted + '/' + d.totalCompleted}
                  pct={d.alignmentPct}
                />
              ))
            ) : <Empty ar={ar} />}
          </Card>

          <Card title={ar ? 'مؤشر أهداف الوكالة' : 'Deputyship Goal Index'}>
            {depGoalQ.isError ? <Empty ar={ar} /> : (depGoalQ.data ?? []).length ? (
              (depGoalQ.data ?? []).map((g) => (
                <AlignBar
                  key={g.deputyshipGoalId}
                  label={(ar ? g.titleAr || g.title : g.title) || '—'}
                  sub={ar ? (g.childCount + ' أهداف تنفيذية') : (g.childCount + ' exec goals')}
                  pct={g.indexPct}
                />
              ))
            ) : <Empty ar={ar} />}
          </Card>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <Card title={ar ? 'محاذاة الإدارة' : 'Department Alignment'}>
            {deptAlignQ.isError ? <Empty ar={ar} /> : deptAlignQ.data && deptAlignQ.data.totalCompleted > 0 ? (
              <AlignBar
                label={ar ? 'إدارتي' : 'My department'}
                sub={deptAlignQ.data.alignedCompleted + '/' + deptAlignQ.data.totalCompleted + ' · ' + bandLabel(deptAlignQ.data.alignmentPct, ar)}
                pct={deptAlignQ.data.alignmentPct}
              />
            ) : <Empty ar={ar} />}
          </Card>

          <Card title={ar ? 'المحاذاة حسب الموظف' : 'Per-Employee Alignment'}>
            {empAlignQ.isError ? <Empty ar={ar} /> : (empAlignQ.data ?? []).length ? (
              (empAlignQ.data ?? []).map((e) => (
                <AlignBar
                  key={e.userId}
                  label={e.name}
                  sub={e.alignedCompleted + '/' + e.totalCompleted}
                  pct={e.alignmentPct}
                />
              ))
            ) : <Empty ar={ar} />}
          </Card>
        </div>
      )}
    </div>
  );
}
