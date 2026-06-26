'use client';

import { AttachmentsPanel } from '@/components/attachments/attachments-panel';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload, Download, Trash2, Loader2, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import {
  listAttachments, uploadAttachment, getAttachmentUrl, deleteAttachment, getAttachmentsEnabled, getMyAttachmentsControl,
} from '@/lib/attachments/queries';
import {
  type Attachment, type AttachmentEntityType, type AttachmentClassification,
  classificationLabel, classificationColor, humanSize, sizeCapForRole,
  ALLOWED_EXTENSIONS,
} from '@/types/attachment';

const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-500 mb-1 block';

export function AttachmentsPanel({
  entityType, entityId, organizationId,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  organizationId?: string;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [classification, setClassification] = useState<AttachmentClassification>('general');
  const [busyId, setBusyId] = useState<string | null>(null);

  // stakeholders never reach here, but guard anyway
  const isStakeholder = user?.role === 'stakeholder';

  // resolve org id (use prop if given, else fetch the current user's control row)
  const controlQ = useQuery({
    queryKey: ['my-attachments-control'],
    queryFn: getMyAttachmentsControl,
    enabled: !isStakeholder && !organizationId,
  });
  const orgId = organizationId ?? controlQ.data?.organizationId ?? undefined;

  const enabledQ = useQuery({
    queryKey: ['attachments-enabled', orgId],
    queryFn: () => getAttachmentsEnabled(orgId!),
    enabled: !isStakeholder && !!orgId,
  });
  const listQ = useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => listAttachments(entityType, entityId),
    enabled: !isStakeholder && !!orgId,
  });

  const enabled = enabledQ.data === true;
  const items = listQ.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });

  const uploadMut = useMutation({
    mutationFn: () => uploadAttachment({
      entityType, entityId, organizationId: orgId!,
      file: pendingFile!, comment, classification, userRole: user!.role,
    }),
    onSuccess: () => {
      setPendingFile(null); setComment(''); setClassification('general');
      if (fileRef.current) fileRef.current.value = '';
      refresh();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (att: Attachment) => deleteAttachment(att),
    onSuccess: refresh,
  });

  if (!user || isStakeholder) return null;

  // org switch OFF (or org id unresolved) → don't render the panel at all
  if (!orgId) return null;
  if (enabledQ.isLoading || listQ.isLoading) return null;
  const hasItems = (listQ.data ?? []).length > 0;
  if (!enabled && !hasItems) return null;

  const cap = sizeCapForRole(user.role);
  const canDelete = (att: Attachment) =>
    att.uploadedById === user.id || user.role === 'admin' || user.role === 'super_admin';

  const download = async (att: Attachment) => {
    try {
      setBusyId(att.id);
      const url = await getAttachmentUrl(att.storagePath);
      window.open(url, '_blank', 'noopener');
    } finally {
      setBusyId(null);
    }
  };

  const accept = ALLOWED_EXTENSIONS.map((e) => '.' + e).join(',');
  const uploadError = uploadMut.isError ? (uploadMut.error as Error).message : '';

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="h-4 w-4 text-slate-500" />
        <span className="font-medium text-sm text-slate-700">{ar ? 'المرفقات' : 'Attachments'}</span>
        <span className="text-xs text-slate-400">({items.length})</span>
      </div>

      {/* upload row — only when enabled */}
      {enabled && (
      <div className="rounded-md border border-dashed border-slate-200 p-3 mb-3">
        <input
          ref={fileRef} type="file" accept={accept}
          onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:me-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {pendingFile && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">{pendingFile.name} · {humanSize(pendingFile.size)}</p>
            <div>
              <label className={LBL}>{ar ? 'تعليق (اختياري)' : 'Comment (optional)'}</label>
              <input value={comment} onChange={(e) => setComment(e.target.value)} className={IN}
                placeholder={ar ? 'وصف الملف…' : 'Describe the file…'} />
            </div>
            <div>
              <label className={LBL}>{ar ? 'التصنيف' : 'Classification'}</label>
              <select value={classification} onChange={(e) => setClassification(e.target.value as AttachmentClassification)} className={IN}>
                <option value="general">{classificationLabel('general', ar)}</option>
                <option value="confidential">{classificationLabel('confidential', ar)}</option>
                <option value="restricted">{classificationLabel('restricted', ar)}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{ar ? 'رفع' : 'Upload'}
              </Button>
              <button onClick={() => { setPendingFile(null); setComment(''); if (fileRef.current) fileRef.current.value = ''; }} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          {ar ? `الحد الأقصى ${humanSize(cap)} · PDF، Excel، CSV، Word، صور` : `Max ${humanSize(cap)} · PDF, Excel, CSV, Word, images`}
        </p>
        {uploadError && <p className="text-xs text-red-600 mt-1">{uploadErrorMessage(uploadError, ar)}</p>}
      </div>
      )}
      {/* list */}
      {listQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {!listQ.isLoading && items.length === 0 && (
        <p className="text-sm text-slate-400">{ar ? 'لا توجد مرفقات.' : 'No attachments yet.'}</p>
      )}
      <ul className="space-y-2">
        {items.map((att) => (
          <li key={att.id} className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="min-w-0 flex items-start gap-2">
              <FileText className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-slate-800 truncate">{att.fileName}</span>
                  <span className={'rounded px-1.5 py-0.5 text-[11px] ' + classificationColor(att.classification)}>{classificationLabel(att.classification, ar)}</span>
                </div>
                <p className="text-[11px] text-slate-400">{humanSize(att.sizeBytes)}</p>
                {att.comment && <p className="text-xs text-slate-500 mt-0.5">{att.comment}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => download(att)} disabled={busyId === att.id} className="text-slate-400 hover:text-indigo-600 p-1" title={ar ? 'تنزيل' : 'Download'}>
                {busyId === att.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </button>
              {canDelete(att) && (
                <button
                  onClick={() => { if (confirm(ar ? 'حذف المرفق؟' : 'Delete this attachment?')) deleteMut.mutate(att); }}
                  className="text-slate-400 hover:text-red-600 p-1" title={ar ? 'حذف' : 'Delete'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function uploadErrorMessage(code: string, ar: boolean): string {
  if (code === 'file_type_not_allowed') return ar ? 'نوع الملف غير مسموح.' : 'File type not allowed.';
  if (code.startsWith('file_too_large:')) {
    const cap = code.split(':')[1] ?? '';
    return ar ? `الملف كبير جدًا (الحد ${cap}).` : `File too large (max ${cap}).`;
  }
  return ar ? 'تعذّر رفع الملف.' : 'Could not upload the file.';
}
