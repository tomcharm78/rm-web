'use client';
// Dashboard to-do pop-up — everything still open and on your plate, in one list.
//
// Opened by a button rather than appearing on its own: a panel that greets you
// every visit gets dismissed reflexively, and then it is furniture instead of
// information. The button carries the count, so the number is visible without
// anything being forced open.
//
// Amber, to sit apart from the indigo and slate of the rest of the dashboard —
// this is a prompt to act, not another statistic.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { X, ListTodo, CalendarClock, Flag, Loader2 } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { listMyOpenWork, type TodoItem } from '@/lib/dashboard/todo-queries';

const AMBER_BORDER = '#fcd34d';
const AMBER_BG = '#fffbeb';
const AMBER_TEXT = '#78350f';
const AMBER_MUTED = '#a16207';

export function TodoPopup() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [open, setOpen] = useState(false);

  const q = useQuery({ queryKey: ['my-open-work'], queryFn: listMyOpenWork });
  const tasks = q.data?.tasks ?? [];
  const challenges = q.data?.challenges ?? [];
  const total = tasks.length + challenges.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 14px',
          borderRadius: 8,
          border: `1px solid ${AMBER_BORDER}`,
          background: AMBER_BG,
          color: AMBER_TEXT,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        <ListTodo style={{ height: 16, width: 16 }} aria-hidden="true" />
        {ar ? 'قائمة أعمالي' : 'My to-do list'}
        {total > 0 && (
          <span
            style={{
              minWidth: 20,
              padding: '1px 6px',
              borderRadius: 999,
              background: '#f59e0b',
              color: '#fff',
              fontSize: 12,
            }}
          >
            {total}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15, 23, 42, 0.35)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '5vh 16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            dir={ar ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%',
              maxWidth: 720,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              background: AMBER_BG,
              border: `1px solid ${AMBER_BORDER}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: `1px solid ${AMBER_BORDER}`,
              }}
            >
              <span style={{ fontWeight: 500, color: AMBER_TEXT, fontSize: 15 }}>
                {ar ? 'قائمة أعمالي' : 'My to-do list'}
                <span style={{ color: AMBER_MUTED, fontWeight: 400, fontSize: 13 }}>
                  {total > 0 ? ` · ${total}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={ar ? 'إغلاق' : 'Close'}
                style={{
                  height: 28,
                  width: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  color: AMBER_MUTED,
                  cursor: 'pointer',
                }}
              >
                <X style={{ height: 16, width: 16 }} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '12px 16px 16px' }}>
              {q.isLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                  <Loader2
                    style={{ height: 20, width: 20, color: AMBER_MUTED }}
                    className="animate-spin"
                  />
                </div>
              )}

              {!q.isLoading && total === 0 && (
                <p style={{ color: AMBER_MUTED, fontSize: 14, padding: '20px 0', textAlign: 'center' }}>
                  {ar ? 'لا توجد أعمال مفتوحة.' : 'Nothing open right now.'}
                </p>
              )}

              {tasks.length > 0 && (
                <Section
                  label={ar ? 'المهام' : 'Tasks'}
                  count={tasks.length}
                  items={tasks}
                  ar={ar}
                  onNavigate={() => setOpen(false)}
                />
              )}

              {challenges.length > 0 && (
                <Section
                  label={ar ? 'التحديات' : 'Challenges'}
                  count={challenges.length}
                  items={challenges}
                  ar={ar}
                  onNavigate={() => setOpen(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  label,
  count,
  items,
  ar,
  onNavigate,
}: {
  label: string;
  count: number;
  items: TodoItem[];
  ar: boolean;
  onNavigate: () => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: AMBER_MUTED, marginBottom: 6 }}>
        {label} · {count}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              onClick={onNavigate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 8,
                background: '#fff',
                border: `1px solid ${AMBER_BORDER}`,
                marginBottom: 6,
                textDecoration: 'none',
                color: AMBER_TEXT,
                fontSize: 14,
              }}
            >
              {it.kind === 'task' ? (
                <CalendarClock style={{ height: 15, width: 15, flexShrink: 0, color: AMBER_MUTED }} aria-hidden="true" />
              ) : (
                <Flag style={{ height: 15, width: 15, flexShrink: 0, color: AMBER_MUTED }} aria-hidden="true" />
              )}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ar ? it.titleAr || it.title : it.title || it.titleAr}
              </span>
              {it.dueDate && (
                <DueDate iso={it.dueDate} ar={ar} />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Overdue is worth calling out — it is the one thing on this list that changes
// what you do next.
function DueDate({ iso, ar }: { iso: string; ar: boolean }) {
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = due < today;
  return (
    <span
      style={{
        fontSize: 12,
        flexShrink: 0,
        color: overdue ? '#b91c1c' : AMBER_MUTED,
      }}
    >
      {due.toLocaleDateString(ar ? 'ar' : 'en-GB', { day: 'numeric', month: 'short' })}
      {overdue ? (ar ? ' · متأخرة' : ' · overdue') : ''}
    </span>
  );
}
