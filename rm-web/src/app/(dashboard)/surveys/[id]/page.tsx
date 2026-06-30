'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Trash2, GripVertical, Star, ChevronUp, ChevronDown,
  Loader2, Check, Send, Pencil, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/providers/language-provider';
import {
  getSurvey, getSurveyQuestions, addQuestion, updateQuestion, deleteQuestion, reorderQuestions, setSurveyStatus,
} from '@/lib/surveys/queries';
import {
  QUESTION_TYPES, questionTypeLabel, typeNeedsOptions, statusLabel, statusColor,
  type SurveyQuestion, type QuestionType, type QuestionOption,
} from '@/types/survey';

const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-500 mb-1 block';

type Draft = {
  question: string; questionAr: string;
  qType: QuestionType;
  options: QuestionOption[];
  isRequired: boolean;
};

const emptyDraft = (): Draft => ({ question: '', questionAr: '', qType: 'single_choice', options: [], isRequired: false });

export default function SurveyBuilderPage() {
  const params = useParams();
  const surveyId = String(params.id);
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const surveyQ = useQuery({ queryKey: ['survey', surveyId], queryFn: () => getSurvey(surveyId) });
  const questionsQ = useQuery({ queryKey: ['survey-questions', surveyId], queryFn: () => getSurveyQuestions(surveyId) });
  const survey = surveyQ.data;
  const questions = questionsQ.data ?? [];

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SurveyQuestion | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['survey-questions', surveyId] });

  const statusMut = useMutation({
    mutationFn: (status: 'draft' | 'active' | 'closed') => setSurveyStatus(surveyId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey', surveyId] }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: refresh,
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => reorderQuestions(ids),
    onSuccess: refresh,
  });

  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= questions.length) return;
    const ids = questions.map((q) => q.id);
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    reorderMut.mutate(ids);
  };

  if (surveyQ.isLoading) return <div className="p-8 text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;
  if (!survey) return <div className="p-8 text-slate-400">{ar ? 'الاستبيان غير موجود' : 'Survey not found'}</div>;

  const title = ar ? survey.titleAr || survey.title : survey.title || survey.titleAr;

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8">
      <Link href="/surveys" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ar ? 'الاستبيانات' : 'Surveys'}
      </Link>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-semibold text-slate-800">{title || (ar ? '(بدون عنوان)' : '(untitled)')}</h1>
        <span className={'rounded px-2 py-0.5 text-xs shrink-0 ' + statusColor(survey.status)}>{statusLabel(survey.status, ar)}</span>
      </div>
      {(ar ? survey.descriptionAr || survey.description : survey.description) && (
        <p className="text-sm text-slate-500 mb-4">{ar ? survey.descriptionAr || survey.description : survey.description}</p>
      )}

      {/* status actions */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {survey.status === 'draft' && (
          <Button onClick={() => statusMut.mutate('active')} disabled={questions.length === 0 || statusMut.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Check className="h-4 w-4" />{ar ? 'تفعيل' : 'Activate'}
          </Button>
        )}
        {survey.status === 'active' && (
          <>
            <Link href={`/surveys/${surveyId}/distribute`}>
              <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700"><Send className="h-4 w-4" />{ar ? 'التوزيع' : 'Distribute'}</Button>
            </Link>
            <Button variant="outline" onClick={() => statusMut.mutate('closed')} disabled={statusMut.isPending}>{ar ? 'إغلاق' : 'Close'}</Button>
          </>
        )}
        {survey.status === 'closed' && (
          <Button variant="outline" onClick={() => statusMut.mutate('active')} disabled={statusMut.isPending}>{ar ? 'إعادة فتح' : 'Reopen'}</Button>
        )}
        {questions.length === 0 && survey.status === 'draft' && (
          <span className="text-xs text-amber-600">{ar ? 'أضِف سؤالًا واحدًا على الأقل للتفعيل.' : 'Add at least one question to activate.'}</span>
        )}
      </div>

      {/* questions list */}
      <div className="space-y-2 mb-4">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col items-center pt-0.5">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                <span className="text-[10px] text-slate-400">{idx + 1}</span>
                <button onClick={() => move(idx, 1)} disabled={idx === questions.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{ar ? q.questionAr || q.question : q.question || q.questionAr}</span>
                  {q.isRequired && <span className="text-red-500 text-xs">*</span>}
                  <span className="text-[11px] rounded bg-slate-100 text-slate-500 px-1.5 py-0.5">{questionTypeLabel(q.qType, ar)}</span>
                </div>
                <QuestionPreview q={q} ar={ar} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setEditing(q); setEditorOpen(true); }} className="text-slate-400 hover:text-indigo-600 p-1"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => { if (confirm(ar ? 'حذف السؤال؟' : 'Delete this question?')) delMut.mutate(q.id); }} className="text-slate-400 hover:text-red-600 p-1"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
        {questions.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">
            {ar ? 'لا توجد أسئلة بعد.' : 'No questions yet.'}
          </div>
        )}
      </div>

      <Button onClick={() => { setEditing(null); setEditorOpen(true); }} variant="outline" className="gap-2 w-full">
        <Plus className="h-4 w-4" />{ar ? 'إضافة سؤال' : 'Add question'}
      </Button>

      {editorOpen && (
        <QuestionEditor
          surveyId={surveyId}
          existing={editing}
          nextOrder={questions.length}
          ar={ar}
          onClose={() => { setEditorOpen(false); setEditing(null); }}
          onSaved={() => { refresh(); setEditorOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ---- preview of a question as respondents would see it ----
function QuestionPreview({ q, ar }: { q: SurveyQuestion; ar: boolean }) {
  if (q.qType === 'rating') {
    return (
      <div className="flex gap-0.5 mt-1.5">
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} className="h-4 w-4 text-amber-300" />)}
      </div>
    );
  }
  if (q.qType === 'yes_no') {
    return <p className="text-xs text-slate-400 mt-1">{ar ? 'نعم / لا' : 'Yes / No'}</p>;
  }
  if (q.qType === 'short_text') {
    return <div className="mt-1.5 h-7 rounded border border-dashed border-slate-200 bg-slate-50" />;
  }
  if (typeNeedsOptions(q.qType)) {
    return (
      <ul className="mt-1.5 space-y-1">
        {q.options.map((o) => (
          <li key={o.id} className="flex items-center gap-2 text-xs text-slate-500">
            <span className={'h-3 w-3 border border-slate-300 ' + (q.qType === 'single_choice' ? 'rounded-full' : 'rounded-sm')} />
            {ar ? o.labelAr || o.label : o.label || o.labelAr}
          </li>
        ))}
        {q.options.length === 0 && <li className="text-xs text-amber-500">{ar ? 'لا خيارات — عدّل لإضافتها' : 'No options — edit to add'}</li>}
      </ul>
    );
  }
  return null;
}

// ---- add/edit a question ----
function QuestionEditor({
  surveyId, existing, nextOrder, ar, onClose, onSaved,
}: {
  surveyId: string;
  existing: SurveyQuestion | null;
  nextOrder: number;
  ar: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(existing
    ? { question: existing.question, questionAr: existing.questionAr, qType: existing.qType, options: existing.options, isRequired: existing.isRequired }
    : emptyDraft());

  const saveMut = useMutation({
    mutationFn: async () => {
      const input = {
        question: draft.question.trim(), questionAr: draft.questionAr.trim(),
        qType: draft.qType,
        options: typeNeedsOptions(draft.qType) ? draft.options.filter((o) => (o.label || o.labelAr).trim()) : [],
        isRequired: draft.isRequired,
        sortOrder: existing ? existing.sortOrder : nextOrder,
      };
      if (existing) await updateQuestion(existing.id, input);
      else await addQuestion(surveyId, input);
    },
    onSuccess: onSaved,
  });

  const addOption = () => setDraft((d) => ({ ...d, options: [...d.options, { id: crypto.randomUUID(), label: '', labelAr: '' }] }));
  const updateOption = (id: string, patch: Partial<QuestionOption>) =>
    setDraft((d) => ({ ...d, options: d.options.map((o) => o.id === id ? { ...o, ...patch } : o) }));
  const removeOption = (id: string) => setDraft((d) => ({ ...d, options: d.options.filter((o) => o.id !== id) }));

  const needsOptions = typeNeedsOptions(draft.qType);
  const canSave = (draft.question.trim() || draft.questionAr.trim()) &&
    (!needsOptions || draft.options.some((o) => (o.label || o.labelAr).trim())) &&
    !saveMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{existing ? (ar ? 'تعديل السؤال' : 'Edit Question') : (ar ? 'سؤال جديد' : 'New Question')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={LBL}>{ar ? 'نوع السؤال' : 'Question type'}</label>
            <select value={draft.qType} onChange={(e) => setDraft((d) => ({ ...d, qType: e.target.value as QuestionType }))} className={IN}>
              {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{ar ? t.ar : t.en}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LBL}>{ar ? 'السؤال (إنجليزي)' : 'Question (EN)'}</label>
              <input value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} className={IN} dir="ltr" />
            </div>
            <div>
              <label className={LBL}>{ar ? 'السؤال (عربي)' : 'Question (AR)'}</label>
              <input value={draft.questionAr} onChange={(e) => setDraft((d) => ({ ...d, questionAr: e.target.value }))} className={IN} dir="rtl" />
            </div>
          </div>

          {/* options editor for choice types */}
          {needsOptions && (
            <div>
              <label className={LBL}>{ar ? 'الخيارات' : 'Options'}</label>
              <div className="space-y-2">
                {draft.options.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input value={o.label} onChange={(e) => updateOption(o.id, { label: e.target.value })} placeholder={ar ? 'إنجليزي' : 'English'} className={IN} dir="ltr" />
                    <input value={o.labelAr} onChange={(e) => updateOption(o.id, { labelAr: e.target.value })} placeholder={ar ? 'عربي' : 'Arabic'} className={IN} dir="rtl" />
                    <button onClick={() => removeOption(o.id)} className="text-slate-400 hover:text-red-600 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <button onClick={addOption} className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                <Plus className="h-3 w-3" />{ar ? 'إضافة خيار' : 'Add option'}
              </button>
            </div>
          )}

          {/* rating preview */}
          {draft.qType === 'rating' && (
            <div>
              <label className={LBL}>{ar ? 'معاينة' : 'Preview'}</label>
              <div className="flex gap-1">{[1,2,3,4,5].map((n) => <Star key={n} className="h-6 w-6 text-amber-300" />)}</div>
            </div>
          )}

          <label className="flex items-center justify-between gap-3 py-2 border-t border-slate-100">
            <span className="text-sm text-slate-700">{ar ? 'إجباري' : 'Required'}</span>
            <input type="checkbox" checked={draft.isRequired} onChange={(e) => setDraft((d) => ({ ...d, isRequired: e.target.checked }))} className="h-4 w-4" />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>{ar ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{ar ? 'حفظ' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
