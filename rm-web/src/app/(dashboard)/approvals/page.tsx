'use client';
// Approvals — unified aggregation hub + letter requests.
//
// Pending / Approved / Rejected tabs show ALL approval kinds merged FIFO:
//   task closures, task transfers, leave requests, letter/proposal requests.
// Approve/Reject dispatches to each source's EXISTING mutation — nothing rewired.
// "My requests" stays the letter-initiator view (compose / resubmit / delete).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Plus, Loader2, ThumbsUp, ThumbsDown, Inbox, FileText, Paperclip,
  Pencil, Trash2, ExternalLink, Search, ClipboardCheck, ArrowLeftRight, CalendarDays, Mail,
} from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  listMyApprovalRequests, decideApprovalRequest,
  resubmitApprovalRequest, deleteApprovalRequest,
} from '@/lib/approvals/queries';
import { getUnifiedApprovals } from '@/lib/approvals/hub';
import {
  approveClosure, rejectClosure, approveTransfer, rejectTransfer,
  listDepartments, type DepartmentOption,
} from '@/lib/tasks/queries';
import { approveVacation, rejectVacation } from '@/lib/vacations/queries';
import { getAttachmentCounts } from '@/lib/attachments/queries';
import { APPROVAL_STATUS_LABELS, approvalStatusColor, type ApprovalRequest } from '@/types/approval';
import {
  APPROVAL_KIND_LABELS, type UnifiedApproval, type ApprovalKind, type ApprovalHubStatus,
} from '@/types/approval-hub';
import { AttachmentsPanel } from '@/components/attachments/attachments-panel';
import { ApprovalRequestModal } from '@/components/approvals/approval-request-modal';

type Tab = 'pending' | 'approved' | 'rejected' | 'mine';

