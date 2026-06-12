'use client';

// EditLockedDialog — edits content on a locked session that has had editing
// re-enabled. Narrower than the main form: only the 4 bilingual content
// sections (mom, notes, decisions, action items) can be touched here. All
// other fields (title, date, attendees, participants) are immutable once
// locked — those characterize the meeting itself.
//
// Mandatory: a change description in EN + AR explaining the edit. Logged to
// session_edit_history alongside a snapshot diff of the changed fields.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Edit3, Loader2, X } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { editLockedSession } from '@/lib/sessions/queries';
import type { Session } from '@/types/session';

type Props = {
  session: Session;
  onClose: () => void;
  onEdited: (s: Session) => void;
};

export function EditLockedDialog({ session, onClose, onEdited }: Props) {
  const { language, isRTL } = useLanguage();

  const [momContent, setMomContent] = useState(session.momContent);
  const [momContentAr, setMomContentAr] = useState(session.momContentAr);
  const [meetingNotes, setMeetingNotes] = useState(session.meetingNotes);
  const [meetingNotesAr, setMeetingNotesAr] = useState(session.meetingNotesAr);
  const [decisions, setDecisions] = useState(session.decisions);
  const [decisionsAr, setDecisionsAr] = useState(session.decisionsAr);
  const [actionItems, setActionItems] = useState(session.actionItems);
  const [actionItemsAr, setActionItemsAr] = useState(session.actionItemsAr);

  const [changeDescription, setChangeDescription] = useState('');
  const [changeDescriptionAr, setChangeDescriptionAr] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      editLockedSession(
        session.id,
        {
          momContent,
          momContentAr,
          meetingNotes,
          meetingNotesAr,
          decisions,
          decisionsAr,
          actionItems,
          actionItemsAr,
        },
        changeDescription,
        changeDescriptionAr
      ),
    onSuccess: (s) => onEdited(s),
  });

  const canSubmit = changeDescription.trim().length > 0 && changeDescriptionAr.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-slate-700" />
            <h3 className="text-base font-semibold">
              {language === 'ar' ? 'تعديل جلسة مقفلة' : 'Edit locked session'}
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

        <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <ContentField
            labelEn="Minutes of Meeting"
            labelAr="محضر الاجتماع"
            valueEn={momContent}
            valueAr={momContentAr}
            onChangeEn={setMomContent}
            onChangeAr={setMomContentAr}
            disabled={mut.isPending}
          />
          <ContentField
            labelEn="Meeting Notes"
            labelAr="ملاحظات الاجتماع"
            valueEn={meetingNotes}
            valueAr={meetingNotesAr}
            onChangeEn={setMeetingNotes}
            onChangeAr={setMeetingNotesAr}
            disabled={mut.isPending}
          />
          <ContentField
            labelEn="Decisions"
            labelAr="القرارات"
            valueEn={decisions}
            valueAr={decisionsAr}
            onChangeEn={setDecisions}
            onChangeAr={setDecisionsAr}
            disabled={mut.isPending}
          />
          <ContentField
            labelEn="Action Items"
            labelAr="بنود العمل"
            valueEn={actionItems}
            valueAr={actionItemsAr}
            onChangeEn={setActionItems}
            onChangeAr={setActionItemsAr}
            disabled={mut.isPending}
          />

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <p className="text-sm font-medium text-slate-900">
              {language === 'ar'
                ? 'وصف التغيير (مطلوب)'
                : 'Change description (required)'}
            </p>
            <div className="space-y-1">
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'الوصف (EN)' : 'Description (EN)'} <span className="text-red-500">*</span>
              </label>
              <textarea
                dir="ltr"
                value={changeDescription}
                onChange={(e) => setChangeDescription(e.target.value)}
                rows={2}
                disabled={mut.isPending}
                placeholder="e.g. Corrected misspelled vendor name in action items"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-700">
                {language === 'ar' ? 'الوصف (AR)' : 'Description (AR)'} <span className="text-red-500">*</span>
              </label>
              <textarea
                dir="rtl"
                value={changeDescriptionAr}
                onChange={(e) => setChangeDescriptionAr(e.target.value)}
                rows={2}
                disabled={mut.isPending}
                placeholder="مثال: تم تصحيح خطأ في اسم المورد في بنود العمل"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
              />
            </div>
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
            {language === 'ar' ? 'حفظ التعديل' : 'Save edit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ContentField({
  labelEn,
  labelAr,
  valueEn,
  valueAr,
  onChangeEn,
  onChangeAr,
  disabled,
}: {
  labelEn: string;
  labelAr: string;
  valueEn: string;
  valueAr: string;
  onChangeEn: (v: string) => void;
  onChangeAr: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-700 mb-1">
        {labelEn} <span className="text-slate-400">/ {labelAr}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <textarea
          dir="ltr"
          value={valueEn}
          onChange={(e) => onChangeEn(e.target.value)}
          rows={3}
          disabled={disabled}
          className={cn(
            'flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1',
            'disabled:bg-slate-50'
          )}
        />
        <textarea
          dir="rtl"
          value={valueAr}
          onChange={(e) => onChangeAr(e.target.value)}
          rows={3}
          disabled={disabled}
          className={cn(
            'flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1',
            'disabled:bg-slate-50'
          )}
        />
      </div>
    </div>
  );
}
