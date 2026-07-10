'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { getMyModulesControl } from '@/lib/modules/queries';
import {
  listMyDepartmentExecutiveGoals,
  listTaskGoals, setTaskGoals,
  listChallengeGoals, setChallengeGoals,
} from '@/lib/kpi/queries';

// green accent = executive tier (matches KPI page)
const EXEC = '#199e70';

export function GoalLinkPanel({
  entityType, entityId, locked,
}: {
  entityType: 'task' | 'challenge';
  entityId: string;
  locked?: boolean; // task done/cancelled or challenge closed → read-only
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isGov = user?.role === 'pmo' || user?.role === 'pm';
  const canLink = isAdmin || isGov;

  // module gate
  const modulesCtl = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const kpisOn = (modulesCtl.data?.settings ?? {})['kpis'] === true;

  // available executive goals (admin's own department)
  const goalsQ = useQuery({
    queryKey: ['my-exec-goals'],
    queryFn: listMyDepartmentExecutiveGoals,
    enabled: canLink && kpisOn,
  });

  // currently linked goal ids
  const linkedQ = useQuery({
    queryKey: ['entity-goals', entityType, entityId],
    queryFn: () => entityType === 'task' ? listTaskGoals(entityId) : listChallengeGoals(entityId),
    enabled: canLink && kpisOn,
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (linkedQ.data) { setSelected(linkedQ.data); setDirty(false); }
  }, [linkedQ.data]);

  if (!canLink || !kpisOn) return null;

  const goals = goalsQ.data ?? [];

  function toggle(id: string) {
    if (locked) return;
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (entityType === 'task') await setTaskGoals(entityId, selected);
      else await setChallengeGoals(entityId, selected);
      qc.invalidateQueries({ queryKey: ['entity-goals', entityType, entityId] });
      // Governance "Linked by PM" writes a status-history row — refresh the timeline.
      qc.invalidateQueries({ queryKey: [entityType === 'task' ? 'task-history' : 'challenge-history', entityId] });
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5" style={{ borderInlineStart: `3px solid ${EXEC}` }}>
      <div className="flex items-center gap-2 mb-1">
        <Target className="h-4 w-4" style={{ color: EXEC }} />
        <h2 className="text-sm font-semibold">{ar ? 'الأهداف التنفيذية المرتبطة' : 'Linked executive goals'}</h2>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        {ar ? 'اربط هذا العنصر بأهداف قسمك التي يخدمها (اختياري)' : 'Link this to the department goals it serves (optional)'}
      </p>

      {goalsQ.isLoading || linkedQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : goals.length === 0 ? (
        <p className="text-sm text-slate-400">{ar ? 'لا توجد أهداف تنفيذية في قسمك بعد.' : 'No executive goals in your department yet.'}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {goals.map((g) => {
              const on = selected.includes(g.id);
              return (
                <button key={g.id} onClick={() => toggle(g.id)} disabled={locked}
                  className="flex items-center gap-2 text-sm rounded-md px-3 py-2 border text-start transition-colors"
                  style={{
                    borderColor: on ? EXEC : 'hsl(var(--border))',
                    background: on ? EXEC + '11' : 'transparent',
                    cursor: locked ? 'default' : 'pointer',
                    opacity: locked && !on ? 0.5 : 1,
                  }}>
                  <span className="flex h-4 w-4 items-center justify-center rounded border flex-shrink-0"
                    style={{ borderColor: on ? EXEC : '#cbd5e1', background: on ? EXEC : 'transparent' }}>
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {ar ? g.titleAr || g.title : g.title}
                </button>
              );
            })}
          </div>

          {!locked && dirty && (
            <button onClick={save} disabled={saving}
              className="mt-3 text-sm rounded-md px-4 py-2 text-white"
              style={{ background: EXEC }}>
              {saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : isGov ? (ar ? 'ربط بواسطة مدير المشروع' : 'Link by PM') : (ar ? 'حفظ الروابط' : 'Save links')}
            </button>
          )}
          {savedFlash && <span className="ms-3 text-xs" style={{ color: EXEC }}>{ar ? 'تم الحفظ ✓' : 'Saved ✓'}</span>}
          {locked && <p className="mt-2 text-xs text-slate-400">{ar ? 'مغلق — لا يمكن تعديل الروابط.' : 'Closed — links can no longer be edited.'}</p>}
        </>
      )}
    </div>
  );
}
