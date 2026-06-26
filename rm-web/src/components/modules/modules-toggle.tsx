'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal, Loader2 } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getMyModulesControl, setModuleEnabled } from '@/lib/modules/queries';
import { PREMIUM_MODULES, type ModuleKey } from '@/lib/modules/registry';

export function ModulesToggle() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const ctlQ = useQuery({ queryKey: ['my-modules-control'], queryFn: getMyModulesControl });
  const ctl = ctlQ.data;

  const toggleMut = useMutation({
    mutationFn: ({ key, enabled }: { key: ModuleKey; enabled: boolean }) =>
      setModuleEnabled(ctl!.organizationId!, key, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-modules-control'] });
      // keep other gates fresh (attachments, future modules)
      qc.invalidateQueries({ queryKey: ['my-attachments-control'] });
    },
  });

  // only a capability holder (Sarah) sees this control at all
  if (ctlQ.isLoading || !ctl || !ctl.canManage || !ctl.organizationId) return null;

  const settings = ctl.settings;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
        <p className="text-sm font-medium text-slate-700">{ar ? 'الوحدات المتقدّمة' : 'Premium modules'}</p>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        {ar ? 'فعّل أو عطّل الوحدات المتقدّمة لهذه الجهة.' : 'Enable or disable premium modules for this organization.'}
      </p>

      <div className="divide-y divide-slate-100">
        {PREMIUM_MODULES.map((m) => {
          const enabled = settings[m.key] === true;
          const pending = toggleMut.isPending && toggleMut.variables?.key === m.key;
          return (
            <div key={m.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-slate-700">{ar ? m.labelAr : m.labelEn}</span>
              <button
                onClick={() => toggleMut.mutate({ key: m.key, enabled: !enabled })}
                disabled={pending}
                className={'relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0 ' + (enabled ? 'bg-indigo-600' : 'bg-slate-300')}
                title={enabled ? (ar ? 'إيقاف' : 'Turn off') : (ar ? 'تشغيل' : 'Turn on')}
              >
                {pending
                  ? <Loader2 className="h-3 w-3 animate-spin text-white mx-auto" />
                  : <span className={'inline-block h-4 w-4 transform rounded-full bg-white transition ' + (enabled ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1')} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
