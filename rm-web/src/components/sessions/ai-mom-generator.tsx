'use client';

// AiMomGenerator — admin/super_admin only.
//
// Two-step modal:
//   Step 1: Input notes (free-form textarea) + Generate button
//   Step 2: Preview (current vs AI-proposed, side by side per field)
//           + Accept (replaces session content, persists suggested tasks)
//           + Discard (closes, nothing changes)
//
// Re-generation is non-destructive (per Q5): admin always confirms via preview.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, X, Check, AlertTriangle, RotateCw } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { Session, PendingAiTask } from '@/types/session';
import { aiTaskToRow } from '@/types/session';

type AiResult = {
  mom_content: string;
  mom_content_ar: string;
  meeting_notes: string;
  meeting_notes_ar: string;
  decisions: string;
  decisions_ar: string;
  action_items: string;
  action_items_ar: string;
  suggested_tasks: Array<{
    title: string;
    title_ar: string;
    description: string;
    description_ar: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    suggested_due_date: string | null;
  }>;
};

type Props = {
  session: Session;
  onClose: () => void;
  onAccepted: () => void;
};

export function AiMomGenerator({ session, onClose, onAccepted }: Props) {
  const { language, isRTL } = useLanguage();
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<AiResult | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/generate-mom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          session_context: `Title: ${session.title} / ${session.titleAr}. Meeting date: ${session.meetingDate.toISOString()}.`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as AiResult;
    },
    onSuccess: (data) => setResult(data),
  });

  const accept = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error('no_result');
      const supabase = createClient();

      // Compose the new pending_ai_tasks rows. Each AI suggestion becomes a
      // PendingAiTask with status='pending'. Existing pending tasks are
      // preserved (we append, not replace).
      const newSuggestions: PendingAiTask[] = result.suggested_tasks.map((t) => ({
        id: crypto.randomUUID(),
        title: t.title,
        titleAr: t.title_ar,
        description: t.description,
        descriptionAr: t.description_ar,
        priority: t.priority,
        suggestedAssigneeId: null,
        suggestedDueDate: t.suggested_due_date,
        suggestedDomainId: null,
        status: 'pending',
        resolvedAt: null,
        resolvedById: null,
        createdTaskId: null,
        aiGeneratedAt: new Date(),
      }));

      const combinedPending = [
        ...session.pendingAiTasks,
        ...newSuggestions,
      ].map(aiTaskToRow);

      const { error } = await supabase
        .from('sessions')
        .update({
          mom_content: result.mom_content,
          mom_content_ar: result.mom_content_ar,
          meeting_notes: result.meeting_notes,
          meeting_notes_ar: result.meeting_notes_ar,
          decisions: result.decisions,
          decisions_ar: result.decisions_ar,
          action_items: result.action_items,
          action_items_ar: result.action_items_ar,
          pending_ai_tasks: combinedPending,
        })
        .eq('id', session.id);
      if (error) throw new Error(error.message);

      // Log a single edit-history entry summarising the AI usage
      await supabase.from('session_edit_history').insert({
        session_id: session.id,
        edited_by_id: (await supabase.auth.getUser()).data.user?.id,
        change_description: `AI-generated MoM content accepted (${newSuggestions.length} task suggestions added)`,
        change_description_ar: `تم قبول محتوى المحضر المُولَّد بالذكاء الاصطناعي (${newSuggestions.length} مهام مقترحة)`,
      });
    },
    onSuccess: () => onAccepted(),
  });

  const inputStep = !result;
  const previewStep = !!result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">
              {language === 'ar'
                ? 'توليد المحضر بالذكاء الاصطناعي'
                : 'Generate MoM with AI'}
            </h2>
            {previewStep && (
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                {language === 'ar' ? 'معاينة' : 'Preview'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[75vh] overflow-y-auto">
          {inputStep && (
            <InputStep
              notes={notes}
              onNotesChange={setNotes}
              language={language}
              error={generate.error as Error | null}
              isPending={generate.isPending}
            />
          )}

          {previewStep && (
            <PreviewStep
              session={session}
              result={result!}
              language={language}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          {inputStep && (
            <>
              <Button variant="outline" onClick={onClose} disabled={generate.isPending}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                onClick={() => generate.mutate()}
                disabled={notes.trim().length < 10 || generate.isPending}
                className="gap-2"
              >
                {generate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {language === 'ar' ? 'توليد' : 'Generate'}
              </Button>
            </>
          )}

          {previewStep && (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setResult(null)}
                  disabled={accept.isPending}
                  className="gap-2"
                >
                  <RotateCw className="h-4 w-4" />
                  {language === 'ar' ? 'إعادة توليد' : 'Regenerate'}
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={accept.isPending}
                >
                  {language === 'ar' ? 'تجاهل' : 'Discard'}
                </Button>
              </div>
              <Button
                onClick={() => accept.mutate()}
                disabled={accept.isPending}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {accept.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {language === 'ar' ? 'قبول واستبدال' : 'Accept & Replace'}
              </Button>
            </>
          )}
        </div>

        {accept.isError && (
          <div className="mx-5 mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
            {(accept.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Step 1: input
// =============================================================================

function InputStep({
  notes,
  onNotesChange,
  language,
  error,
  isPending,
}: {
  notes: string;
  onNotesChange: (v: string) => void;
  language: 'en' | 'ar';
  error: Error | null;
  isPending: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-2 flex gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
        <p className="text-indigo-900">
          {language === 'ar'
            ? 'اكتب ملاحظات الاجتماع بشكل غير رسمي بأي لغة. سيقوم الذكاء الاصطناعي بإنشاء محضر رسمي ثنائي اللغة (إنجليزي + عربي) مع اقتراحات مهام.'
            : 'Type informal meeting notes in either language. AI will produce formal bilingual minutes (EN + AR) and suggest tasks.'}
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700">
          {language === 'ar' ? 'ملاحظات الاجتماع' : 'Meeting notes'}{' '}
          <span className="text-slate-500">
            ({notes.length}/10000)
          </span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={14}
          disabled={isPending}
          placeholder={
            language === 'ar'
              ? 'مثال: التقينا مع شركة الرعاية السعودية. خالد طلب مراجعة سريعة لطلب ترخيص الغسيل الكلوي. وافقنا. سارة ستنسق مع لجنة الترخيص قبل نهاية الأسبوع. أيضا ناقشنا التوسع في السياحة العلاجية - يحتاج لجنة منفصلة.'
              : 'Example: Met with Saudi Healthcare Ventures. Khalid asked for fast-track on dialysis license. We agreed. Sarah will coordinate with Licensing Committee by end of week. Also discussed wellness tourism expansion — needs separate committee review.'
          }
          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-1"
        />
        <p className="text-xs text-slate-500 mt-1">
          {language === 'ar'
            ? 'حد أدنى 10 أحرف. المحتوى الحالي للجلسة سيتم استبداله إذا قبلت النتيجة.'
            : 'Minimum 10 characters. Existing session content will be replaced if you accept the result.'}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 flex gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              {language === 'ar' ? 'فشل التوليد' : 'Generation failed'}
            </p>
            <p className="text-xs mt-0.5">{error.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Step 2: preview
// =============================================================================

function PreviewStep({
  session,
  result,
  language,
}: {
  session: Session;
  result: AiResult;
  language: 'en' | 'ar';
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {language === 'ar'
          ? 'راجع الناتج المقترح أدناه. عند القبول، سيتم استبدال الحقول الأربعة بمحتوى الذكاء الاصطناعي، وستُضاف المهام المقترحة لقائمة التصنيف.'
          : 'Review the proposed output. On Accept, the 4 content fields will be replaced with AI content and task suggestions will be added to the triage list.'}
      </p>

      <FieldDiff
        label={language === 'ar' ? 'محضر الاجتماع' : 'Minutes of Meeting'}
        currentEn={session.momContent}
        currentAr={session.momContentAr}
        nextEn={result.mom_content}
        nextAr={result.mom_content_ar}
        language={language}
      />
      <FieldDiff
        label={language === 'ar' ? 'ملاحظات الاجتماع' : 'Meeting Notes'}
        currentEn={session.meetingNotes}
        currentAr={session.meetingNotesAr}
        nextEn={result.meeting_notes}
        nextAr={result.meeting_notes_ar}
        language={language}
      />
      <FieldDiff
        label={language === 'ar' ? 'القرارات' : 'Decisions'}
        currentEn={session.decisions}
        currentAr={session.decisionsAr}
        nextEn={result.decisions}
        nextAr={result.decisions_ar}
        language={language}
      />
      <FieldDiff
        label={language === 'ar' ? 'بنود العمل' : 'Action Items'}
        currentEn={session.actionItems}
        currentAr={session.actionItemsAr}
        nextEn={result.action_items}
        nextAr={result.action_items_ar}
        language={language}
      />

      {/* Suggested tasks */}
      <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-indigo-900">
            {language === 'ar'
              ? `${result.suggested_tasks.length} مهام مقترحة`
              : `${result.suggested_tasks.length} suggested tasks`}
          </h3>
        </div>
        {result.suggested_tasks.length === 0 ? (
          <p className="text-xs text-indigo-700 italic">
            {language === 'ar'
              ? 'لم يقترح الذكاء الاصطناعي أي مهام لهذه الجلسة.'
              : "AI didn't suggest any tasks for this session."}
          </p>
        ) : (
          <ul className="space-y-2">
            {result.suggested_tasks.map((t, i) => (
              <li key={i} className="bg-white rounded border border-indigo-100 p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      {language === 'ar' ? t.title_ar || t.title : t.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {language === 'ar' ? t.description_ar || t.description : t.description}
                    </div>
                  </div>
                  <PriorityPill priority={t.priority} language={language} />
                </div>
                {t.suggested_due_date && (
                  <div className="text-xs text-slate-500 mt-1">
                    {language === 'ar' ? 'تاريخ الاستحقاق:' : 'Due:'} {t.suggested_due_date}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-indigo-700 mt-3">
          {language === 'ar'
            ? 'يمكنك تعيين أو تجاهل كل مهمة بعد القبول من بطاقة "المهام المعلقة".'
            : 'You can assign or discard each task after accepting via the "Pending AI Tasks" card.'}
        </p>
      </div>
    </div>
  );
}

function FieldDiff({
  label,
  currentEn,
  currentAr,
  nextEn,
  nextAr,
  language,
}: {
  label: string;
  currentEn: string;
  currentAr: string;
  nextEn: string;
  nextAr: string;
  language: 'en' | 'ar';
}) {
  const hasCurrent = currentEn.trim() || currentAr.trim();
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">{label}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        <div className="p-3">
          <p className="text-[10px] uppercase font-semibold text-slate-500 mb-1">
            {language === 'ar' ? 'الحالي' : 'Current'}
          </p>
          {hasCurrent ? (
            <>
              {currentEn && <p className="text-sm text-slate-700 whitespace-pre-wrap mb-2" dir="ltr">{currentEn}</p>}
              {currentAr && <p className="text-sm text-slate-700 whitespace-pre-wrap" dir="rtl">{currentAr}</p>}
            </>
          ) : (
            <p className="text-xs text-slate-400 italic">
              {language === 'ar' ? '(فارغ)' : '(empty)'}
            </p>
          )}
        </div>
        <div className="p-3 bg-indigo-50/30">
          <p className="text-[10px] uppercase font-semibold text-indigo-600 mb-1">
            {language === 'ar' ? 'المُقترح' : 'Proposed'}
          </p>
          {nextEn && <p className="text-sm text-slate-700 whitespace-pre-wrap mb-2" dir="ltr">{nextEn}</p>}
          {nextAr && <p className="text-sm text-slate-700 whitespace-pre-wrap" dir="rtl">{nextAr}</p>}
        </div>
      </div>
    </div>
  );
}

function PriorityPill({
  priority,
  language,
}: {
  priority: 'low' | 'medium' | 'high' | 'critical';
  language: 'en' | 'ar';
}) {
  const labels = {
    low: { en: 'Low', ar: 'منخفض' },
    medium: { en: 'Medium', ar: 'متوسط' },
    high: { en: 'High', ar: 'عالي' },
    critical: { en: 'Critical', ar: 'حرجة' },
  };
  const colors = {
    low: 'bg-slate-100 text-slate-700',
    medium: 'bg-blue-50 text-blue-700',
    high: 'bg-amber-50 text-amber-800',
    critical: 'bg-red-50 text-red-700',
  };
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', colors[priority])}>
      {labels[priority][language]}
    </span>
  );
}
