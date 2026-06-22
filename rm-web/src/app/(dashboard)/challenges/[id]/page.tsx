'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, History, UserCog, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { listUserNames } from '@/lib/tasks/queries';
import {
  getChallenge, changeChallengeStatus, updateChallenge,
  listChallengeStatusHistory, listChallengeDomains,
} from '@/lib/challenges/queries';
import { CollapsibleCard } from '@/components/challenges/collapsible-card';
import { ChallengeStakeholders } from '@/components/challenges/challenge-stakeholders';
import { ChallengeJournal } from '@/components/challenges/challenge-journal';
import type { ChallengeStatus } from '@/types/challenge';

const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-500 mb-1 block';

const STATUS_OPTS: ChallengeStatus[] = ['open', 'investigating', 'mitigation_in_progress', 'resolved', 'closed'];

function statusLabel(s: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    open: ['Open', 'مفتوح'], investigating: ['Investigating', 'قيد الدراسة'],
    mitigation_in_progress: ['Mitigation', 'قيد المعالجة'], resolved: ['Resolved', 'تم الحل'], closed: ['Closed', 'مغلق'],
  };
  return m[s] ? (ar ? m[s][1] : m[s][0]) : s;
}
function typeLabel(t: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    financial: ['Financial', 'مالي'], technical: ['Technical', 'تقني'], operational: ['Operational', 'تشغيلي'],
    insurance: ['Insurance', 'تأمين'], regulatory: ['Regulatory', 'تنظيمي'], hr_training: ['HR & Training', 'موارد وتدريب'], others: ['Others', 'أخرى'],
  };
  return m[t] ? (ar ? m[t][1] : m[t][0]) : t;
}
function priorityLabel(p: string, ar: boolean) {
  const m: Record<string, [string, string]> = {
    low: ['Low', 'منخفض'], medium: ['Medium', 'متوسط'], high: ['High', 'مرتفع'], critical: ['Critical', 'حرج'],
  };
  return m[p] ? (ar ? m[p][1] : m[p][0]) : p;
}
function statusColor(s: string) {
  switch (s) {
    case 'investigating': return 'bg-blue-100 text-blue-700';
    case 'mitigation_in_progress': return 'bg-amber-100 text-amber-700';
    case 'resolved': return 'bg-green-100 text-green-700';
    case 'closed': return 'bg-slate-200 text-slate-600';
    default: return 'bg-slate-100 text-slate-700';
  }
}
function fmt(ts: string, ar: boolean) {
  try { return new Date(ts).toLocaleString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return ts; }
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();
  const qc = useQueryClient();

  const challengeQ = useQuery({ queryKey: ['challenge', id], queryFn: () => getChallenge(id) });
  const historyQ = useQuery({ queryKey: ['challenge-history', id], queryFn: () => listChallengeStatusHistory(id) });
  const namesQ = useQuery({ queryKey: ['user-names'], queryFn: listUserNames });
  const domainsQ = useQuery({ queryKey: ['challenge-domains'], queryFn: listChallengeDomains });

  const [newStatus, setNewStatus] = useState<ChallengeStatus | ''>('');
  const [statusReason, setStatusReason] = useState('');
  const [completionDraft, setCompletionDraft] = useState<number | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState<string | null>(null);

  const c = challengeQ.data;
  const names = namesQ.data ?? [];
  const domains = domainsQ.data ?? [];

  const nameOf = (uid?: string | null) => {
    if (!uid) return ar ? 'غير مُعيَّن' : 'Unassigned';
    const u = names.find((n) => n.id === uid);
    return u ? (ar ? u.nameAr || u.name : u.name) : '—';
  };
  const domainOf = (did?: string | null) => {
    if (!did) return '—';
    const d = domains.find((x) => x.id === did);
    return d ? (ar ? d.nameAr || d.name : d.name) : '—';
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['challenge', id] });
    qc.invalidateQueries({ queryKey: ['challenge-history', id] });
    qc.invalidateQueries({ queryKey: ['challenges'] });
  };

  const statusMut = useMutation({
    mutationFn: () => changeChallengeStatus(id, newStatus as ChallengeStatus, statusReason.trim()),
    onSuccess: () => { setNewStatus(''); setStatusReason(''); refresh(); },
  });
  const completionMut = useMutation({
    mutationFn: (pct: number) => updateChallenge(id, { completionPercentage: pct }),
    onSuccess: () => { setCompletionDraft(null); refresh(); },
  });
  const resolutionMut = useMutation({
    mutationFn: (note: string) => updateChallenge(id, { resolutionNote: note }),
    onSuccess: () => { setResolutionDraft(null); refresh(); },
  });
  const assignMut = useMutation({
    mutationFn: (uid: string | null) => updateChallenge(id, { assignedToId: uid }),
    onSuccess: refresh,
  });

  if (!user) return null;
  if (challengeQ.isLoading) return <div className="p-8 text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;
  if (!c) return <div className="p-8 text-slate-400">{ar ? 'التحدي غير موجود' : 'Challenge not found'}</div>;

  const isManager = user.role === 'admin' || user.role === 'super_admin';
  const canEdit = isManager || c.assignedToId === user.id || (c.createdById === user.id && c.status === 'open');

  const completionVal = completionDraft ?? c.completionPercentage;
  const resolutionVal = resolutionDraft ?? (c.resolutionNote ?? '');
  const history = historyQ.data ?? [];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <button onClick={() => router.push('/challenges')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" />{ar ? 'كل التحديات' : 'All challenges'}
      </button>

      {/* Header — always visible */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={'rounded px-2 py-0.5 text-xs ' + statusColor(c.status)}>{statusLabel(c.status, ar)}</span>
              <span className="text-xs text-slate-500">{typeLabel(c.type, ar)} · {priorityLabel(c.priority, ar)}</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-800">{ar ? c.titleAr || c.title : c.title}</h1>
            <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{ar ? c.descriptionAr || c.description : c.description}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-semibold text-indigo-600">{completionVal}%</div>
            <div className="text-xs text-slate-400">{ar ? 'الإنجاز' : 'complete'}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span>{ar ? 'المجال:' : 'Domain:'} <span className="text-slate-700">{domainOf(c.domainId)}</span></span>
          <span>{ar ? 'المسؤول:' : 'Owner:'} <span className="text-slate-700">{nameOf(c.assignedToId)}</span></span>
          <span>{ar ? 'رفعه:' : 'Reported by:'} <span className="text-slate-700">{nameOf(c.createdById)}</span></span>
          <span>{ar ? 'بتاريخ:' : 'Created:'} <span className="text-slate-700">{fmt(c.createdAt, ar)}</span></span>
        </div>
      </div>

      {/* Manage case — collapsed by default, managers/owner/open-creator only */}
      {canEdit && (
        <CollapsibleCard title={ar ? 'إدارة الحالة' : 'Manage case'} icon={<Settings2 className="h-4 w-4 text-slate-500" />}>
          <div className="grid md:grid-cols-2 gap-5">
            {/* Status change */}
            <div>
              <h4 className="text-sm font-semibold mb-3">{ar ? 'تغيير الحالة' : 'Change status'}</h4>
              <label className={LBL}>{ar ? 'الحالة الجديدة' : 'New status'}</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ChallengeStatus)} className={IN}>
                <option value="">{ar ? '— اختر —' : '— select —'}</option>
                {STATUS_OPTS.filter((s) => s !== c.status).map((s) => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
              </select>
              <label className={LBL + ' mt-3'}>{ar ? 'السبب (مطلوب)' : 'Reason (required)'}</label>
              <textarea value={statusReason} onChange={(e) => setStatusReason(e.target.value)} rows={2} className={IN} />
              {statusMut.isError && <p className="text-xs text-red-600 mt-1">{(statusMut.error as Error).message}</p>}
              <Button
                onClick={() => statusMut.mutate()}
                disabled={!newStatus || !statusReason.trim() || statusMut.isPending}
                className="mt-3 gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {statusMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{ar ? 'تطبيق' : 'Apply'}
              </Button>
            </div>

            {/* Completion + assign */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">{ar ? 'نسبة الإنجاز' : 'Completion'}</h4>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={100} value={completionVal}
                    onChange={(e) => setCompletionDraft(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className={IN + ' w-24'}
                  />
                  <span className="text-sm text-slate-400">%</span>
                  <Button
                    variant="outline" onClick={() => completionMut.mutate(completionVal)}
                    disabled={completionDraft === null || completionMut.isPending}
                  >
                    {completionMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (ar ? 'حفظ' : 'Save')}
                  </Button>
                </div>
              </div>
              {isManager && (
                <div className="pt-3 border-t border-slate-100">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1"><UserCog className="h-4 w-4" />{ar ? 'تعيين المسؤول' : 'Assign owner'}</h4>
                  <select
                    value={c.assignedToId ?? ''}
                    onChange={(e) => assignMut.mutate(e.target.value || null)}
                    disabled={assignMut.isPending}
                    className={IN}
                  >
                    <option value="">{ar ? '— غير مُعيَّن —' : '— Unassigned —'}</option>
                    {names.map((n) => <option key={n.id} value={n.id}>{ar ? n.nameAr || n.name : n.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Resolution note */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-semibold mb-2">{ar ? 'ملاحظة الحل' : 'Resolution note'}</h4>
            <textarea value={resolutionVal} onChange={(e) => setResolutionDraft(e.target.value)} rows={3} className={IN} />
            <Button
              variant="outline" className="mt-2"
              onClick={() => resolutionMut.mutate(resolutionVal)}
              disabled={resolutionDraft === null || resolutionMut.isPending}
            >
              {resolutionMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (ar ? 'حفظ الملاحظة' : 'Save note')}
            </Button>
          </div>
        </CollapsibleCard>
      )}

      {/* Stakeholders (collapsed) + Journal (open) — self-contained collapsible cards */}
      <ChallengeStakeholders challengeId={id} />
      <ChallengeJournal challengeId={id} />

      {/* Status history — collapsed by default */}
      <CollapsibleCard title={ar ? 'سجل الحالات' : 'Status history'} icon={<History className="h-4 w-4 text-slate-500" />} count={history.length}>
        {history.length === 0 && <p className="text-sm text-slate-400">{ar ? 'لا توجد تغييرات بعد' : 'No changes yet'}</p>}
        <ol className="space-y-3">
          {history.map((h) => (
            <li key={h.id} className="text-sm border-l-2 border-slate-200 pl-3">
              <div className="flex items-center gap-2">
                <span className={'rounded px-1.5 py-0.5 text-xs ' + statusColor(h.fromStatus)}>{statusLabel(h.fromStatus, ar)}</span>
                <span className="text-slate-400">→</span>
                <span className={'rounded px-1.5 py-0.5 text-xs ' + statusColor(h.toStatus)}>{statusLabel(h.toStatus, ar)}</span>
              </div>
              {h.reason && <p className="text-slate-600 mt-1">{h.reason}</p>}
              <p className="text-xs text-slate-400 mt-0.5">{nameOf(h.changedById)} · {fmt(h.changedAt, ar)}</p>
            </li>
          ))}
        </ol>
      </CollapsibleCard>
    </div>
  );
}
