'use client';

// SessionDetailClient — /sessions/[id]
//
// Shows: meeting number prominently in header, parent link (if follow-up),
// list of child follow-ups (if main), action buttons by role/state, content,
// edit history. Adds a Participants card to display registered users.

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Edit3,
  Trash2,
  Download,
  Calendar,
  MapPin,
  Users,
  Building2,
  FileText,
  ClipboardList,
  AlertTriangle,
  Hash,
  GitBranch,
  ArrowUpRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { getSession, deleteSession } from '@/lib/sessions/queries';
import { sessionToWordHtml, downloadWordDoc } from '@/lib/sessions/export';
import { SessionForm } from '@/components/sessions/session-form';
import { LockDialog } from '@/components/sessions/lock-dialog';
import { ReEnableEditDialog } from '@/components/sessions/re-enable-edit-dialog';
import { EditLockedDialog } from '@/components/sessions/edit-locked-dialog';
import { EditHistoryPanel } from '@/components/sessions/edit-history-panel';
import type { Session, MeetingType } from '@/types/session';
import { cn } from '@/lib/utils';

type ModalState =
  | { kind: 'none' }
  | { kind: 'edit' }
  | { kind: 'lock' }
  | { kind: 're-enable' }
  | { kind: 'edit-locked' }
  | { kind: 'delete' };

