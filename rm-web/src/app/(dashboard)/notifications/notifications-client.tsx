'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { cn } from '@/lib/utils';
import {
  listNotifications,
  markRead,
  markAllRead,
} from '@/lib/notifications/queries';
import type { Notification } from '@/types/notification';

function formatWhen(iso: string, ar: boolean): string {
  return new Date(iso).toLocaleString(ar ? 'ar' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const dotColor: Record<Notification['severity'], string> = {
  info: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

export function NotificationsClient() {
  const { language, isRTL } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ['notifications-page'],
    queryFn: () => listNotifications(100),
  });

  const items = listQ.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications-page'] });
    qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    qc.invalidateQueries({ queryKey: ['notifications-list'] });
  };

  const onItemClick = async (n: Notification) => {
    if (!n.read) {
      await markRead(n.id);
      refresh();
    }
    if (n.entityType === 'task' && n.entityId) {
      router.push(`/tasks/${n.entityId}`);
    }
  };

  const onMarkAll = async () => {
    await markAllRead();
    refresh();
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-indigo-600" />
          <h1 className="text-xl font-semibold">
            {ar ? 'الإشعارات' : 'Notifications'}
          </h1>
          {unread > 0 && (
            <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={onMarkAll}
            className="text-sm text-indigo-600 hover:underline inline-flex items-center gap-1"
          >
            <CheckCheck className="h-4 w-4" />
            {ar ? 'تعليم الكل كمقروء' : 'Mark all read'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {listQ.isPending && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            {ar ? 'جارٍ التحميل…' : 'Loading…'}
          </div>
        )}
        {!listQ.isPending && items.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            {ar ? 'لا توجد إشعارات' : 'No notifications yet'}
          </div>
        )}
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onItemClick(n)}
            className={cn(
              'w-full text-start px-4 py-3 hover:bg-slate-50 flex gap-3',
              !n.read && 'bg-indigo-50/40'
            )}
          >
            <span
              className={cn(
                'mt-1.5 h-2.5 w-2.5 rounded-full shrink-0',
                n.read ? 'bg-slate-200' : dotColor[n.severity]
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800 truncate">
                  {ar ? n.titleAr || n.title : n.title}
                </span>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {formatWhen(n.createdAt, ar)}
                </span>
              </span>
              <span className="block text-sm text-slate-600 mt-0.5">
                {ar ? n.messageAr || n.message : n.message}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}