function fmtDate(iso: string | null, ar: boolean): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(ar ? 'ar' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

const KIND_ICONS: Record<ApprovalKind, typeof FileText> = {
  task_closure: ClipboardCheck,
  transfer: ArrowLeftRight,
  vacation: CalendarDays,
  letter: Mail,
};

// ---- per-kind dispatch to the EXISTING mutations ----
async function approveUnified(row: UnifiedApproval, comment: string): Promise<void> {
  switch (row.kind) {
    case 'task_closure':
      return approveClosure(row.sourceId);
    case 'transfer': {
      const taskId = row.meta?.taskId;
      const targetUserId = row.meta?.targetUserId;
      if (!taskId || !targetUserId) throw new Error('transfer_meta_missing');
      return approveTransfer(row.sourceId, taskId, targetUserId);
    }
    case 'vacation':
      return approveVacation(row.sourceId);
    case 'letter':
      return decideApprovalRequest(row.sourceId, 'approved', comment);
  }
}
async function rejectUnified(row: UnifiedApproval, reason: string): Promise<void> {
  switch (row.kind) {
    case 'task_closure':
      return rejectClosure(row.sourceId, reason);
    case 'transfer':
      return rejectTransfer(row.sourceId, reason);
    case 'vacation':
      return rejectVacation(row.sourceId, reason);
    case 'letter':
      return decideApprovalRequest(row.sourceId, 'rejected', reason);
  }
}

export default function ApprovalsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const router = useRouter();

  const isApprover = user?.role === 'admin' || user?.role === 'super_admin';

  const [tab, setTab] = useState<Tab>('pending');
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // filters (unified tabs)
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all'); // '1'..'12'
  const [yearFilter, setYearFilter] = useState<string>('all');

  // ---- unified hub (pending/approved/rejected) ----
  const hubQ = useQuery({
    queryKey: ['approvals-hub', tab],
    queryFn: () => getUnifiedApprovals(tab as ApprovalHubStatus),
    enabled: tab !== 'mine' && isApprover,
    refetchInterval: tab === 'pending' ? 10_000 : false,
  });

  // ---- my letter requests ----
  const mineQ = useQuery({
    queryKey: ['approvals-mine'],
    queryFn: listMyApprovalRequests,
    enabled: tab === 'mine',
  });

  const hubRows = hubQ.data ?? [];
  const mineRows = mineQ.data ?? [];
  const loading = tab === 'mine' ? mineQ.isLoading : hubQ.isLoading;

  // departments for the filter dropdown
  const deptsQ = useQuery({ queryKey: ['departments-options'], queryFn: listDepartments, enabled: isApprover });
  const depts: DepartmentOption[] = deptsQ.data ?? [];

  // years present in the data (for the year dropdown)
  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const r of hubRows) ys.add(String(new Date(r.createdAt).getFullYear()));
    return Array.from(ys).sort();
  }, [hubRows]);

  // client-side filtering (FIFO order already set by the data layer)
  const filteredHub = useMemo(() => {
    const s = search.trim().toLowerCase();
    return hubRows.filter((r) => {
      if (deptFilter !== 'all' && r.departmentId !== deptFilter) return false;
      const d = new Date(r.createdAt);
      if (monthFilter !== 'all' && d.getMonth() + 1 !== Number(monthFilter)) return false;
      if (yearFilter !== 'all' && d.getFullYear() !== Number(yearFilter)) return false;
      if (s) {
        const hay = `${r.title} ${r.titleAr} ${r.requesterName} ${r.requesterNameAr}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [hubRows, search, deptFilter, monthFilter, yearFilter]);

  // attachment counts — letters only (the only kind with attachments)
  const letterIds = useMemo(
    () => filteredHub.filter((r) => r.kind === 'letter').map((r) => r.sourceId),
    [filteredHub],
  );
  const hubCountsQ = useQuery({
    queryKey: ['approval-attachment-counts', 'hub', letterIds],
    queryFn: () => getAttachmentCounts('approval', letterIds),
    enabled: letterIds.length > 0,
  });
  const mineCountsQ = useQuery({
    queryKey: ['approval-attachment-counts', 'mine', mineRows.map((r) => r.id)],
    queryFn: () => getAttachmentCounts('approval', mineRows.map((r) => r.id)),
    enabled: tab === 'mine' && mineRows.length > 0,
  });
  const hubCounts = hubCountsQ.data ?? {};
  const mineCounts = mineCountsQ.data ?? {};

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['approvals-hub'] });
    qc.invalidateQueries({ queryKey: ['approvals-mine'] });
    qc.invalidateQueries({ queryKey: ['approval-attachment-counts'] });
    // Hub decisions mutate other modules' data — invalidate their caches too,
    // so task/vacation pages re-render fresh without a manual F5.
    qc.invalidateQueries({ queryKey: ['task'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task-history'] });
    qc.invalidateQueries({ queryKey: ['task-transfer'] });
    qc.invalidateQueries({ queryKey: ['vacations'] });
    qc.invalidateQueries({ queryKey: ['my-upcoming-leave'] });
    qc.invalidateQueries({ queryKey: ['team-leave-window'] });
    qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  };

  if (!user) return null;

  const tabs: { key: Tab; labelEn: string; labelAr: string }[] = [
    ...(isApprover
      ? ([
          { key: 'pending', labelEn: 'Pending', labelAr: 'قيد الانتظار' },
          { key: 'approved', labelEn: 'Approved', labelAr: 'تمت الموافقة' },
          { key: 'rejected', labelEn: 'Rejected', labelAr: 'مرفوض' },
        ] as const)
      : []),
    { key: 'mine', labelEn: 'My requests', labelAr: 'طلباتي' },
  ];

  // Non-approvers land on My requests.
  const activeTab: Tab = !isApprover ? 'mine' : tab;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={20} />
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>{ar ? 'الموافقات' : 'Approvals'}</h1>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#199e70', color: '#fff', cursor: 'pointer' }}>
          <Plus size={15} />{ar ? 'طلب جديد' : 'New request'}
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 20 }}>
        {isApprover
          ? (ar ? 'جميع الموافقات المعلقة في مكان واحد — إغلاق المهام، النقل، الإجازات، والخطابات' : 'All pending approvals in one place — task closures, transfers, leave, and letters')
          : (ar ? 'طلبات الموافقة على الخطابات والمقترحات' : 'Approval requests for letters & proposals')}
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setExpanded(null); }}
            style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid hsl(var(--border))',
              background: activeTab === t.key ? 'hsl(var(--foreground))' : 'transparent',
              color: activeTab === t.key ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
            }}>
            {ar ? t.labelAr : t.labelEn}
          </button>
        ))}
      </div>

      {/* ---- search + filters (unified tabs only) ---- */}
      {activeTab !== 'mine' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', top: 9, insetInlineStart: 10, color: 'hsl(var(--muted-foreground))' }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={ar ? 'بحث بالعنوان أو الاسم…' : 'Search title or name…'}
              style={{ ...inp, paddingInlineStart: 30 }}
            />
          </div>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={sel}>
            <option value="all">{ar ? 'كل الإدارات' : 'All departments'}</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>{ar ? d.nameAr || d.name : d.name}</option>
            ))}
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={sel}>
            <option value="all">{ar ? 'كل الأشهر' : 'All months'}</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {new Date(2000, i, 1).toLocaleDateString(ar ? 'ar' : 'en-GB', { month: 'long' })}
              </option>
            ))}
          </select>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={sel}>
            <option value="all">{ar ? 'كل السنوات' : 'All years'}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>
      ) : activeTab === 'mine' ? (
        mineRows.length === 0 ? (
          <EmptyState ar={ar} />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {mineRows.map((r) => (
              <ApprovalCard
                key={r.id} r={r} ar={ar} isApprover={false} isMine={r.requesterId === user.id}
                attachmentCount={mineCounts[r.id] ?? 0}
                expanded={expanded === r.id}
                onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                onChanged={refresh}
              />
            ))}
          </div>
        )
      ) : filteredHub.length === 0 ? (
        <EmptyState ar={ar} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredHub.map((r) => (
            <UnifiedCard
              key={r.key} r={r} ar={ar}
              canDecide={r.status === 'pending'}
              attachmentCount={r.kind === 'letter' ? (hubCounts[r.sourceId] ?? 0) : 0}
              expanded={expanded === r.key}
              onToggle={() => setExpanded(expanded === r.key ? null : r.key)}
              onOpen={() => { if (r.detailHref) router.push(r.detailHref); }}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {showNew && (
        <ApprovalRequestModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); setTab('mine'); refresh(); }}
        />
      )}
    </div>
  );
}

function EmptyState({ ar }: { ar: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '40px 0', color: 'hsl(var(--muted-foreground))' }}>
      <Inbox size={28} />
      <span style={{ fontSize: 13 }}>{ar ? 'لا توجد طلبات.' : 'No requests here.'}</span>
    </div>
  );
}

// ================================================================ unified hub card
function UnifiedCard({ r, ar, canDecide, attachmentCount, expanded, onToggle, onOpen, onChanged }: {
  r: UnifiedApproval;
  ar: boolean;
  canDecide: boolean;
  attachmentCount: number;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<null | 'approve' | 'reject'>(null);
  const [comment, setComment] = useState('');
  const color = approvalStatusColor(r.status);
  const KindIcon = KIND_ICONS[r.kind];
  const kindLabel = ar ? APPROVAL_KIND_LABELS[r.kind].ar : APPROVAL_KIND_LABELS[r.kind].en;
  const title = ar && r.titleAr ? r.titleAr : r.title;

  const decide = useMutation({
    mutationFn: (d: 'approve' | 'reject') =>
      d === 'approve' ? approveUnified(r, comment) : rejectUnified(r, comment),
    onSuccess: () => { setMode(null); setComment(''); onChanged(); },
  });

  return (
    <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 12, background: 'hsl(var(--card))', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <KindIcon size={16} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0, marginTop: 2, cursor: 'pointer' }} onClick={onToggle} />
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onToggle}>
          <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {title}
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
              {kindLabel}
            </span>
            {attachmentCount > 0 && (
              <span title={ar ? 'مرفق' : 'Attachment'} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                <Paperclip size={12} />{attachmentCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
            {(ar ? 'من: ' : 'From: ') + (ar ? r.requesterNameAr || r.requesterName || '—' : r.requesterName || '—')}
            {r.departmentName ? `  ·  ${ar ? r.departmentNameAr || r.departmentName : r.departmentName}` : ''}
            {'  ·  '}{fmtDate(r.createdAt, ar)}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: color + '18', color, flexShrink: 0 }}>
          {ar ? APPROVAL_STATUS_LABELS[r.status].ar : APPROVAL_STATUS_LABELS[r.status].en}
        </span>
        {r.detailHref && (
          <button onClick={onOpen} title={ar ? 'فتح في موقعه' : 'Open in its module'} style={iconBtn}>
            <ExternalLink size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid hsl(var(--border))' }}>
          {r.detail && (
            <div style={{ fontSize: 13, color: 'hsl(var(--foreground))', margin: '12px 0', whiteSpace: 'pre-wrap' }}>
              {ar && r.detailAr ? r.detailAr : r.detail}
            </div>
          )}
          {r.kind === 'letter' && (
            <div style={{ margin: '12px 0' }}>
              <AttachmentsPanel entityType="approval" entityId={r.sourceId} />
            </div>
          )}
          {r.status !== 'pending' && r.decisionComment && (
            <div style={{ fontSize: 12, background: color + '11', border: `1px solid ${color}33`, borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
              <div style={{ fontWeight: 600, color, marginBottom: 2 }}>{ar ? 'تعليق القرار' : 'Decision comment'}</div>
              <div style={{ color: 'hsl(var(--foreground))' }}>{r.decisionComment}</div>
            </div>
          )}
          {canDecide && (
            mode === null ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setMode('approve')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#199e70', color: '#fff', cursor: 'pointer' }}>
                  <ThumbsUp size={14} />{ar ? 'موافقة' : 'Approve'}
                </button>
                <button onClick={() => setMode('reject')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer' }}>
                  <ThumbsDown size={14} />{ar ? 'رفض' : 'Reject'}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                {(mode === 'reject' || r.kind === 'letter') && (
                  <>
                    <label style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                      {mode === 'reject' ? (ar ? 'سبب الرفض (مطلوب)' : 'Reason for rejection (required)') : (ar ? 'تعليق (اختياري)' : 'Comment (optional)')}
                    </label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                      style={{ ...inp, marginTop: 4, resize: 'vertical' }} />
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => decide.mutate(mode)}
                    disabled={decide.isPending || (mode === 'reject' && !comment.trim())}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: 'none',
                      background: mode === 'approve' ? '#199e70' : '#e34948', color: '#fff',
                      cursor: (decide.isPending || (mode === 'reject' && !comment.trim())) ? 'default' : 'pointer',
                      opacity: (mode === 'reject' && !comment.trim()) ? 0.6 : 1,
                    }}>
                    {decide.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                    {mode === 'approve' ? (ar ? 'تأكيد الموافقة' : 'Confirm approve') : (ar ? 'تأكيد الرفض' : 'Confirm reject')}
                  </button>
                  <button onClick={() => { setMode(null); setComment(''); }} style={btnGhost}>{ar ? 'إلغاء' : 'Cancel'}</button>
                </div>
                {decide.isError && <div style={{ fontSize: 12, color: '#e34948', marginTop: 6 }}>{(decide.error as Error)?.message}</div>}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================ letter card (My requests) — unchanged
function ApprovalCard({ r, ar, isApprover, isMine, attachmentCount, expanded, onToggle, onChanged }: {
  r: ApprovalRequest;
  ar: boolean;
  isApprover: boolean;
  isMine: boolean;
  attachmentCount: number;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<null | 'approve' | 'reject'>(null);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(r.title);
  const [editCtx, setEditCtx] = useState(r.description);
  const color = approvalStatusColor(r.status);

  const decide = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') => decideApprovalRequest(r.id, decision, comment),
    onSuccess: () => { setMode(null); setComment(''); onChanged(); },
  });
  const resubmit = useMutation({
    mutationFn: () => resubmitApprovalRequest(r.id, editTitle, editCtx),
    onSuccess: () => { setEditing(false); onChanged(); },
  });
  const del = useMutation({
    mutationFn: () => deleteApprovalRequest(r.id),
    onSuccess: onChanged,
  });

  const canDecide = isApprover && r.status === 'pending';
  const canEdit = isMine && r.status === 'rejected';       // resubmission
  const canDelete = isMine && r.status !== 'approved';

  return (
    <div style={{ border: '1px solid hsl(var(--border))', borderRadius: 12, background: 'hsl(var(--card))', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <FileText size={16} style={{ color: 'hsl(var(--muted-foreground))', flexShrink: 0, marginTop: 2, cursor: 'pointer' }} onClick={onToggle} />
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onToggle}>
          <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {r.title}
            {attachmentCount > 0 && (
              <span title={ar ? 'مرفق' : 'Attachment'} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                <Paperclip size={12} />{attachmentCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
            {isApprover ? `${ar ? 'من' : 'From'}: ${r.requesterName ?? '—'}` : `${ar ? 'إلى' : 'To'}: ${r.approverName ?? '—'}`}
            {'  ·  '}{fmtDate(r.createdAt, ar)}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: color + '18', color, flexShrink: 0 }}>
          {ar ? APPROVAL_STATUS_LABELS[r.status].ar : APPROVAL_STATUS_LABELS[r.status].en}
        </span>
        {canEdit && (
          <button onClick={() => { setEditing(true); setEditTitle(r.title); setEditCtx(r.description); onToggle(); }} title={ar ? 'تعديل وإعادة الإرسال' : 'Edit & resubmit'}
            style={iconBtn}><Pencil size={14} /></button>
        )}
        {canDelete && (
          <button onClick={() => { if (confirm(ar ? 'حذف هذا الطلب؟' : 'Delete this request?')) del.mutate(); }} title={ar ? 'حذف' : 'Delete'}
            style={iconBtn}><Trash2 size={14} /></button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid hsl(var(--border))' }}>
          {editing ? (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={inp} placeholder={ar ? 'العنوان' : 'Title'} />
              <textarea value={editCtx} onChange={(e) => setEditCtx(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} placeholder={ar ? 'السياق' : 'Context'} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => resubmit.mutate()} disabled={!editTitle.trim() || resubmit.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#199e70', color: '#fff', cursor: 'pointer', opacity: !editTitle.trim() ? 0.6 : 1 }}>
                  {resubmit.isPending ? <Loader2 size={14} className="animate-spin" /> : null}{ar ? 'إعادة الإرسال' : 'Resubmit'}
                </button>
                <button onClick={() => setEditing(false)} style={btnGhost}>{ar ? 'إلغاء' : 'Cancel'}</button>
              </div>
              {resubmit.isError && <div style={{ fontSize: 12, color: '#e34948' }}>{(resubmit.error as Error)?.message}</div>}
            </div>
          ) : (
            <>
              {r.description && (
                <div style={{ fontSize: 13, color: 'hsl(var(--foreground))', margin: '12px 0', whiteSpace: 'pre-wrap' }}>{r.description}</div>
              )}
              <div style={{ margin: '12px 0' }}>
                <AttachmentsPanel entityType="approval" entityId={r.id} />
              </div>
              {r.status !== 'pending' && r.decisionComment && (
                <div style={{ fontSize: 12, background: color + '11', border: `1px solid ${color}33`, borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
                  <div style={{ fontWeight: 600, color, marginBottom: 2 }}>{ar ? 'تعليق القرار' : 'Decision comment'}</div>
                  <div style={{ color: 'hsl(var(--foreground))' }}>{r.decisionComment}</div>
                </div>
              )}
              {canDecide && (
                mode === null ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => setMode('approve')}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#199e70', color: '#fff', cursor: 'pointer' }}>
                      <ThumbsUp size={14} />{ar ? 'موافقة' : 'Approve'}
                    </button>
                    <button onClick={() => setMode('reject')}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer' }}>
                      <ThumbsDown size={14} />{ar ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                      {mode === 'reject' ? (ar ? 'سبب الرفض (مطلوب)' : 'Reason for rejection (required)') : (ar ? 'تعليق (اختياري)' : 'Comment (optional)')}
                    </label>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                      style={{ ...inp, marginTop: 4, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => decide.mutate(mode === 'approve' ? 'approved' : 'rejected')}
                        disabled={decide.isPending || (mode === 'reject' && !comment.trim())}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: 'none',
                          background: mode === 'approve' ? '#199e70' : '#e34948', color: '#fff',
                          cursor: (decide.isPending || (mode === 'reject' && !comment.trim())) ? 'default' : 'pointer',
                          opacity: (mode === 'reject' && !comment.trim()) ? 0.6 : 1,
                        }}>
                        {decide.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                        {mode === 'approve' ? (ar ? 'تأكيد الموافقة' : 'Confirm approve') : (ar ? 'تأكيد الرفض' : 'Confirm reject')}
                      </button>
                      <button onClick={() => { setMode(null); setComment(''); }} style={btnGhost}>{ar ? 'إلغاء' : 'Cancel'}</button>
                    </div>
                    {decide.isError && <div style={{ fontSize: 12, color: '#e34948', marginTop: 6 }}>{(decide.error as Error)?.message}</div>}
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid hsl(var(--border))', background: 'transparent', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', flexShrink: 0 };
const inp: React.CSSProperties = { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' };
const sel: React.CSSProperties = { fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', cursor: 'pointer' };
const btnGhost: React.CSSProperties = { fontSize: 13, padding: '7px 14px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer' };
