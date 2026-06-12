'use client';

// AiTaskTriage — card on session detail page showing AI-suggested tasks.
//
// Shows three sub-lists:
//   - Pending: awaiting decision. Each has [Assign] [Discard] buttons.
//   - Assigned: already turned into real tasks. Read-only history.
//   - Discarded: rejected. Read-only history.
//
// Default view collapses Assigned + Discarded to keep the noise down.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  UserCheck,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/providers/language-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { aiTaskToRow, type Session, type PendingAiTask } from '@/types/session';
import { AssignTaskDialog } from './assign-task-dialog';

type Props = {
  session: Session;
};

export function AiTaskTriage({ session }: Props) {
  const { language, isRTL } = useLanguage();
  const queryClient = useQueryClient();

  const [showAssigned, setShowAssigned] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [assignTarget, setAssignTarget] = useState<PendingAiTask | null>(null);

  const pending = session.pendingAiTasks.filter((t) => t.status === 'pending');
  const assigned = session.pendingAiTasks.filter((t) => t.status === 'assigned');
  const discarded = session.pendingAiTasks.filter((t) => t.status === 'discarded');

  const discard = useMutation({
    mutationFn: async (taskId: string) => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('not_authenticated');

      const updated = session.pendingAiTasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'discarded' as const,
              resolvedAt: new Date(),
              resolvedById: authUser.id,
            }
          : t
      );

      const { error } = await supabase
        .from('sessions')
        .update({ pending_ai_tasks: updated.map(aiTaskToRow) })
        .eq('id', session.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', session.id] });
    },
  });

  if (session.pendingAiTasks.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-indigo-200 overflow-hidden mb-4">
      <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50/60 border-b border-indigo-100">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-indigo-900">
          {language === 'ar' ? 'مهام الذكاء الاصطناعي المعلقة' : 'AI Task Suggestions'}
        </h3>
        <div className="ms-auto flex items-center gap-2 text-xs">
          {pending.length > 0 && (
            <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">
              {pending.length} {language === 'ar' ? 'بانتظار القرار' : 'pending'}
            </span>
          )}
          {assigned.length > 0 && (
            <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
              {assigned.length} {language === 'ar' ? 'مُعيَّنة' : 'assigned'}
            </span>
          )}
          {discarded.length > 0 && (
            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
              {discarded.length} {language === 'ar' ? 'مرفوضة' : 'discarded'}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Pending list */}
        {pending.length > 0 ? (
          <ul className="space-y-2">
            {pending.map((t) => (
              <PendingItem
                key={t.id}
                task={t}
                language={language}
                isRTL={isRTL}
                onAssignClick={() => setAssignTarget(t)}
                onDiscardClick={() => discard.mutate(t.id)}
                discarding={discard.isPending}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 italic px-1">
            {language === 'ar'
              ? 'لا توجد مهام معلقة. كل المقترحات تم البت فيها.'
              : 'No pending suggestions. All have been triaged.'}
          </p>
        )}

        {/* Assigned (collapsible) */}
        {assigned.length > 0 && (
          <CollapsibleList
            title={language === 'ar' ? `المُعيَّنة (${assigned.length})` : `Assigned (${assigned.length})`}
            icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
            open={showAssigned}
            onToggle={() => setShowAssigned((s) => !s)}
          >
            {assigned.map((t) => (
              <ResolvedItem key={t.id} task={t} kind="assigned" language={language} />
            ))}
          </CollapsibleList>
        )}

        {/* Discarded (collapsible) */}
        {discarded.length > 0 && (
          <CollapsibleList
            title={language === 'ar' ? `المرفوضة (${discarded.length})` : `Discarded (${discarded.length})`}
            icon={<XCircle className="h-3.5 w-3.5 text-slate-500" />}
            open={showDiscarded}
            onToggle={() => setShowDiscarded((s) => !s)}
          >
            {discarded.map((t) => (
              <ResolvedItem key={t.id} task={t} kind="discarded" language={language} />
            ))}
          </CollapsibleList>
        )}

        {discard.isError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
            {(discard.error as Error)?.message}
          </div>
        )}
      </div>

      {assignTarget && (
        <AssignTaskDialog
          session={session}
          task={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            queryClient.invalidateQueries({ queryKey: ['session', session.id] });
            queryClient.invalidateQueries({ queryKey: ['session-edit-history', session.id] });
            setAssignTarget(null);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Subcomponents
// =============================================================================

function PendingItem({
  task,
  language,
  isRTL,
  onAssignClick,
  onDiscardClick,
  discarding,
}: {
  task: PendingAiTask;
  language: 'en' | 'ar';
  isRTL: boolean;
  onAssignClick: () => void;
  onDiscardClick: () => void;
  discarding: boolean;
}) {
  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-slate-900">
              {language === 'ar' ? task.titleAr || task.title : task.title}
            </p>
            <PriorityPill priority={task.priority} language={language} />
            {task.suggestedDueDate && (
              <span className="text-xs text-slate-500">
                {language === 'ar' ? 'الاستحقاق:' : 'Due:'} {task.suggestedDueDate}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5" dir={language === 'ar' ? 'ltr' : 'auto'}>
            {language === 'ar' ? task.title : task.titleAr}
          </p>
          {(task.description || task.descriptionAr) && (
            <p className="text-xs text-slate-600 mt-1.5">
              {language === 'ar' ? task.descriptionAr || task.description : task.description}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            onClick={onAssignClick}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 h-7 px-2 text-xs"
          >
            <UserCheck className="h-3 w-3" />
            {language === 'ar' ? 'تعيين' : 'Assign'}
          </Button>
          <button
            type="button"
            onClick={onDiscardClick}
            disabled={discarding}
            className="inline-flex items-center justify-center gap-1.5 text-xs text-red-600 hover:text-red-700 px-2 h-7 rounded hover:bg-red-50 disabled:opacity-50"
          >
            {discarding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {language === 'ar' ? 'رفض' : 'Discard'}
          </button>
        </div>
      </div>
    </li>
  );
}

function ResolvedItem({
  task,
  kind,
  language,
}: {
  task: PendingAiTask;
  kind: 'assigned' | 'discarded';
  language: 'en' | 'ar';
}) {
  return (
    <li className="rounded border border-slate-200 bg-slate-50/60 p-2 text-sm">
      <div className="flex items-start gap-2">
        {kind === 'assigned' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-slate-700 line-through-when-discarded">
            {language === 'ar' ? task.titleAr || task.title : task.title}
          </p>
          {task.resolvedAt && (
            <p className="text-xs text-slate-500 mt-0.5">
              {task.resolvedAt.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
            </p>
          )}
        </div>
        <PriorityPill priority={task.priority} language={language} />
      </div>
    </li>
  );
}

function CollapsibleList({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-xs font-medium text-slate-700"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && <ul className="px-3 pb-3 space-y-1.5">{children}</ul>}
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
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap',
        colors[priority]
      )}
    >
      {labels[priority][language]}
    </span>
  );
}
