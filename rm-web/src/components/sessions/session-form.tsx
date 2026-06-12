'use client';

// SessionForm — shared create/edit form.
//
// Used in two contexts:
//   - Create mode: empty form, called from /sessions list (modal)
//   - Edit mode (draft): prefilled, called from /sessions/[id]
//
// Locked sessions go through EditLockedDialog instead.
//
// Sections (in order, collapsible):
//   1. Basic — title EN+AR, meeting date, location EN+AR
//   2. Meeting Type — Main vs Follow-up (with parent picker for follow-up)
//   3. MoH Attendees
//   4. Visitor Attendees
//   5. Content — 4 bilingual sections
//   6. Participants — registered users who get read access

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, X, GitBranch } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AttendeesEditor } from './attendees-editor';
import { createSession, updateSession } from '@/lib/sessions/queries';
import {
  type Session,
  type SessionFormInput,
  type MeetingType,
} from '@/types/session';

type Props = {
  mode: 'create' | 'edit';
  session?: Session;
  onClose: () => void;
  onSaved: (s: Session) => void;
};

type SectionKey =
  | 'basic'
  | 'meetingType'
  | 'mohAttendees'
  | 'visitorAttendees'
  | 'content'
  | 'participants';

const INITIAL_OPEN: Record<SectionKey, boolean> = {
  basic: true,
  meetingType: true,
  mohAttendees: true,
  visitorAttendees: true,
  content: true,
  participants: false,
};

// Users list (for Participants picker)
function useUsers() {
  return useQuery({
    queryKey: ['users-for-participants'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('users')
        .select('id, name, name_ar, role, is_active')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);
      return data as {
        id: string;
        name: string;
        name_ar: string;
        role: string;
        is_active: boolean;
      }[];
    },
  });
}

