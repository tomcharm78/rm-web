'use client';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import {
  createStrategicGoal, updateStrategicGoal,
  createDepartmentGoal, updateDepartmentGoal,
  listStrategicGoals, listGoalParents, setGoalParents,
} from '@/lib/kpi/queries';
import type { GoalTier, StrategicGoal, DepartmentGoal, TargetType } from '@/types/kpi';
import { targetTypeLabel } from '@/types/kpi';

// tier accent colors (shared with the page)
export const TIER_COLOR = {
  organization: '#7c3aed', // purple — vision
  deputyship: '#2a78d6',   // blue — strategy
  executive: '#199e70',    // green — execution
} as const;

type Mode =
  | { kind: 'strategic'; tier: GoalTier; editing?: StrategicGoal }
  | { kind: 'department'; departmentId: string; deputyshipGoals: { id: string; label: string }[]; editing?: DepartmentGoal };

const YEARS = (() => {
  const y = new Date().getUTCFullYear();
  return [y - 1, y, y + 1, y + 2];
})();

export function GoalEditorModal({ mode, year, onClose }: { mode: Mode; year: number; onClose: () => void }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const ed = mode.editing;

  const [title, setTitle] = useState(ed?.title ?? '');
  const [titleAr, setTitleAr] = useState(ed?.titleAr ?? '');
  const [description, setDescription] = useState(ed?.description ?? '');
  const [descriptionAr, setDescriptionAr] = useState(ed?.descriptionAr ?? '');
  const [goalYear, setGoalYear] = useState<number>(ed?.year ?? year);
  const [q1, setQ1] = useState<string>(ed?.q1Target != null ? String(ed.q1Target) : '');
  const [q2, setQ2] = useState<string>(ed?.q2Target != null ? String(ed.q2Target) : '');
  const [q3, setQ3] = useState<string>(ed?.q3Target != null ? String(ed.q3Target) : '');
  const [q4, setQ4] = useState<string>(ed?.q4Target != null ? String(ed.q4Target) : '');
  const [targetType, setTargetType] = useState<TargetType>((ed as DepartmentGoal)?.targetType ?? 'count');
  const [unitLabel, setUnitLabel] = useState<string>((ed as DepartmentGoal)?.unitLabel ?? '');
  // معادلة القياس — shown on the KPI scorecard. Single field (notation, not prose).
  const [formula, setFormula] = useState<string>((ed as DepartmentGoal)?.formula ?? '');
  const [currentValue, setCurrentValue] = useState<string>(
    (ed as DepartmentGoal)?.currentValue != null ? String((ed as DepartmentGoal).currentValue) : ''
  );

  // ONLY department (executive) goals carry quarterly targets
  const showTargets = mode.kind === 'department';
  // deputyship goals link UP to one or more org goals
  const isDeputyship = mode.kind === 'strategic' && mode.tier === 'deputyship';

  const [deputyshipGoalId, setDeputyshipGoalId] = useState<string>(
    mode.kind === 'department' ? (ed?.deputyshipGoalId ?? mode.deputyshipGoals[0]?.id ?? '') : ''
  );

  const orgGoalsQ = useQuery({
    queryKey: ['strategic-goals', 'organization', goalYear],
    queryFn: () => listStrategicGoals('organization'),
    enabled: isDeputyship,
  });
  const [selectedOrgGoals, setSelectedOrgGoals] = useState<string[]>([]);

  const existingParentsQ = useQuery({
    queryKey: ['goal-parents', ed?.id],
    queryFn: () => listGoalParents(ed!.id),
    enabled: isDeputyship && !!ed?.id,
  });
  useEffect(() => {
    if (existingParentsQ.data) setSelectedOrgGoals(existingParentsQ.data);
  }, [existingParentsQ.data]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, parseInt(s, 10) || 0));

  function toggleOrgGoal(id: string) {
    setSelectedOrgGoals((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setErr(null);
    if (!title.trim()) { setErr(ar ? 'العنوان مطلوب' : 'Title is required'); return; }
    if (mode.kind === 'department' && !deputyshipGoalId) {
      setErr(ar ? 'يجب الربط بهدف استراتيجي للوكالة' : 'Must link to a deputyship strategic goal');
      return;
    }
    setSaving(true);
    try {
      if (mode.kind === 'strategic') {
        const payload = {
          tier: mode.tier, title, titleAr, description, descriptionAr, year: goalYear,
          // strategic goals (org + deputyship) are BOTH qualitative — no targets
          q1Target: null, q2Target: null, q3Target: null, q4Target: null,
        };
        let goalId = ed?.id;
        if (ed) {
          await updateStrategicGoal(ed.id, payload);
        } else {
          await createStrategicGoal(payload);
          const list = await listStrategicGoals(mode.tier, goalYear);
          goalId = list.find((g) => g.title === title.trim())?.id;
        }
        if (isDeputyship && goalId) await setGoalParents(goalId, selectedOrgGoals);
        qc.invalidateQueries({ queryKey: ['strategic-goals'] });
        qc.invalidateQueries({ queryKey: ['goal-parents'] });
      } else {
        const payload = {
          departmentId: mode.departmentId, deputyshipGoalId, title, titleAr, description, descriptionAr,
          year: goalYear,
          q1Target: num(q1) ?? 0, q2Target: num(q2) ?? 0, q3Target: num(q3) ?? 0, q4Target: num(q4) ?? 0,
          targetType, unitLabel: unitLabel.trim(), currentValue: num(currentValue) ?? 0,
          formula: formula.trim(),
        };
        if (ed) await updateDepartmentGoal(ed.id, payload);
        else await createDepartmentGoal(payload);
        qc.invalidateQueries({ queryKey: ['department-goals'] });
      }
      onClose();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  const yearlyTotal = showTargets ? (num(q1) ?? 0) + (num(q2) ?? 0) + (num(q3) ?? 0) + (num(q4) ?? 0) : 0;

  const accent =
    mode.kind === 'department' ? TIER_COLOR.executive
    : mode.tier === 'organization' ? TIER_COLOR.organization
    : TIER_COLOR.deputyship;

  const heading = mode.kind === 'strategic'
    ? (mode.tier === 'organization'
        ? (ar ? 'هدف استراتيجي للمنظمة' : 'Organization strategic goal')
        : (ar ? 'هدف استراتيجي للوكالة' : 'Deputyship strategic goal'))
    : (ar ? 'هدف تنفيذي للقسم' : 'Department executive goal');

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'hsl(var(--card))', borderRadius: 12, borderTop: `3px solid ${accent}`, padding: '1.5rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4, color: accent }}>
          {ed ? (ar ? 'تعديل' : 'Edit') : (ar ? 'إضافة' : 'Add')} — {heading}
        </div>

        {/* year */}
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>{ar ? 'السنة' : 'Year'}</label>
          <select value={goalYear} onChange={(e) => setGoalYear(parseInt(e.target.value, 10))} style={inp}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* department: required deputyship link */}
        {mode.kind === 'department' && (
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>{ar ? 'مرتبط بهدف استراتيجي للوكالة *' : 'Linked deputyship strategic goal *'}</label>
            <select value={deputyshipGoalId} onChange={(e) => setDeputyshipGoalId(e.target.value)} style={inp}>
              <option value="">{ar ? '— اختر —' : '— select —'}</option>
              {mode.deputyshipGoals.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            {mode.deputyshipGoals.length === 0 && (
              <div style={{ fontSize: 11, color: '#e34948', marginTop: 4 }}>
                {ar ? 'لا توجد أهداف وكالة بعد — يجب أن ينشئها المدير العام أولاً.' : 'No deputyship goals yet — super admin must create one first.'}
              </div>
            )}
          </div>
        )}

        {/* title */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={lbl}>{ar ? 'العنوان (إنجليزي) *' : 'Title (EN) *'}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>{ar ? 'العنوان (عربي)' : 'Title (AR)'}</label>
            <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" style={inp} />
          </div>
        </div>

        {/* description */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={lbl}>{ar ? 'الوصف (إنجليزي)' : 'Description (EN)'}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div>
            <label style={lbl}>{ar ? 'الوصف (عربي)' : 'Description (AR)'}</label>
            <textarea value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} rows={2} dir="rtl" style={{ ...inp, resize: 'vertical' }} />
          </div>
        </div>

        {/* deputyship: link to one or more org goals */}
        {isDeputyship && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...lbl, marginBottom: 6 }}>
              {ar ? 'مرتبط بأهداف المنظمة (واحد أو أكثر)' : 'Linked organization goals (one or more)'}
            </label>
            {(orgGoalsQ.data ?? []).length === 0 && (
              <div style={{ fontSize: 11, color: '#c98500' }}>
                {ar ? 'لا توجد أهداف للمنظمة بعد.' : 'No organization goals yet.'}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(orgGoalsQ.data ?? []).map((g) => (
                <label
                  key={g.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
                    padding: '6px 8px', borderRadius: 6,
                    border: `0.5px solid ${selectedOrgGoals.includes(g.id) ? TIER_COLOR.organization : 'hsl(var(--border))'}`,
                    background: selectedOrgGoals.includes(g.id) ? TIER_COLOR.organization + '11' : 'transparent',
                  }}
                >
                  <input type="checkbox" checked={selectedOrgGoals.includes(g.id)} onChange={() => toggleOrgGoal(g.id)} />
                  {ar ? g.titleAr || g.title : g.title}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* executive goals only: target type, unit, current value, FORMULA, quarterly targets */}
        {showTargets ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={lbl}>{ar ? 'نوع الهدف' : 'Target type'}</label>
                <select value={targetType} onChange={(e) => setTargetType(e.target.value as TargetType)} style={inp}>
                  <option value="count">{targetTypeLabel('count', ar)}</option>
                  <option value="percentage">{targetTypeLabel('percentage', ar)}</option>
                  <option value="sar">{targetTypeLabel('sar', ar)}</option>
                </select>
              </div>
              <div>
                <label style={lbl}>{ar ? 'وحدة القياس (اختياري)' : 'Unit label (optional)'}</label>
                <input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder={ar ? 'مثال: مستثمر' : 'e.g. investors'} style={inp} />
              </div>
            </div>

            {(targetType === 'percentage' || targetType === 'sar') && (
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>
                  {ar ? 'القيمة الحالية المحققة (يُحدّثها المدير)' : 'Current achieved value (admin-reported)'}
                </label>
                <input type="number" min={0} value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} style={inp} />
                <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
                  {ar
                    ? 'للأهداف بالنسبة أو المبلغ، أدخل التقدّم الحالي يدويًا (لا يُحسب من المهام).'
                    : 'For percentage/SAR goals, enter current progress manually (not auto-counted from tasks).'}
                </div>
              </div>
            )}

            {/* معادلة القياس — appears for EVERY executive goal, whatever the target type.
                Shown on the KPI scorecard. */}
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>{ar ? 'معادلة القياس (اختياري)' : 'Measurement formula (optional)'}</label>
              <input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder={ar ? 'مثال: المشاريع المعتمدة ÷ إجمالي المشاريع × ١٠٠' : 'e.g. approved projects ÷ total projects × 100'}
                style={inp}
              />
              <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 3 }}>
                {ar ? 'تظهر في بطاقة المؤشر.' : 'Appears on the KPI scorecard.'}
              </div>
            </div>

            <label style={{ ...lbl, marginBottom: 6 }}>
              {ar ? 'الأهداف الربعية (يمكن أن تكون غير متساوية)' : 'Quarterly targets (may be uneven)'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {([['Q1', q1, setQ1], ['Q2', q2, setQ2], ['Q3', q3, setQ3], ['Q4', q4, setQ4]] as [string, string, (s: string) => void][]).map(
                ([label, val, setter]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 2, textAlign: 'center' }}>{label}</div>
                    <input
                      type="number" min={0} value={val}
                      onChange={(e) => setter(e.target.value)}
                      style={{ ...inp, textAlign: 'center' }}
                    />
                  </div>
                )
              )}
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--foreground))', marginTop: 8, textAlign: 'end' }}>
              {ar ? 'الإجمالي السنوي:' : 'Yearly total:'} <strong>{yearlyTotal}</strong>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 14, background: 'hsl(var(--muted))', borderRadius: 8, padding: '8px 10px' }}>
            {ar
              ? 'الأهداف الاستراتيجية نوعية (بدون أرقام) — الأرقام الربعية تُوضع على مستوى الأهداف التنفيذية للأقسام.'
              : 'Strategic goals are qualitative (no numbers) — quarterly targets live at the department executive-goal level.'}
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#e34948', marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnGhost}>{ar ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary, background: accent }}>
            {saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', borderRadius: 8, border: '0.5px solid hsl(var(--border))', padding: '7px 10px', fontSize: 13, background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' };
const btnGhost: React.CSSProperties = { fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '0.5px solid hsl(var(--border))', background: 'hsl(var(--muted))', cursor: 'pointer', color: 'hsl(var(--foreground))' };
const btnPrimary: React.CSSProperties = { fontSize: 13, padding: '7px 16px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer' };
