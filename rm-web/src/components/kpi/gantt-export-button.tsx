'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { buildGanttTree, exportGanttExcel } from '@/lib/kpi/gantt-export';

export function GanttExportButton({ isSuper, deptId, deptName, ar }: {
  isSuper: boolean;
  deptId: string | null;
  deptName: string | null;
  ar: boolean;
}) {
  const thisYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [quarters, setQuarters] = useState<number[]>([1, 2, 3, 4]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // gate: exports module must be ON
  const exportsOn = useQuery({
    queryKey: ['module-exports-enabled'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.from('org_module_settings').select('enabled').eq('module_key', 'exports').maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any)?.enabled ?? false;
    },
  });
  if (exportsOn.data !== true) return null;

  function toggleQuarter(q: number) {
    setQuarters((prev) => prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q].sort((a, b) => a - b));
  }

  async function run() {
    if (quarters.length === 0) { setErr(ar ? 'اختر ربعًا واحدًا على الأقل' : 'Pick at least one quarter'); return; }
    setBusy(true); setErr(null);
    try {
      const scopeLabel = isSuper
        ? (ar ? 'كل الإدارات' : 'All departments')
        : (deptName ?? (ar ? 'إدارتي' : 'My department'));
      const tree = await buildGanttTree(year, quarters, isSuper ? null : deptId, scopeLabel);
      if (tree.nodes.length === 0) { setErr(ar ? 'لا توجد بيانات للتصدير في هذا النطاق' : 'No data to export for this selection'); setBusy(false); return; }
      await exportGanttExcel(tree, ar);
    } catch (e) {
      setErr((e as Error)?.message ?? 'export_failed');
    }
    setBusy(false);
  }

  const years = [thisYear - 1, thisYear, thisYear + 1];

  return (
    <div style={{ marginTop: 28, border: '0.5px solid hsl(var(--border))', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{ar ? 'تصدير مخطط جانت (Excel)' : 'Gantt export (Excel)'}</div>
      <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 14 }}>
        {ar ? 'خريطة الحالة: الأهداف والمهام والمراحل ملوّنة حسب التقدم' : 'Status map: goals, tasks & milestones colored by progress'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{ar ? 'السنة' : 'Year'}</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 7, border: '0.5px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))' }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginInlineEnd: 4 }}>{ar ? 'الأرباع' : 'Quarters'}</span>
          {[1, 2, 3, 4].map((q) => {
            const on = quarters.includes(q);
            return (
              <button key={q} type="button" onClick={() => toggleQuarter(q)}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
                  border: '0.5px solid hsl(var(--border))',
                  background: on ? 'hsl(var(--foreground))' : 'transparent',
                  color: on ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
                }}>
                {'Q' + q}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={run} disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
            padding: '7px 14px', borderRadius: 7, cursor: busy ? 'default' : 'pointer',
            border: 'none', background: '#199e70', color: '#fff', opacity: busy ? 0.7 : 1,
            marginInlineStart: 'auto',
          }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {ar ? 'تصدير' : 'Export'}
        </button>
      </div>

      {err && <div style={{ fontSize: 11, color: '#e34948', marginTop: 8 }}>{err}</div>}
    </div>
  );
}
