'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { cn } from '@/lib/utils';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from '@/lib/notifications/queries';
import type { Notification } from '@/types/notification';

function timeAgo(iso: string, ar: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return ar ? 'الآن' : 'now';
  if (m < 60) return ar ? `${m} د` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return ar ? `${h} س` : `${h}h`;
  const d = Math.floor(h / 24);
  return ar ? `${d} ي` : `${d}d`;
}

const dotColor: Record<Notification['severity'], string> = {
  info: 'bg-indigo-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

export function NotificationBell() {
  const { language, isRTL } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const countQ = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: unreadCount,
    refetchInterval: 45000,
    refetchOnWindowFocus: true,
  });

  const listQ = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => listNotifications(20),
    enabled: open,
  });

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const count = countQ.data ?? 0;
  const items = listQ.data ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    qc.invalidateQueries({ queryKey: ['notifications-list'] });
  };

  const onItemClick = async (n: Notification) => {
    if (!n.read) {
      await markRead(n.id);
      refresh();
    }
    setOpen(false);
    if (n.entityType === 'task' && n.entityId) {
      router.push(`/tasks/${n.entityId}`);
    } else if (n.entityType === 'vacation') {
      router.push('/vacations');
    }
  };

  const onMarkAll = async () => {
    await markAllRead();
    refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
        aria-label={ar ? 'الإشعارات' : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold inline-flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl',
            isRTL ? 'left-0' : 'right-0'
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold">
              {ar ? 'الإشعارات' : 'Notifications'}
            </span>
            {count > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {ar ? 'تعليم الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listQ.isPending && (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                {ar ? 'جارٍ التحميل…' : 'Loading…'}
              </div>
            )}
            {!listQ.isPending && items.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                {ar ? 'لا توجد إشعارات' : 'No notifications'}
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onItemClick(n)}
                className={cn(
                  'w-full text-start px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 flex gap-2',
                  !n.read && 'bg-indigo-50/40'
                )}
              >
                <span className={cn('mt-1 h-2 w-2 rounded-full shrink-0', n.read ? 'bg-transparent' : dotColor[n.severity])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 truncate">
                    {ar ? n.titleAr || n.title : n.title}
                  </span>
                  <span className="block text-xs text-slate-500 line-clamp-2">
                    {ar ? n.messageAr || n.message : n.message}
                  </span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {timeAgo(n.createdAt, ar)}
                  </span>
                </span>
                {!n.read && <Check className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-1" />}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push('/notifications');
            }}
            className="w-full px-3 py-2 text-xs text-indigo-600 hover:bg-slate-50 border-t border-slate-100"
          >
            {ar ? 'عرض الكل' : 'See all'}
          </button>
        </div>
      )}
    </div>
  );
}