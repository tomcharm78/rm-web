'use client';

// EditHistoryPanel — shows the audit trail of edits + lock state changes
// from session_edit_history table. Renders chronologically (newest first).
//
// Each entry shows: who edited, when, change description (EN or AR based on
// active language), and optionally an expandable diff if previous/new content
// snapshots exist.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/providers/language-provider';
import { getSessionEditHistory } from '@/lib/sessions/queries';
import type { SessionEditHistory } from '@/types/session';

type UserInfo = { id: string; name: string; name_ar: string };

export function EditHistoryPanel({ sessionId }: { sessionId: string }) {
  const { language, isRTL } = useLanguage();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['session-edit-history', sessionId],
    queryFn: () => getSessionEditHistory(sessionId),
  });

  // Resolve editor names for the rows
  const editorIds = Array.from(new Set(history.map((h) => h.editedById)));
  const { data: editors = [] } = useQuery({
    queryKey: ['users-for-history', editorIds],
    enabled: editorIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('users')
        .select('id, name, name_ar')
        .in('id', editorIds);
      return (data ?? []) as UserInfo[];
    },
  });

  const editorMap = new Map(editors.map((e) => [e.id, e]));

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <History className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">
          {language === 'ar' ? 'سجل التعديلات' : 'Edit History'}
        </h3>
        <span className="text-xs text-slate-500 ms-auto">
          {history.length}{' '}
          {language === 'ar' ? 'إدخال' : history.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {isLoading ? (
          <div className="px-4 py-4 text-sm text-slate-500">
            {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
          </div>
        ) : history.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500 text-center">
            {language === 'ar' ? 'لا يوجد سجل تعديلات بعد' : 'No edit history yet'}
          </div>
        ) : (
          history.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              editor={editorMap.get(entry.editedById)}
              language={language}
              isRTL={isRTL}
            />
          ))
        )}
      </div>
    </div>
  );
}

function HistoryRow({
  entry,
  editor,
  language,
  isRTL,
}: {
  entry: SessionEditHistory;
  editor?: UserInfo;
  language: 'en' | 'ar';
  isRTL: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = !!(entry.previousContent || entry.newContent);

  const description = language === 'ar' ? entry.changeDescriptionAr : entry.changeDescription;
  const editorName = editor
    ? (language === 'ar' ? editor.name_ar || editor.name : editor.name)
    : language === 'ar' ? 'مستخدم محذوف' : 'Unknown user';

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-900">{description}</p>
          <p className="text-xs text-slate-500 mt-1">
            <span className="font-medium">{editorName}</span>
            {' · '}
            {entry.editedAt.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
          </p>
        </div>
        {hasDiff && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 flex-shrink-0"
          >
            {expanded
              ? language === 'ar' ? 'إخفاء التفاصيل' : 'Hide details'
              : language === 'ar' ? 'إظهار التفاصيل' : 'Show details'}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {expanded && hasDiff && (
        <div className="mt-2 space-y-2 pt-2 border-t border-slate-100">
          {entry.previousContent && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-red-600 mb-1">
                {language === 'ar' ? 'قبل' : 'Before'}
              </p>
              <pre className="text-xs bg-red-50 border border-red-100 rounded p-2 overflow-x-auto whitespace-pre-wrap" dir={isRTL ? 'rtl' : 'ltr'}>
                {prettyJson(entry.previousContent)}
              </pre>
            </div>
          )}
          {entry.newContent && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-green-600 mb-1">
                {language === 'ar' ? 'بعد' : 'After'}
              </p>
              <pre className="text-xs bg-green-50 border border-green-100 rounded p-2 overflow-x-auto whitespace-pre-wrap" dir={isRTL ? 'rtl' : 'ltr'}>
                {prettyJson(entry.newContent)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// previous_content / new_content are stored as JSON strings (per the queries
// layer). Pretty-print for display; fallback to raw if not valid JSON.
function prettyJson(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, 2);
  } catch {
    return raw;
  }
}