export function SessionDetailClient({ id }: { id: string }) {
  const { user } = useAuth();
  const { language, isRTL } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });

  const { data: session, isLoading, isError, error } = useQuery({
    queryKey: ['session', id],
    queryFn: () => getSession(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.replace('/sessions');
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {(error as Error)?.message}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          {language === 'ar'
            ? 'الجلسة غير موجودة أو لا يمكن الوصول إليها'
            : 'Session not found or not accessible'}
        </div>
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1 mt-3 text-sm text-slate-700 hover:underline"
        >
          {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {language === 'ar' ? 'العودة إلى الجلسات' : 'Back to sessions'}
        </Link>
      </div>
    );
  }

  const isCreator = user?.id === session.createdById;
  const isAdminOrSuper = user?.role === 'admin' || user?.role === 'super_admin';
  const canEditDraft = session.status === 'draft' && (isCreator || isAdminOrSuper);
  const canLock = session.status === 'draft' && (isCreator || isAdminOrSuper);
  const canReEnable =
    session.status === 'locked' && !session.canBeEditedAfterLock && (isCreator || isAdminOrSuper);
  const canEditLocked =
    session.status === 'locked' && session.canBeEditedAfterLock && (isCreator || isAdminOrSuper);
  const canDelete = isAdminOrSuper;

  function handleExportWord() {
    const html = sessionToWordHtml(session!, language);
    const slug = session!.meetingNumber.replace(/\//g, '-');
    downloadWordDoc(html, `session-${slug}`);
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/sessions"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4"
      >
        {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        {language === 'ar' ? 'كل الجلسات' : 'All sessions'}
      </Link>

      {/* Meeting number + type badge */}
      <div className="flex items-center gap-3 mb-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 font-mono text-sm font-semibold">
          <Hash className="h-3.5 w-3.5" />
          {session.meetingNumber}
        </div>
        <TypeBadge type={session.meetingType} language={language} />
      </div>

      {/* Title + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">
            {language === 'ar' ? session.titleAr || session.title : session.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1" dir={language === 'ar' ? 'ltr' : 'auto'}>
            {language === 'ar' ? session.title : session.titleAr}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportWord} className="gap-2">
            <Download className="h-4 w-4" />
            {language === 'ar' ? 'تحميل Word' : 'Download .doc'}
          </Button>
          {canEditDraft && (
            <Button size="sm" onClick={() => setModal({ kind: 'edit' })} className="gap-2">
              <Edit3 className="h-4 w-4" />
              {language === 'ar' ? 'تعديل' : 'Edit'}
            </Button>
          )}
          {canLock && (
            <Button
              size="sm"
              onClick={() => setModal({ kind: 'lock' })}
              className="gap-2 bg-slate-900 text-white"
            >
              <Lock className="h-4 w-4" />
              {language === 'ar' ? 'قفل' : 'Lock'}
            </Button>
          )}
          {canReEnable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModal({ kind: 're-enable' })}
              className="gap-2"
            >
              <Unlock className="h-4 w-4" />
              {language === 'ar' ? 'إعادة تفعيل التعديل' : 'Re-enable editing'}
            </Button>
          )}
          {canEditLocked && (
            <Button size="sm" onClick={() => setModal({ kind: 'edit-locked' })} className="gap-2">
              <Edit3 className="h-4 w-4" />
              {language === 'ar' ? 'تعديل المحتوى' : 'Edit content'}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModal({ kind: 'delete' })}
              className="gap-2 text-red-600 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="h-4 w-4" />
              {language === 'ar' ? 'حذف' : 'Delete'}
            </Button>
          )}
        </div>
      </div>

      {/* Parent reference (only for follow-ups) */}
      {session.meetingType === 'followup' && session.parentSessionId && (
        <ParentReference parentId={session.parentSessionId} language={language} />
      )}

      {/* Status + metadata bar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <StatusPill status={session.status} language={language} />
          {session.status === 'locked' && session.canBeEditedAfterLock && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-800 border border-amber-200">
              <AlertTriangle className="h-3 w-3" />
              {language === 'ar' ? 'تم إعادة تفعيل التعديل' : 'Editing re-enabled'}
            </span>
          )}
          <span className="flex items-center gap-1 text-slate-700">
            <Calendar className="h-4 w-4 text-slate-400" />
            {session.meetingDate.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
          </span>
          {(session.meetingLocation || session.meetingLocationAr) && (
            <span className="flex items-center gap-1 text-slate-700">
              <MapPin className="h-4 w-4 text-slate-400" />
              {language === 'ar'
                ? session.meetingLocationAr || session.meetingLocation
                : session.meetingLocation || session.meetingLocationAr}
            </span>
          )}
          {session.lockedAt && (
            <span className="text-xs text-slate-500">
              {language === 'ar' ? 'قُفلت في' : 'Locked'}:{' '}
              {session.lockedAt.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
            </span>
          )}
        </div>
      </div>

      {/* Attendees */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <AttendeeList
          title={language === 'ar' ? 'حضور وزارة الصحة' : 'MoH Attendees'}
          icon={<Building2 className="h-4 w-4" />}
          attendees={session.mohAttendees}
          language={language}
        />
        <AttendeeList
          title={language === 'ar' ? 'الزوار' : 'Visitors'}
          icon={<Users className="h-4 w-4" />}
          attendees={session.visitorAttendees}
          language={language}
          showOrg
        />
      </div>

      {/* Participants */}
      {session.participantIds.length > 0 && (
        <ParticipantsCard ids={session.participantIds} language={language} />
      )}

      {/* Content sections */}
      <ContentBlock
        icon={<FileText className="h-4 w-4" />}
        title={language === 'ar' ? 'محضر الاجتماع' : 'Minutes of Meeting'}
        en={session.momContent}
        ar={session.momContentAr}
        isRTL={isRTL}
      />
      <ContentBlock
        icon={<FileText className="h-4 w-4" />}
        title={language === 'ar' ? 'ملاحظات الاجتماع' : 'Meeting Notes'}
        en={session.meetingNotes}
        ar={session.meetingNotesAr}
        isRTL={isRTL}
      />
      <ContentBlock
        icon={<ClipboardList className="h-4 w-4" />}
        title={language === 'ar' ? 'القرارات' : 'Decisions'}
        en={session.decisions}
        ar={session.decisionsAr}
        isRTL={isRTL}
      />
      <ContentBlock
        icon={<ClipboardList className="h-4 w-4" />}
        title={language === 'ar' ? 'بنود العمل' : 'Action Items'}
        en={session.actionItems}
        ar={session.actionItemsAr}
        isRTL={isRTL}
      />

      {/* Follow-ups list (only for main meetings) */}
      {session.meetingType === 'main' && (
        <FollowupsList parentId={session.id} language={language} />
      )}

      {/* Edit history */}
      <div className="mt-6">
        <EditHistoryPanel sessionId={session.id} />
      </div>

      {/* Modals */}
      {modal.kind === 'edit' && (
        <SessionForm
          mode="edit"
          session={session}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['session', id] });
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: ['session-edit-history', id] });
            queryClient.invalidateQueries({ queryKey: ['followups-of', id] });
            queryClient.invalidateQueries({ queryKey: ['main-sessions-for-picker'] });
            setModal({ kind: 'none' });
          }}
        />
      )}
      {modal.kind === 'lock' && (
        <LockDialog
          session={session}
          onClose={() => setModal({ kind: 'none' })}
          onLocked={() => {
            queryClient.invalidateQueries({ queryKey: ['session', id] });
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: ['session-edit-history', id] });
            setModal({ kind: 'none' });
          }}
        />
      )}
      {modal.kind === 're-enable' && (
        <ReEnableEditDialog
          session={session}
          onClose={() => setModal({ kind: 'none' })}
          onReEnabled={() => {
            queryClient.invalidateQueries({ queryKey: ['session', id] });
            queryClient.invalidateQueries({ queryKey: ['session-edit-history', id] });
            setModal({ kind: 'none' });
          }}
        />
      )}
      {modal.kind === 'edit-locked' && (
        <EditLockedDialog
          session={session}
          onClose={() => setModal({ kind: 'none' })}
          onEdited={() => {
            queryClient.invalidateQueries({ queryKey: ['session', id] });
            queryClient.invalidateQueries({ queryKey: ['session-edit-history', id] });
            setModal({ kind: 'none' });
          }}
        />
      )}
      {modal.kind === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5">
            <h3 className="text-lg font-semibold text-slate-900">
              {language === 'ar' ? 'تأكيد الحذف' : 'Confirm delete'}
            </h3>
            <p className="text-sm text-slate-600 mt-2">
              {language === 'ar'
                ? 'حذف هذه الجلسة؟ يمكن استعادتها لاحقًا بواسطة المسؤول.'
                : 'Delete this session? Soft delete — a super admin can restore later.'}
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModal({ kind: 'none' })}
                disabled={deleteMutation.isPending}
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMutation.isPending
                  ? language === 'ar'
                    ? 'جارٍ الحذف...'
                    : 'Deleting...'
                  : language === 'ar'
                    ? 'حذف'
                    : 'Delete'}
              </Button>
            </div>
            {deleteMutation.isError && (
              <p className="text-xs text-red-600 mt-2">
                {(deleteMutation.error as Error)?.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Type badge + status pill
// =============================================================================

function TypeBadge({ type, language }: { type: MeetingType; language: 'en' | 'ar' }) {
  if (type === 'main') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-50 text-slate-700 border border-slate-200">
        {language === 'ar' ? 'رئيسية' : 'Main meeting'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
      <GitBranch className="h-3 w-3" />
      {language === 'ar' ? 'متابعة' : 'Follow-up'}
    </span>
  );
}

function StatusPill({
  status,
  language,
}: {
  status: Session['status'];
  language: 'en' | 'ar';
}) {
  if (status === 'draft') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-50 text-amber-800">
        <Edit3 className="h-3 w-3" />
        {language === 'ar' ? 'مسودة' : 'Draft'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800">
      <Lock className="h-3 w-3" />
      {language === 'ar' ? 'مقفلة' : 'Locked'}
    </span>
  );
}

// =============================================================================
// Parent reference (follow-up → main)
// =============================================================================

function ParentReference({
  parentId,
  language,
}: {
  parentId: string;
  language: 'en' | 'ar';
}) {
  const { data: parent } = useQuery({
    queryKey: ['parent-session', parentId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('id, title, title_ar, meeting_number')
        .eq('id', parentId)
        .single();
      if (error) return null;
      return data as { id: string; title: string; title_ar: string; meeting_number: string };
    },
  });

  if (!parent) return null;

  return (
    <Link
      href={`/sessions/${parent.id}`}
      className="flex items-center gap-2 mb-4 px-3 py-2 rounded-md border border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-sm"
    >
      <GitBranch className="h-4 w-4 text-blue-600 flex-shrink-0" />
      <span className="text-slate-600">
        {language === 'ar' ? 'متابعة لاجتماع رئيسي:' : 'Follow-up to:'}
      </span>
      <span className="font-mono text-xs text-slate-700">{parent.meeting_number}</span>
      <span className="font-medium text-slate-900 truncate">
        {language === 'ar' ? parent.title_ar || parent.title : parent.title}
      </span>
      <ArrowUpRight className="h-3 w-3 text-blue-600 ms-auto flex-shrink-0" />
    </Link>
  );
}

// =============================================================================
// Followups list (children of a main)
// =============================================================================

function FollowupsList({ parentId, language }: { parentId: string; language: 'en' | 'ar' }) {
  const { data: followups = [], isLoading } = useQuery({
    queryKey: ['followups-of', parentId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('id, title, title_ar, meeting_number, meeting_date, status')
        .eq('parent_session_id', parentId)
        .is('deleted_at', null)
        .order('meeting_date', { ascending: true });
      if (error) return [];
      return (data ?? []) as {
        id: string;
        title: string;
        title_ar: string;
        meeting_number: string;
        meeting_date: string;
        status: string;
      }[];
    },
  });

  if (isLoading) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-900">
        <GitBranch className="h-4 w-4" />
        {language === 'ar' ? 'اجتماعات المتابعة' : 'Follow-up meetings'}
        <span className="text-xs text-slate-500 ms-auto">{followups.length}</span>
      </div>
      {followups.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          {language === 'ar' ? 'لا يوجد اجتماعات متابعة بعد' : 'No follow-ups yet'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {followups.map((f) => (
            <li key={f.id}>
              <Link
                href={`/sessions/${f.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 text-sm"
              >
                <span className="font-mono text-xs text-slate-600">{f.meeting_number}</span>
                <span className="flex-1 truncate text-slate-900">
                  {language === 'ar' ? f.title_ar || f.title : f.title}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(f.meeting_date).toLocaleDateString(
                    language === 'ar' ? 'ar-SA' : 'en-US'
                  )}
                </span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded',
                    f.status === 'draft'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-slate-100 text-slate-800'
                  )}
                >
                  {f.status === 'draft'
                    ? language === 'ar'
                      ? 'مسودة'
                      : 'Draft'
                    : language === 'ar'
                      ? 'مقفلة'
                      : 'Locked'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Attendees / participants / content blocks (unchanged from previous version)
// =============================================================================

function AttendeeList({
  title,
  icon,
  attendees,
  language,
  showOrg,
}: {
  title: string;
  icon: React.ReactNode;
  attendees: Session['mohAttendees'];
  language: 'en' | 'ar';
  showOrg?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-900">
        {icon}
        {title}
        <span className="text-xs text-slate-500 ms-auto">{attendees.length}</span>
      </div>
      {attendees.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          {language === 'ar' ? 'لا يوجد' : 'None'}
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {attendees.map((a) => (
            <li key={a.id} className="border-l-2 border-slate-200 ps-2">
              <div className="font-medium text-slate-900">
                {language === 'ar' ? a.nameAr || a.name : a.name}
              </div>
              <div className="text-xs text-slate-500" dir={language === 'ar' ? 'ltr' : 'auto'}>
                {language === 'ar' ? a.name : a.nameAr}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {language === 'ar' ? a.positionAr || a.position : a.position}
              </div>
              {showOrg && a.organization && (
                <div className="text-xs text-slate-500 italic mt-0.5">
                  {language === 'ar' ? a.organizationAr || a.organization : a.organization}
                </div>
              )}
              {a.email && (
                <div className="text-xs text-blue-600 mt-0.5" dir="ltr">
                  {a.email}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContentBlock({
  icon,
  title,
  en,
  ar,
  isRTL,
}: {
  icon: React.ReactNode;
  title: string;
  en: string;
  ar: string;
  isRTL: boolean;
}) {
  if (!en.trim() && !ar.trim()) return null;
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mb-3">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-900">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {en.trim() && (
          <div dir="ltr" className="whitespace-pre-wrap text-slate-700">
            {en}
          </div>
        )}
        {ar.trim() && (
          <div
            dir="rtl"
            className={cn('whitespace-pre-wrap text-slate-700', isRTL ? 'order-first' : '')}
          >
            {ar}
          </div>
        )}
      </div>
    </div>
  );
}

type ParticipantUserRow = {
  id: string;
  name: string;
  name_ar: string;
  role: string;
  email: string;
};

function ParticipantsCard({ ids, language }: { ids: string[]; language: 'en' | 'ar' }) {
  const { data: users = [], isLoading } = useQuery<ParticipantUserRow[]>({
    queryKey: ['users-for-participants-display', ids],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('users')
        .select('id, name, name_ar, role, email')
        .in('id', ids);
      return (data ?? []) as ParticipantUserRow[];
    },
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-900">
        <Users className="h-4 w-4" />
        {language === 'ar' ? 'المشاركون' : 'Participants'}
        <span className="text-xs text-slate-500 ms-auto">{ids.length}</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        {language === 'ar'
          ? 'مستخدمون مسجلون لديهم صلاحية قراءة هذه الجلسة.'
          : 'Registered users who can view this session.'}
      </p>
      {isLoading ? (
        <p className="text-xs text-slate-500">
          {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
        </p>
      ) : users.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          {language === 'ar' ? 'لا يوجد' : 'None'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-50"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">
                  {language === 'ar' ? u.name_ar || u.name : u.name}
                </div>
                <div className="text-xs text-slate-500 truncate" dir="ltr">
                  {u.email} · {u.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
