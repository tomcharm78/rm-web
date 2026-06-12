'use client';

// SessionsPageClient — list view at /sessions.
//
// Owns: search text, status filter, meeting-type filter, modal state for create.

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Plus,
  Download,
  Search,
  Lock,
  FileEdit,
  Calendar,
  MapPin,
  Filter,
  GitBranch,
  Hash,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listSessions } from '@/lib/sessions/queries';
import { sessionsToCsv, downloadCsv } from '@/lib/sessions/export';
import { SessionForm } from '@/components/sessions/session-form';
import type { Session, SessionStatus, MeetingType } from '@/types/session';
import { cn } from '@/lib/utils';

export function SessionsPageClient() {
  const { user } = useAuth();
  const { language, isRTL } = useLanguage();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SessionStatus | ''>('');
  const [meetingType, setMeetingType] = useState<MeetingType | ''>('');
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = useMemo(
    () => user && ['rm', 'arm', 'admin', 'super_admin'].includes(user.role),
    [user]
  );

  const { data: allSessions = [], isLoading, isError, error } = useQuery({
    queryKey: ['sessions', { search, status }],
    queryFn: () =>
      listSessions({
        search: search.trim() || undefined,
        status: status || undefined,
      }),
  });

  // Meeting-type filter is client-side since `listSessions` doesn't take it.
  // Easy to push to server later if list grows large.
  const sessions = useMemo(() => {
    if (!meetingType) return allSessions;
    return allSessions.filter((s) => s.meetingType === meetingType);
  }, [allSessions, meetingType]);

  function handleExport() {
    const csv = sessionsToCsv(sessions, language);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `sessions-${date}.csv`);
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {language === 'ar' ? 'الجلسات' : 'Sessions'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {sessions.length} {language === 'ar' ? 'سجل' : 'records'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={sessions.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'جلسة جديدة' : 'New Session'}
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none',
              isRTL ? 'right-3' : 'left-3'
            )}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              language === 'ar' ? 'بحث في العنوان أو الرقم...' : 'Search title or number...'
            }
            className={isRTL ? 'pr-10' : 'pl-10'}
          />
        </div>
        <div className="relative">
          <Filter
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none',
              isRTL ? 'right-3' : 'left-3'
            )}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SessionStatus | '')}
            className={cn(
              'h-9 rounded-md border border-slate-200 bg-white text-sm w-full sm:w-44',
              'focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1',
              isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
            )}
          >
            <option value="">{language === 'ar' ? 'كل الحالات' : 'All statuses'}</option>
            <option value="draft">{language === 'ar' ? 'مسودة' : 'Draft'}</option>
            <option value="locked">{language === 'ar' ? 'مقفلة' : 'Locked'}</option>
          </select>
        </div>
        <div className="relative">
          <GitBranch
            className={cn(
              'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none',
              isRTL ? 'right-3' : 'left-3'
            )}
          />
          <select
            value={meetingType}
            onChange={(e) => setMeetingType(e.target.value as MeetingType | '')}
            className={cn(
              'h-9 rounded-md border border-slate-200 bg-white text-sm w-full sm:w-44',
              'focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1',
              isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
            )}
          >
            <option value="">{language === 'ar' ? 'كل الأنواع' : 'All types'}</option>
            <option value="main">{language === 'ar' ? 'رئيسية' : 'Main'}</option>
            <option value="followup">{language === 'ar' ? 'متابعة' : 'Follow-up'}</option>
          </select>
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500">
          {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-6 text-sm text-red-800">
          {language === 'ar' ? 'حدث خطأ' : 'Error'}: {(error as Error)?.message}
        </div>
      )}

      {!isLoading && !isError && sessions.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">
            {language === 'ar' ? 'لا توجد جلسات' : 'No sessions yet'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {search || status || meetingType
              ? language === 'ar'
                ? 'لا توجد نتائج تطابق البحث'
                : 'No results match your filters'
              : language === 'ar'
                ? 'انقر "جلسة جديدة" للبدء'
                : 'Click "New Session" to get started'}
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && sessions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className={cn('text-slate-600', isRTL ? 'text-right' : 'text-left')}>
                  <th className="px-4 py-3 font-medium">
                    {language === 'ar' ? 'الرقم' : 'Number'}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {language === 'ar' ? 'العنوان' : 'Title'}
                  </th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">
                    {language === 'ar' ? 'النوع' : 'Type'}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {language === 'ar' ? 'الحالة' : 'Status'}
                  </th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">
                    {language === 'ar' ? 'تاريخ الاجتماع' : 'Meeting Date'}
                  </th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">
                    {language === 'ar' ? 'الموقع' : 'Location'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <SessionRow key={s.id} session={s} language={language} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <SessionForm
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: ['main-sessions-for-picker'] });
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function SessionRow({ session, language }: { session: Session; language: 'en' | 'ar' }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-1 font-mono text-xs text-slate-700">
          <Hash className="h-3 w-3 text-slate-400" />
          {session.meetingNumber}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <Link
          href={`/sessions/${session.id}`}
          className="font-medium text-slate-900 hover:underline"
        >
          {language === 'ar' ? session.titleAr || session.title : session.title}
        </Link>
        <div className="text-xs text-slate-500 mt-0.5" dir={language === 'ar' ? 'ltr' : 'auto'}>
          {language === 'ar' ? session.title : session.titleAr}
        </div>
      </td>
      <td className="px-4 py-3 align-top hidden sm:table-cell">
        <TypeBadge type={session.meetingType} language={language} />
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge status={session.status} language={language} />
        {session.status === 'locked' && session.canBeEditedAfterLock && (
          <div className="mt-1">
            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              {language === 'ar' ? 'تم إعادة تفعيل التعديل' : 'Edit re-enabled'}
            </span>
          </div>
        )}
      </td>
      <td className="px-4 py-3 align-top hidden md:table-cell">
        <div className="flex items-center gap-1 text-slate-700">
          <Calendar className="h-3 w-3 text-slate-400" />
          {session.meetingDate.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
        </div>
      </td>
      <td className="px-4 py-3 align-top hidden lg:table-cell">
        {(session.meetingLocation || session.meetingLocationAr) && (
          <div className="flex items-center gap-1 text-slate-700">
            <MapPin className="h-3 w-3 text-slate-400" />
            <span className="truncate">
              {language === 'ar'
                ? session.meetingLocationAr || session.meetingLocation
                : session.meetingLocation || session.meetingLocationAr}
            </span>
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status, language }: { status: SessionStatus; language: 'en' | 'ar' }) {
  if (status === 'draft') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-800">
        <FileEdit className="h-3 w-3" />
        {language === 'ar' ? 'مسودة' : 'Draft'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800">
      <Lock className="h-3 w-3" />
      {language === 'ar' ? 'مقفلة' : 'Locked'}
    </span>
  );
}

function TypeBadge({ type, language }: { type: MeetingType; language: 'en' | 'ar' }) {
  if (type === 'main') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-50 text-slate-700 border border-slate-200">
        {language === 'ar' ? 'رئيسية' : 'Main'}
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
