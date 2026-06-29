'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Pencil, Trash2, BarChart3, Send, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import { listSurveys, deleteSurvey } from '@/lib/surveys/queries';
import { statusLabel, statusColor, type Survey } from '@/types/survey';
import { SurveyEditorModal } from '@/components/surveys/survey-editor-modal';

function fmt(ts: string, ar: boolean) {
  try { return new Date(ts).toLocaleDateString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'medium' }); }
  catch { return ts; }
}

export default function SurveysPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Survey | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const surveysQ = useQuery({ queryKey: ['surveys'], queryFn: listSurveys });
  const surveys = surveysQ.data ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSurvey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); setConfirmDelete(null); },
  });

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-slate-500" />
          <h1 className="text-xl font-semibold text-slate-800">{ar ? 'الاستبيانات' : 'Surveys'}</h1>
          <span className="text-sm text-slate-400">{surveys.length}</span>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4" />{ar ? 'استبيان جديد' : 'New survey'}
        </Button>
      </div>

      {surveysQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {!surveysQ.isLoading && surveys.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">
          <ClipboardList className="h-6 w-6 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">{ar ? 'لا توجد استبيانات بعد.' : 'No surveys yet.'}</p>
        </div>
      )}

      <div className="space-y-2">
        {surveys.map((s) => (
          <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-800 truncate">{ar ? s.titleAr || s.title : s.title || s.titleAr || (ar ? '(بدون عنوان)' : '(untitled)')}</span>
                <span className={'rounded px-1.5 py-0.5 text-[11px] ' + statusColor(s.status)}>{statusLabel(s.status, ar)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {fmt(s.createdAt, ar)} · {s.responseCount} {ar ? 'استجابة' : 'responses'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/surveys/${s.id}/results`} className="text-slate-400 hover:text-indigo-600 p-1.5" title={ar ? 'النتائج' : 'Results'}>
                <BarChart3 className="h-4 w-4" />
              </Link>
              <Link href={`/surveys/${s.id}/distribute`} className="text-slate-400 hover:text-indigo-600 p-1.5" title={ar ? 'التوزيع' : 'Distribute'}>
                <Send className="h-4 w-4" />
              </Link>
              <button onClick={() => setEditing(s)} className="text-slate-400 hover:text-indigo-600 p-1.5" title={ar ? 'تعديل' : 'Edit'}>
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => setConfirmDelete(s.id)} className="text-slate-400 hover:text-red-600 p-1.5" title={ar ? 'حذف' : 'Delete'}>
                <Trash2 className="h-4 w-4" />
              </button>
              <Link href={`/surveys/${s.id}`} className="text-slate-300 hover:text-slate-600 p-1.5" title={ar ? 'الأسئلة' : 'Questions'}>
                <ChevronRight className="h-5 w-5 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <SurveyEditorModal
          survey={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['surveys'] }); setCreating(false); setEditing(null); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
            <p className="text-sm text-slate-700 mb-1 font-medium">{ar ? 'حذف الاستبيان؟' : 'Delete this survey?'}</p>
            <p className="text-xs text-slate-500 mb-4">{ar ? 'سيُحذف نهائيًا مع جميع أسئلته واستجاباته.' : 'This permanently removes it with all its questions and responses.'}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>{ar ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={() => deleteMut.mutate(confirmDelete)} disabled={deleteMut.isPending} className="bg-red-600 hover:bg-red-700">
                {ar ? 'حذف' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
