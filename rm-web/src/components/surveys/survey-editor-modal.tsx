'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import { createSurvey, updateSurvey } from '@/lib/surveys/queries';
import type { Survey } from '@/types/survey';

const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-500 mb-1 block';

export function SurveyEditorModal({
  survey, onClose, onSaved,
}: {
  survey: Survey | null; // null = create
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const isEdit = !!survey;

  const [title, setTitle] = useState(survey?.title ?? '');
  const [titleAr, setTitleAr] = useState(survey?.titleAr ?? '');
  const [description, setDescription] = useState(survey?.description ?? '');
  const [descriptionAr, setDescriptionAr] = useState(survey?.descriptionAr ?? '');
  const [isAnonymous, setIsAnonymous] = useState(survey?.isAnonymous ?? false);
  const [collectInfo, setCollectInfo] = useState(survey?.collectRespondentInfo ?? false);

  const saveMut = useMutation({
    mutationFn: async () => {
      const input = {
        title: title.trim(), titleAr: titleAr.trim(),
        description: description.trim(), descriptionAr: descriptionAr.trim(),
        isAnonymous, collectRespondentInfo: collectInfo,
      };
      if (isEdit) { await updateSurvey(survey!.id, input); return survey!.id; }
      const s = await createSurvey(input); return s.id;
    },
    onSuccess: (id) => onSaved(id),
  });

  const canSave = (title.trim() || titleAr.trim()) && !saveMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? (ar ? 'تعديل الاستبيان' : 'Edit Survey') : (ar ? 'استبيان جديد' : 'New Survey')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LBL}>{ar ? 'العنوان (إنجليزي)' : 'Title (EN)'}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={IN} dir="ltr" />
            </div>
            <div>
              <label className={LBL}>{ar ? 'العنوان (عربي)' : 'Title (AR)'}</label>
              <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className={IN} dir="rtl" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LBL}>{ar ? 'الوصف (إنجليزي)' : 'Description (EN)'}</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={IN} dir="ltr" />
            </div>
            <div>
              <label className={LBL}>{ar ? 'الوصف (عربي)' : 'Description (AR)'}</label>
              <textarea value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} rows={2} className={IN} dir="rtl" />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 py-2 border-t border-slate-100">
            <span className="text-sm text-slate-700">
              {ar ? 'استبيان مجهول' : 'Anonymous survey'}
              <span className="block text-[11px] text-slate-400">{ar ? 'لا تُسجَّل هوية المستجيب.' : 'No respondent identity is stored.'}</span>
            </span>
            <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} className="h-4 w-4" />
          </label>

          <label className="flex items-center justify-between gap-3 py-2 border-t border-slate-100">
            <span className="text-sm text-slate-700">
              {ar ? 'طلب اسم/بريد المستجيب (للرابط العام)' : 'Collect respondent name/email (for the public link)'}
              <span className="block text-[11px] text-slate-400">{ar ? 'يُطلب اختياريًا في النموذج العام.' : 'Optionally requested on the public form.'}</span>
            </span>
            <input type="checkbox" checked={collectInfo} disabled={isAnonymous} onChange={(e) => setCollectInfo(e.target.checked)} className="h-4 w-4" />
          </label>

          {saveMut.isError && <p className="text-xs text-red-600">{ar ? 'تعذّر الحفظ.' : 'Could not save.'}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <span className="text-[11px] text-slate-400">
            {isEdit ? '' : (ar ? 'تُضاف الأسئلة بعد الإنشاء.' : 'Add questions after creating.')}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>{ar ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!canSave} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? (ar ? 'حفظ' : 'Save') : (ar ? 'إنشاء' : 'Create')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