// Main sessions list (for Follow-up parent picker).
// We fetch all main sessions in the org for the dropdown — typically small.
// Filtered to status='draft' OR 'locked' (both can have follow-ups).
function useMainSessions(excludeId?: string) {
  return useQuery({
    queryKey: ['main-sessions-for-picker'],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('id, title, title_ar, meeting_number, meeting_date, status')
        .eq('meeting_type', 'main')
        .is('deleted_at', null)
        .order('meeting_date', { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as {
        id: string;
        title: string;
        title_ar: string;
        meeting_number: string;
        meeting_date: string;
        status: string;
      }[];
      return excludeId ? rows.filter((r) => r.id !== excludeId) : rows;
    },
  });
}

export function SessionForm({ mode, session, onClose, onSaved }: Props) {
  const { language, isRTL } = useLanguage();
  const { data: users = [] } = useUsers();
  const { data: mainSessions = [] } = useMainSessions(session?.id);

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(INITIAL_OPEN);

  const [form, setForm] = useState<SessionFormInput>(() => {
    if (mode === 'edit' && session) {
      return {
        title: session.title,
        titleAr: session.titleAr,
        meetingDate: toLocalDatetimeValue(session.meetingDate),
        meetingLocation: session.meetingLocation ?? '',
        meetingLocationAr: session.meetingLocationAr ?? '',
        mohAttendees: session.mohAttendees,
        visitorAttendees: session.visitorAttendees,
        momContent: session.momContent,
        momContentAr: session.momContentAr,
        meetingNotes: session.meetingNotes,
        meetingNotesAr: session.meetingNotesAr,
        decisions: session.decisions,
        decisionsAr: session.decisionsAr,
        actionItems: session.actionItems,
        actionItemsAr: session.actionItemsAr,
        participantIds: session.participantIds,
        meetingType: session.meetingType,
        parentSessionId: session.parentSessionId,
      };
    }
    return {
      title: '',
      titleAr: '',
      meetingDate: toLocalDatetimeValue(new Date()),
      meetingLocation: '',
      meetingLocationAr: '',
      mohAttendees: [],
      visitorAttendees: [],
      momContent: '',
      momContentAr: '',
      meetingNotes: '',
      meetingNotesAr: '',
      decisions: '',
      decisionsAr: '',
      actionItems: '',
      actionItemsAr: '',
      participantIds: [],
      meetingType: 'main',
      parentSessionId: null,
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: SessionFormInput = {
        ...form,
        meetingDate: new Date(form.meetingDate).toISOString(),
      };
      return mode === 'create' ? createSession(payload) : updateSession(session!.id, payload);
    },
    onSuccess: (s) => onSaved(s),
  });

  function toggle(section: SectionKey) {
    setOpenSections((s) => ({ ...s, [section]: !s[section] }));
  }

  function setField<K extends keyof SessionFormInput>(key: K, value: SessionFormInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const n = { ...e };
      delete n[key as string];
      return n;
    });
  }

  function setMeetingType(t: MeetingType) {
    setForm((f) => ({
      ...f,
      meetingType: t,
      // Reset parent when switching to main
      parentSessionId: t === 'main' ? null : f.parentSessionId,
    }));
    setErrors((e) => {
      const n = { ...e };
      delete n.meetingType;
      delete n.parentSessionId;
      return n;
    });
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'errTitle';
    if (!form.titleAr.trim()) errs.titleAr = 'errTitleAr';
    if (!form.meetingDate) errs.meetingDate = 'errMeetingDate';
    if (form.meetingType === 'followup' && !form.parentSessionId) {
      errs.parentSessionId = 'errParentRequired';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    saveMutation.mutate();
  }

  function toggleParticipant(userId: string) {
    setForm((f) => ({
      ...f,
      participantIds: f.participantIds.includes(userId)
        ? f.participantIds.filter((id) => id !== userId)
        : [...f.participantIds, userId],
    }));
  }

  // Lock meeting type after locking - already-locked sessions don't reach this
  // form, but if mode='edit' and the session is currently draft we still want
  // to warn when switching between main/followup since it changes the meeting
  // number on next save (DB trigger does NOT regenerate on update, but we'd
  // need that to make sense).
  const meetingTypeDisabled = mode === 'edit' && session?.status === 'locked';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 sm:p-4 overflow-y-auto"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'create'
              ? language === 'ar'
                ? 'جلسة جديدة'
                : 'New Session'
              : language === 'ar'
                ? 'تعديل الجلسة'
                : 'Edit Session'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="px-5 py-4 space-y-3 max-h-[80vh] overflow-y-auto"
        >
          {/* Basic */}
          <Section
            title={language === 'ar' ? 'البيانات الأساسية' : 'Basic'}
            open={openSections.basic}
            onToggle={() => toggle('basic')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label={language === 'ar' ? 'العنوان (EN)' : 'Title (EN)'}
                required
                error={errors.title}
              >
                <Input
                  dir="ltr"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                />
              </Field>
              <Field
                label={language === 'ar' ? 'العنوان (AR)' : 'Title (AR)'}
                required
                error={errors.titleAr}
              >
                <Input
                  dir="rtl"
                  value={form.titleAr}
                  onChange={(e) => setField('titleAr', e.target.value)}
                />
              </Field>
              <Field
                label={language === 'ar' ? 'تاريخ الاجتماع' : 'Meeting Date'}
                required
                error={errors.meetingDate}
              >
                <Input
                  type="datetime-local"
                  value={form.meetingDate}
                  onChange={(e) => setField('meetingDate', e.target.value)}
                  dir="ltr"
                />
              </Field>
              <div />
              <Field label={language === 'ar' ? 'الموقع (EN)' : 'Location (EN)'}>
                <Input
                  dir="ltr"
                  value={form.meetingLocation ?? ''}
                  onChange={(e) => setField('meetingLocation', e.target.value)}
                />
              </Field>
              <Field label={language === 'ar' ? 'الموقع (AR)' : 'Location (AR)'}>
                <Input
                  dir="rtl"
                  value={form.meetingLocationAr ?? ''}
                  onChange={(e) => setField('meetingLocationAr', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* Meeting Type */}
          <Section
            title={language === 'ar' ? 'نوع الاجتماع' : 'Meeting Type'}
            icon={<GitBranch className="h-4 w-4 text-slate-500" />}
            open={openSections.meetingType}
            onToggle={() => toggle('meetingType')}
          >
            <div className="space-y-3">
              {meetingTypeDisabled && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  {language === 'ar'
                    ? 'لا يمكن تغيير نوع الاجتماع بعد القفل'
                    : "Meeting type can't change after lock"}
                </p>
              )}

              {/* Radio buttons */}
              <div className="grid grid-cols-2 gap-2">
                <TypeRadio
                  label={language === 'ar' ? 'اجتماع رئيسي' : 'Main meeting'}
                  description={
                    language === 'ar'
                      ? 'اجتماع مستقل (افتراضي)'
                      : 'Standalone meeting (default)'
                  }
                  checked={form.meetingType === 'main'}
                  onChange={() => setMeetingType('main')}
                  disabled={meetingTypeDisabled}
                />
                <TypeRadio
                  label={language === 'ar' ? 'اجتماع متابعة' : 'Follow-up meeting'}
                  description={
                    language === 'ar'
                      ? 'يتفرع من اجتماع رئيسي'
                      : 'Branches off a main meeting'
                  }
                  checked={form.meetingType === 'followup'}
                  onChange={() => setMeetingType('followup')}
                  disabled={meetingTypeDisabled}
                />
              </div>

              {/* Parent picker (visible only for follow-ups) */}
              {form.meetingType === 'followup' && (
                <Field
                  label={
                    language === 'ar' ? 'الاجتماع الرئيسي المرجع' : 'Parent main meeting'
                  }
                  required
                  error={errors.parentSessionId}
                >
                  <select
                    value={form.parentSessionId ?? ''}
                    onChange={(e) => setField('parentSessionId', e.target.value || null)}
                    disabled={meetingTypeDisabled}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
                  >
                    <option value="">
                      {language === 'ar' ? '— اختر اجتماعًا رئيسيًا —' : '— Select a main meeting —'}
                    </option>
                    {mainSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.meeting_number} —{' '}
                        {language === 'ar' ? s.title_ar || s.title : s.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    {language === 'ar'
                      ? 'سيتم ترقيم هذا الاجتماع بصيغة YYYY/MM/DD/####/### تحت رقم الاجتماع الرئيسي.'
                      : 'This meeting will be numbered as YYYY/MM/DD/####/### under the parent number.'}
                  </p>
                </Field>
              )}

              {/* Existing meeting number display (edit mode only) */}
              {mode === 'edit' && session?.meetingNumber && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-500">
                    {language === 'ar' ? 'رقم الاجتماع الحالي:' : 'Current meeting number:'}
                  </span>{' '}
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {session.meetingNumber}
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* MoH Attendees */}
          <Section
            title={language === 'ar' ? 'حضور وزارة الصحة' : 'MoH Attendees'}
            badge={String(form.mohAttendees.length)}
            open={openSections.mohAttendees}
            onToggle={() => toggle('mohAttendees')}
          >
            <AttendeesEditor
              kind="moh"
              value={form.mohAttendees}
              onChange={(next) => setField('mohAttendees', next)}
            />
          </Section>

          {/* Visitor Attendees */}
          <Section
            title={language === 'ar' ? 'الزوار' : 'Visitor Attendees'}
            badge={String(form.visitorAttendees.length)}
            open={openSections.visitorAttendees}
            onToggle={() => toggle('visitorAttendees')}
          >
            <AttendeesEditor
              kind="visitor"
              value={form.visitorAttendees}
              onChange={(next) => setField('visitorAttendees', next)}
            />
          </Section>

          {/* Content */}
          <Section
            title={language === 'ar' ? 'المحتوى' : 'Content'}
            open={openSections.content}
            onToggle={() => toggle('content')}
          >
            <ContentField
              labelEn="Minutes of Meeting"
              labelAr="محضر الاجتماع"
              valueEn={form.momContent}
              valueAr={form.momContentAr}
              onChangeEn={(v) => setField('momContent', v)}
              onChangeAr={(v) => setField('momContentAr', v)}
            />
            <ContentField
              labelEn="Meeting Notes"
              labelAr="ملاحظات الاجتماع"
              valueEn={form.meetingNotes}
              valueAr={form.meetingNotesAr}
              onChangeEn={(v) => setField('meetingNotes', v)}
              onChangeAr={(v) => setField('meetingNotesAr', v)}
            />
            <ContentField
              labelEn="Decisions"
              labelAr="القرارات"
              valueEn={form.decisions}
              valueAr={form.decisionsAr}
              onChangeEn={(v) => setField('decisions', v)}
              onChangeAr={(v) => setField('decisionsAr', v)}
            />
            <ContentField
              labelEn="Action Items"
              labelAr="بنود العمل"
              valueEn={form.actionItems}
              valueAr={form.actionItemsAr}
              onChangeEn={(v) => setField('actionItems', v)}
              onChangeAr={(v) => setField('actionItemsAr', v)}
            />
          </Section>

          {/* Participants */}
          <Section
            title={language === 'ar' ? 'المشاركون' : 'Participants'}
            badge={String(form.participantIds.length)}
            open={openSections.participants}
            onToggle={() => toggle('participants')}
          >
            <p className="text-xs text-slate-500 mb-2">
              {language === 'ar'
                ? 'المستخدمون المُختارون هنا يمكنهم قراءة الجلسة بعد الحفظ.'
                : 'Selected users will gain read access to this session after save.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-60 overflow-y-auto border border-slate-200 rounded-md p-2">
              {users.map((u) => {
                const checked = form.participantIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipant(u.id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 truncate">
                      {language === 'ar' ? u.name_ar || u.name : u.name}
                      <span className="text-xs text-slate-400 ms-1">· {u.role}</span>
                    </span>
                  </label>
                );
              })}
              {users.length === 0 && (
                <p className="text-xs text-slate-500 italic px-2 py-1">
                  {language === 'ar' ? 'لا يوجد مستخدمون' : 'No users'}
                </p>
              )}
            </div>
          </Section>

          {saveMutation.isError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              {(saveMutation.error as Error)?.message}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 sticky bottom-0 bg-white">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saveMutation.isPending}
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {mode === 'create'
                ? language === 'ar'
                  ? 'إنشاء كمسودة'
                  : 'Create as draft'
                : language === 'ar'
                  ? 'حفظ'
                  : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================

function Section({
  title,
  badge,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
      >
        <span className="font-medium text-sm text-slate-900 flex items-center gap-2">
          {icon}
          {title}
          {badge && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700">
              {badge}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-700">
        {label}
        {required && <span className="text-red-500 ms-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function TypeRadio({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors',
        checked
          ? 'border-slate-900 bg-slate-50'
          : 'border-slate-200 bg-white hover:bg-slate-50',
        disabled && 'opacity-60 cursor-not-allowed'
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
    </label>
  );
}

function ContentField({
  labelEn,
  labelAr,
  valueEn,
  valueAr,
  onChangeEn,
  onChangeAr,
}: {
  labelEn: string;
  labelAr: string;
  valueEn: string;
  valueAr: string;
  onChangeEn: (v: string) => void;
  onChangeAr: (v: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-slate-700 mb-1">
        {labelEn} <span className="text-slate-400">/ {labelAr}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <textarea
          dir="ltr"
          placeholder={labelEn}
          value={valueEn}
          onChange={(e) => onChangeEn(e.target.value)}
          rows={4}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1'
          )}
        />
        <textarea
          dir="rtl"
          placeholder={labelAr}
          value={valueAr}
          onChange={(e) => onChangeAr(e.target.value)}
          rows={4}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-arabic',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1'
          )}
        />
      </div>
    </div>
  );
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
