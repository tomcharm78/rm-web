'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Loader2, Send, Paperclip } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { listApproverOptions, createApprovalRequest } from '@/lib/approvals/queries';
import { uploadAttachment, getMyAttachmentsControl } from '@/lib/attachments/queries';

export function ApprovalRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [approverId, setApproverId] = useState('');
  const [phase, setPhase] = useState<'idle' | 'creating' | 'uploading'>('idle');
  const [err, setErr] = useState<string | null>(null);

  const approversQ = useQuery({ queryKey: ['approver-options'], queryFn: listApproverOptions });
  const approvers = approversQ.data ?? [];

  const orgQ = useQuery({ queryKey: ['my-attachments-control'], queryFn: getMyAttachmentsControl });

  const busy = phase !== 'idle';

  async function handleSend() {
    if (!title.trim()) { setErr(ar ? 'العنوان مطلوب' : 'Title is required'); return; }
    if (!approverId) { setErr(ar ? 'اختر المستلم' : 'Pick a receiver'); return; }
    setErr(null);
    try {
      setPhase('creating');
      const created = await createApprovalRequest({
        title, titleAr: '', description: context, descriptionAr: '', approverId,
      });
      if (file) {
        setPhase('uploading');
        const orgId = orgQ.data?.organizationId ?? null;
        if (!orgId) throw new Error('org_lookup_failed');
        await uploadAttachment({
          entityType: 'approval',
          entityId: created.id,
          organizationId: orgId,
          file,
          comment: '',
          classification: 'general',
          userRole: user?.role ?? 'rm',
        });
      }
      setPhase('idle');
      onCreated(created.id);
    } catch (e) {
      setPhase('idle');
      setErr((e as Error)?.message ?? 'send_failed');
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: 'hsl(var(--card))', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', border: '1px solid hsl(var(--border))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border))' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{ar ? 'طلب موافقة جديد' : 'New approval request'}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={lbl}>{ar ? 'العنوان *' : 'Title *'}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp}
              placeholder={ar ? 'عنوان الخطاب أو المقترح' : 'Title of the letter or proposal'} />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={lbl}>{ar ? 'السياق' : 'Context'}</label>
            <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={5} style={{ ...inp, resize: 'vertical' }}
              placeholder={ar ? 'اكتب تفاصيل الخطاب أو المقترح…' : 'Write the details of your letter or proposal…'} />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={lbl}>{ar ? 'المرفق' : 'Attachment'}</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '9px 12px', borderRadius: 8, border: '1px dashed hsl(var(--border))', background: 'hsl(var(--background))', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>
              <Paperclip size={15} />
              <span>{file ? file.name : (ar ? 'اختر ملف الخطاب أو المقترح' : 'Choose the letter / proposal file')}</span>
              <input type="file" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
              <button onClick={() => setFile(null)} style={{ fontSize: 11, color: '#e34948', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: ar ? 'right' : 'left', padding: 0 }}>
                {ar ? 'إزالة الملف' : 'Remove file'}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={lbl}>{ar ? 'إرسال إلى *' : 'Send to *'}</label>
            <select value={approverId} onChange={(e) => setApproverId(e.target.value)} style={inp}>
              <option value="">{ar ? '— اختر المستلم —' : '— Select receiver —'}</option>
              {approvers.map((a) => (
                <option key={a.id} value={a.id}>{ar ? a.nameAr || a.name : a.name}</option>
              ))}
            </select>
            {approversQ.isSuccess && approvers.length === 0 && (
              <div style={{ fontSize: 11, color: '#c98500' }}>{ar ? 'لا يوجد مستلمون متاحون في تسلسلك.' : 'No receivers available in your chain.'}</div>
            )}
          </div>

          {err && <div style={{ fontSize: 12, color: '#e34948' }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid hsl(var(--border))' }}>
          <button onClick={onClose} disabled={busy} style={btnGhost}>{ar ? 'إلغاء' : 'Cancel'}</button>
          <button onClick={handleSend} disabled={busy || !title.trim() || !approverId}
            style={{ ...btnPrimary, opacity: (busy || !title.trim() || !approverId) ? 0.6 : 1, cursor: (busy || !title.trim() || !approverId) ? 'default' : 'pointer' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {phase === 'uploading' ? (ar ? 'يرفع المرفق…' : 'Uploading…') : phase === 'creating' ? (ar ? 'يرسل…' : 'Sending…') : (ar ? 'إرسال' : 'Send')}
          </button>
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 12, color: 'hsl(var(--muted-foreground))' };
const inp: React.CSSProperties = { fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', width: '100%' };
const btnGhost: React.CSSProperties = { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#199e70', color: '#fff' };
