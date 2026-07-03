'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/providers/language-provider';
import {
  createStrategicGoal, updateStrategicGoal,
  createDepartmentGoal, updateDepartmentGoal,
} from '@/lib/kpi/queries';
import type { GoalTier, StrategicGoal, DepartmentGoal } from '@/types/kpi';

type Mode =
  | { kind: 'strategic'; tier: GoalTier; editing?: StrategicGoal }
  | { kind: 'department'; departmentId: string; deputyshipGoals: { id: string; label: string }[]; editing?: DepartmentGoal };

export function GoalEditorModal({ mode, year, onClose }: { mode: Mode; year: number; onClose: () => void }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const ed = mode.editing;
  const [title, setTitle] = useState(ed?.title ?? '');
  const [titleAr, setTitleAr] = useState(ed?.titleAr ?? '');
  const [description, setDescription] = useState(ed?.description ?? '');
  const [descriptionAr, setDescriptionAr] = useState(ed?.descriptionAr ?? '');
  const [q1, setQ1] = useState<string>(ed?.q1Target != null ? String(ed.q1Target) : '');
  const [q2, setQ2] = useState<string>(ed?.q2Target != null ? String(ed.q2Target) : '');
  const [q3, setQ3] = useState<string>(ed?.q3Target != null ? String(ed.q3Target) : '');
  const [q4, setQ4] = useState<string>(ed?.q4Target != null ? String(ed.q4Target) : '');

  const isOrgGoal = mode.kind === 'strategic' && mode.tier === 'organization';
  // org goals are qualitative (no targets); deputyship + department carry numbers
  const showTargets = !isOrgGoal;

  const [deputyshipGoalId, setDeputyshipGoalId] = useState<string>(
    mode.kind === 'department' ? (ed?.deputyshipGoalId ?? mode.deputyshipGoals[0]?.id ?? '') : ''
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, parseInt(s, 10) || 0));

  async function save() {
    setErr(null);
    if (!title.trim()) { setErr(ar ? 'العنوان مطلوب' : 'Title is required'); return; }
    if (mode.kind === 'department' && !deputyshipGoalId) { setErr(ar ? 'يجب الربط بهدف الوكالة' : 'Must link to a deputyship goal'); return; }
    setSaving(true);
    try {
      if (mode.kind === 'strategic') {
        const payload = {
          tier: mode.tier, title, titleAr, description, descriptionAr, year,
          q1Target: showTargets ? num(q1) : null, q2Target: showTargets ? num(q2) : null,
          q3Target: showTargets ? num(q3) : null, q4Target: showTargets ? num(q4) : null,
        };
        if (ed) await updateStrategicGoal(ed.id, payload);
        else await createStrategicGoal(payload);
        qc.invalidateQueries({ queryKey: ['strategic-goals'] });
      } else {
        const payload = {
          departmentId: mode.departmentId, deputyshipGoalId, title, titleAr, description, descriptionAr, year,
          q1Target: num(q1) ?? 0, q2Target: num(q2) ?? 0, q3Target: num(q3) ?? 0, q4Target: num(q4) ?? 0,
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

  const heading = mode.kind === 'strategic'
    ? (mode.tier === 'organization' ? (ar ? 'هدف استراتيجي للمنظمة' : 'Organization strategic goal') : (ar ? 'هدف الوكالة' : 'Deputyship goal'))
    : (ar ? 'هدف القسم' : 'Department goal');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'hsl(var(--card))', borderRadius: 12, padding: '1.5rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{ed ? (ar ? 'تعديل' : 'Edit') : (ar ? 'إضافة' : 'Add')} — {heading}</div>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}>{ar ? 'السنة' : 'Year'} {year}</div>

        {/* department: required deputyship link */}
        {mode.kind === 'department' && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 }}>{ar ? 'مرتبط بهدف الوكالة *' : 'Linked deputyship goal *'}</label>
            <select value={deputyshipGoalId} onChange={(e) => setDeputyshipGoalId(e.target.value)} style={inp}>
              <option value="">{ar ? '— اختر —' : '— select —'}</option>
              {mode.deputyshipGoals.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            {mode.deputyshipGoals.length === 0 && (
              <div style={{ fontSize: 11, color: '#e34948', marginTop: 4 }}>{ar ? 'لا توجد أهداف وكالة بعد — يجب أن ينشئها المدير العام أولاً.' : 'No deputyship goals yet — super admin must create one first.'}</div>
            )}
          </div>
        )}

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

        {showTargets ? (
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...lbl, marginBottom: 6 }}>{ar ? 'الأهداف الربعية (يمكن أن تكون غير متساوية)' : 'Quarterly targets (may be uneven)'}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[['Q1', q1, setQ1], ['Q2', q2, setQ2], ['Q3', q3, setQ3], ['Q4', q4, setQ4]].map(([label, val, setter]) => (
                <div key={label as string}>
                  <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 2, textAlign: 'center' }}>{label as string}</div>
                  <input type="number" min={0} value={val as string} onChange={(e) => (setter as (s: string) => void)(e.target.value)} style={{ ...inp, textAlign: 'center' }} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 8, textAlign: 'end' }}>{ar ? 'الإجمالي السنوي:' : 'Yearly total:'} <strong>{yearlyTotal}</strong></div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginBottom: 14, background: 'hsl(var(--muted))', borderRadius: 8, padding: '8px 10px' }}>
            {ar ? 'الأهداف الاستراتيجية للمنظمة نوعية (بدون أرقام ربعية) — الأرقام تُوضع على مستوى أهداف الوكالة والأقسام.' : 'Organization strategic goals are qualitative (no quarterly numbers) — targets live at the deputyship and department levels.'}
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#e34948', marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnGhost}>{ar ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ' : 'Save')}</button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', borderRadius: 8, border: '0.5px solid hsl(var(--border))', padding: '7px 10px', fontSize: 13, background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', borderColor: 'hsl(var(--border))' };
const btnGhost: React.CSSProperties = { fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '0.5px solid hsl(var(--border))', background: 'hsl(var(--muted))', cursor: 'pointer', color: 'hsl(var(--foreground))' };
const btnPrimary: React.CSSProperties = { fontSize: 13, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2a78d6', cursor: 'pointer', color: '#fff' };
