'use client';

// LockDialog — confirm lock with optional reason. After confirm, calls
// lockSession() and the parent refreshes. Locking flips status draft→locked
// and writes an audit entry.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Lock, Loader2, X, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { lockSession } from '@/lib/sessions/queries';
import type { Session } from '@/types/session';

type Props = {
  session: Session;
  onClose: () => void;
  onLocked: (s: Session) => void;
};

export function LockDialog({ session, onClose, onLocked }: Props) {
  const { language, isRTL } = useLanguage();
  const [reason, setReason] = useState('');

  const lockMutation = useMutation({
    mutationFn: () => lockSession(session.id, reason.trim() || undefined),
    onSuccess: (s) => onLocked(s),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-slate-700" />
            <h3 className="text-base font-semibold">
              {language === 'ar' ? 'قفل الجلسة' : 'Lock Session'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={lockMutation.isPending}
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
                ? 'بعد القفل، تصبح هذه الجلسة سجلاً رسمياً. أي تعديل لاحق يتطلب إعادة تفعيل خاصة وسيتم تسجيله في سجل التعديلات.'
                : 'Once locked, this session becomes an official record. Any later edit requires a special re-enable and will be visible in the edit history.'}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-700">
              {language === 'ar' ? 'سبب القفل (اختياري)' : 'Reason for locking (optional)'}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              disabled={lockMutation.isPending}
              placeholder={
                language === 'ar'
                  ? 'مثال: تمت موافقة اللجنة'
                  : 'e.g. Committee approved'
              }
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
            />
          </div>

          {lockMutation.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {(lockMutation.error as Error)?.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} disabled={lockMutation.isPending}>
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            onClick={() => lockMutation.mutate()}
            disabled={lockMutation.isPending}
            className="bg-slate-900 hover:bg-slate-800 text-white"
          >
            {lockMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {language === 'ar' ? 'قفل' : 'Lock'}
          </Button>
        </div>
      </div>
    </div>
  );
}
