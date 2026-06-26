'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Loader2 } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getMyAttachmentsControl, setAttachmentsEnabled } from '@/lib/attachments/queries';

export function AttachmentsToggle() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const ctlQ = useQuery({ queryKey: ['my-attachments-control'], queryFn: getMyAttachmentsControl });
  const ctl = ctlQ.data;

  const toggleMut = useMutation({
    mutationFn: (next: boolean) => setAttachmentsEnabled(ctl!.organizationId!, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-attachments-control'] });
      qc.invalidateQueries({ queryKey: ['attachments-enabled'] });
    },
  });

  // only a capability holder (Sarah) sees this control at all
  if (ctlQ.isLoading || !ctl || !ctl.canManage || !ctl.organizationId) return null;

  const enabled = ctl.enabled;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3">
      <div className="flex items-start gap-2">
        <Paperclip className="h-4 w-4 text-slate-500 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-slate-700">{ar ? 'المرفقات عبر المنصة' : 'Platform attachments'}</p>
          <p className="text-xs text-slate-500">
            {enabled
              ? (ar ? 'مُفعّلة — يمكن للموظفين رفع الملفات في السجلات.' : 'Enabled — staff can upload files to records.')
              : (ar ? 'مُعطّلة — لا تظهر أدوات الرفع لأحد.' : 'Disabled — upload tools are hidden for everyone.')}
          </p>
        </div>
      </div>
      <button
        onClick={() => toggleMut.mutate(!enabled)}
        disabled={toggleMut.isPending}
        className={'relative inline-flex h-6 w-11 items-center rounded-full transition ' + (enabled ? 'bg-indigo-600' : 'bg-slate-300')}
        title={enabled ? (ar ? 'إيقاف' : 'Turn off') : (ar ? 'تشغيل' : 'Turn on')}
      >
        {toggleMut.isPending
          ? <Loader2 className="h-3 w-3 animate-spin text-white mx-auto" />
          : <span className={'inline-block h-4 w-4 transform rounded-full bg-white transition ' + (enabled ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1')} />}
      </button>
    </div>
  );
}
