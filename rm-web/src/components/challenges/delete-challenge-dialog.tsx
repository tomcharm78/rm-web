'use client';
// Delete confirmation for a challenge — super-admin only.
//
// The dialog names REAL counts rather than saying "this will also delete related
// tasks". A generic warning gets clicked through; "4 open tasks, 2 of them
// assigned to other people" is something you actually stop and read.
//
// Closed tasks are listed too, as KEPT — so it is clear the delete is not
// erasing work colleagues already completed.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { previewChallengeDeletion, softDeleteChallenge } from '@/lib/challenges/queries';

export function DeleteChallengeDialog({
  challengeId,
  challengeTitle,
  onClose,
  onDeleted,
}: {
  challengeId: string;
  challengeTitle: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['challenge-delete-preview', challengeId],
    queryFn: () => previewChallengeDeletion(challengeId),
  });

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await softDeleteChallenge(challengeId);
      onDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'delete_failed';
      setError(
        msg.includes('not_authorised')
          ? (ar ? 'الحذف متاح لمدير النظام فقط.' : 'Only a super administrator can delete.')
          : msg
      );
    } finally {
      setBusy(false);
    }
  }

  const p = preview.data;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <span className="font-semibold text-slate-900">
            {ar ? 'حذف التحدي' : 'Delete challenge'}
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label={ar ? 'إغلاق' : 'Close'}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              {ar
                ? 'حذف التحدي يحذف أيضًا المهام المفتوحة الناتجة عنه. الحذف متاح لمدير النظام فقط.'
                : 'Deleting this challenge also deletes the open tasks it generated. Only a super administrator can do this.'}
            </div>
          </div>

          <p className="text-sm text-slate-700">
            <span className="text-slate-500">{ar ? 'التحدي:' : 'Challenge:'} </span>
            {challengeTitle}
          </p>

          {preview.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {ar ? 'جارٍ حساب الأثر…' : 'Working out what this affects…'}
            </div>
          )}

          {p && (
            <div className="rounded-md border border-slate-200 divide-y divide-slate-100 text-sm">
              <Row
                label={ar ? 'مهام مفتوحة ستُحذف' : 'Open tasks to be deleted'}
                value={p.openTasks}
                tone={p.openTasks > 0 ? 'danger' : 'plain'}
              />
              {p.openTasksOnOthers > 0 && (
                <Row
                  label={ar ? 'منها مُسندة لأشخاص آخرين' : 'of those, assigned to other people'}
                  value={p.openTasksOnOthers}
                  tone="danger"
                />
              )}
              <Row
                label={ar ? 'مهام مُغلقة (ستبقى)' : 'Closed tasks (kept)'}
                value={p.closedTasks}
                tone="plain"
              />
            </div>
          )}

          {p && p.closedTasks > 0 && (
            <p className="text-xs text-slate-500">
              {ar
                ? 'تبقى المهام المُغلقة لأنها سجل لعمل أُنجز فعلًا، ويدخل في تقييم أداء من أنجزه.'
                : 'Closed tasks are kept — they record work already done and count toward the performance score of whoever did it.'}
            </p>
          )}

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {ar ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            onClick={confirm}
            disabled={busy || preview.isLoading}
            className="gap-2 bg-red-600 hover:bg-red-700 text-white"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {ar ? 'حذف' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'plain' }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-slate-600">{label}</span>
      <span className={tone === 'danger' ? 'text-red-700 font-medium' : 'text-slate-800'}>
        {value}
      </span>
    </div>
  );
}
