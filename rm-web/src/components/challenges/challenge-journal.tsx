'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, MessageSquare, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { listUserNames } from '@/lib/tasks/queries';
import { getMyOrgContext } from '@/lib/org/queries';
import { getChallenge } from '@/lib/challenges/queries';
import { CollapsibleCard } from '@/components/challenges/collapsible-card';
import {
  listChallengeJournal, createChallengeJournalEntry, editChallengeJournalEntry,
  type ChallengeJournalEntry,
} from '@/lib/challenges/journal';

const HOUR = 60 * 60 * 1000;
const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function fmt(ts: string, ar: boolean) {
  try { return new Date(ts).toLocaleString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return ts; }
}

export function ChallengeJournal({ challengeId }: { challengeId: string }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();

  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const journalQ = useQuery({ queryKey: ['challenge-journal', challengeId], queryFn: () => listChallengeJournal(challengeId) });
  const namesQ = useQuery({ queryKey: ['user-names'], queryFn: listUserNames });
  const orgQ = useQuery({ queryKey: ['my-org-context'], queryFn: getMyOrgContext });
  const challengeQ = useQuery({ queryKey: ['challenge', challengeId], queryFn: () => getChallenge(challengeId) });

  const entries = journalQ.data ?? [];
  const names = namesQ.data ?? [];
  const org = orgQ.data;
  const c = challengeQ.data;

  const refresh = () => qc.invalidateQueries({ queryKey: ['challenge-journal', challengeId] });

  const postMut = useMutation({
    mutationFn: () => {
      const isStakeholderAuthor = user!.role === 'stakeholder';
      const meRow = isStakeholderAuthor ? undefined : names.find((n) => n.id === user!.id);
      const nameEn = isStakeholderAuthor ? (user!.name || '') : (meRow?.name || user!.name || '');
      const nameAr = isStakeholderAuthor ? (user!.name || '') : (meRow?.nameAr || user!.name || '');
      const deptEn = isStakeholderAuthor ? (ar ? 'طرف معني خارجي' : 'External stakeholder') : (org?.departmentName ?? org?.orgName ?? '');
      const deptAr = isStakeholderAuthor ? 'طرف معني خارجي' : (org?.departmentNameAr ?? org?.orgNameAr ?? '');
      return createChallengeJournalEntry({
        challengeId, body: draft,
        authorName: nameEn, authorNameAr: nameAr,
        authorDepartment: deptEn, authorDepartmentAr: deptAr,
      });
    },
    onSuccess: () => { setDraft(''); refresh(); },
  });

  const editMut = useMutation({
    mutationFn: () => editChallengeJournalEntry(editingId!, editBody),
    onSuccess: () => { setEditingId(null); setEditBody(''); refresh(); },
  });

  if (!user) return null;

  // Mirrors migration 0035: creator / owner / same-org non-HM super. Stakeholder branch = slice 5.
  const isOversightSuper = user.role === 'super_admin' && !user.isHigherManagement;
  const isStakeholder = user.role === 'stakeholder';
  const canPost = !!c && (
    c.createdById === user.id ||
    c.assignedToId === user.id ||
    isOversightSuper ||
    isStakeholder
  );

  const startEdit = (e: ChallengeJournalEntry) => { setEditingId(e.id); setEditBody(e.body); };

  return (
    <CollapsibleCard
      title={ar ? 'سجل المتابعة' : 'Journal'}
      icon={<MessageSquare className="h-4 w-4 text-slate-500" />}
      count={entries.length}
      defaultOpen
    >
      {journalQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {!journalQ.isLoading && entries.length === 0 && (
        <p className="text-sm text-slate-400 mb-3">{ar ? 'لا توجد متابعات بعد.' : 'No entries yet.'}</p>
      )}

      <ol className="space-y-3 mb-4">
        {entries.map((e) => {
          const mine = e.authorId === user.id;
          const ageMs = now - new Date(e.createdAt).getTime();
          const editable = mine && canPost && e.editedAt === null && ageMs < HOUR;
          const remainingMin = Math.max(0, Math.ceil((HOUR - ageMs) / 60000));
          const authorName = ar ? e.authorNameAr || e.authorName : e.authorName;
          const authorDept = ar ? e.authorDepartmentAr || e.authorDepartment : e.authorDepartment;

          return (
            <li key={e.id} className="rounded-md border border-slate-100 bg-slate-50/60 p-3">
              {editingId === e.id ? (
                <>
                  <textarea value={editBody} onChange={(ev) => setEditBody(ev.target.value)} rows={3} className={IN} dir={ar ? 'rtl' : 'ltr'} />
                  {editMut.isError && <p className="text-xs text-red-600 mt-1">{(editMut.error as Error).message}</p>}
                  <div className="flex gap-2 mt-2">
                    <Button onClick={() => editMut.mutate()} disabled={!editBody.trim() || editMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                      {editMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => { setEditingId(null); setEditBody(''); }}>{ar ? 'إلغاء' : 'Cancel'}</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.body}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-slate-400">
                      <span className="text-slate-600">{authorName}</span>
                      {authorDept ? ' · ' + authorDept : ''} · {fmt(e.createdAt, ar)}
                      {e.editedAt && <span className="italic"> · {ar ? 'مُعدَّل' : 'edited'}</span>}
                    </p>
                    {editable && (
                      <button onClick={() => startEdit(e)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                        <Pencil className="h-3 w-3" />{ar ? `تعديل (${remainingMin} د)` : `Edit (${remainingMin}m)`}
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>

      {canPost ? (
        <div className="border-t border-slate-100 pt-3">
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
            dir={ar ? 'rtl' : 'ltr'}
            placeholder={ar ? 'أضف متابعة…' : 'Add a follow-up…'}
            className={IN}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-400">{ar ? 'يمكن تعديل المتابعة مرة واحدة خلال ساعة من نشرها.' : 'A comment can be edited once, within an hour of posting.'}</p>
            <Button onClick={() => postMut.mutate()} disabled={!draft.trim() || postMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              {postMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ar ? 'نشر' : 'Post'}
            </Button>
          </div>
          {postMut.isError && <p className="text-xs text-red-600 mt-1">{(postMut.error as Error).message}</p>}
        </div>
      ) : (
        <div className="border-t border-slate-100 pt-3 flex items-center gap-2 text-xs text-slate-400">
          <Lock className="h-3 w-3" />
          {ar ? 'التعليق متاح لمنشئ التحدي والمسؤول المعيَّن والإشراف بالوكالة فقط.' : 'Only the challenge creator, assigned owner, and deputyship oversight can comment.'}
        </div>
      )}
    </CollapsibleCard>
  );
}
