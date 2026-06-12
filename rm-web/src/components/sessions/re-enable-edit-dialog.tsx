'use client';

// ReEnableEditDialog — re-enables editing on a locked session.
// Per Q2 (c): creator OR admin OR super_admin can re-enable.
// Required: a reason (EN + AR) explaining why. Logged to session_edit_history.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Unlock, Loader2, X, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { reEnableEditing } from '@/lib/sessions/queries';
import type { Session } from '@/types/session';

type Props = {
  session: Session;
  onClose: () => void;
  onReEnabled: (s: Session) => void;
};

export function ReEnableEditDialog({ session, onClose, onReEnabled }: Props) {
  const { language, isRTL } = useLanguage();
  const [reason, setReason] = useState('');
  const [reasonAr, setReasonAr] = useState('');

  const mut = useMutation({
    mutationFn: () => reEnableEditing(session.id, reason, reasonAr),
    onSuccess: (s) => onReEnabled(s),
  });

  const canSubmit = reason.trim().length > 0 && reasonAr.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Unlock className="h-4 w-4 text-slate-700" />
            <h3 className="text-base font-semibold">
              {language === 'ar' ? 'إعادة تفعيل التعديل' : 'Re-enable editing'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mut.isPending}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              {language === 'ar'
                ? 'هذا الإجراء سيكون مرئيًا في سجل التعديلات بشكل دائم. يجب أن يكون السبب واضحًا للمراجعين.'
                : 'This action will be permanently visible in the edit history. Make the reason clear for future reviewers.'}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-700">
              {language === 'ar' ? 'السبب (EN)' : 'Reason (EN)'} <span className="text-red-500">*</span>
            </label>
            <textarea
              dir="ltr"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              disabled={mut.isPending}
              placeholder="e.g. Correcting attribution error noticed after lock"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-700">
              {language === 'ar' ? 'السبب (AR)' : 'Reason (AR)'} <span className="text-red-500">*</span>
            </label>
            <textarea
              dir="rtl"
              value={reasonAr}
              onChange={(e) => setReasonAr(e.target.value)}
              rows={2}
              disabled={mut.isPending}
              placeholder="مثال: تصحيح خطأ في النسب بعد القفل"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
            />
          </div>

          {mut.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {(mut.error as Error)?.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}>
            {mut.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {language === 'ar' ? 'تفعيل التعديل' : 'Enable editing'}
          </Button>
        </div>
      </div>
    </div>
  );
}
