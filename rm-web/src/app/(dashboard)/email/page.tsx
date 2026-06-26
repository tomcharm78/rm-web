'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, ChevronRight, Check, X, Eye, Paperclip } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import {
  listEmailBatches, listBatchRecipients, reMergeForInvestor,
  type EmailBatch, type SentEmail,
} from '@/lib/email/email-history-queries';

function fmt(ts: string, ar: boolean) {
  try { return new Date(ts).toLocaleString(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return ts; }
}

export default function EmailHistoryPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [openBatch, setOpenBatch] = useState<EmailBatch | null>(null);

  const batchesQ = useQuery({ queryKey: ['email-batches'], queryFn: listEmailBatches });
  const batches = batchesQ.data ?? [];

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="h-5 w-5 text-slate-500" />
        <h1 className="text-xl font-semibold text-slate-800">{ar ? 'سجل البريد' : 'Email History'}</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        {ar ? 'سجل عمليات الإرسال للمستثمرين. الإنشاء يتم من قائمة المستثمرين.' : 'A record of investor sends. Compose from the Investors list.'}
      </p>

      {batchesQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
      {!batchesQ.isLoading && batches.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">
          <Mail className="h-6 w-6 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">{ar ? 'لم تُرسل أي رسائل بعد.' : 'No emails sent yet.'}</p>
        </div>
      )}

      <div className="space-y-2">
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => setOpenBatch(b)}
            className="w-full bg-white rounded-lg border border-slate-200 p-4 text-start hover:border-indigo-300 hover:shadow-sm transition flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate">{b.subjectTemplate}</p>
              <p className="text-xs text-slate-400 mt-1">
                {fmt(b.createdAt, ar)} · {ar ? `${b.recipientCount} مستلم` : `${b.recipientCount} recipients`}
                {' · '}<span className="text-emerald-600">{b.successCount} {ar ? 'نجح' : 'sent'}</span>
                {b.failCount > 0 && <span className="text-red-600"> · {b.failCount} {ar ? 'فشل' : 'failed'}</span>}
                {b.attachmentPaths.length > 0 && <span className="inline-flex items-center gap-0.5 ms-1"><Paperclip className="h-3 w-3" />{b.attachmentPaths.length}</span>}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 shrink-0 rtl:rotate-180" />
          </button>
        ))}
      </div>

      {openBatch && <BatchDetail batch={openBatch} ar={ar} onClose={() => setOpenBatch(null)} />}
    </div>
  );
}

function BatchDetail({ batch, ar, onClose }: { batch: EmailBatch; ar: boolean; onClose: () => void }) {
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);

  const recQ = useQuery({ queryKey: ['batch-recipients', batch.id], queryFn: () => listBatchRecipients(batch.id) });
  const recipients = recQ.data ?? [];

  const showPreview = async (r: SentEmail) => {
    const subject = await reMergeForInvestor(batch.subjectTemplate, r.investorId);
    const body = await reMergeForInvestor(batch.bodyTemplate, r.investorId);
    setPreview({ subject, body });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <span className="font-semibold truncate">{batch.subjectTemplate}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {batch.cc && <p className="text-xs text-slate-500 mb-2">CC: {batch.cc}</p>}
          {recQ.isLoading && <p className="text-sm text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p>}
          <ul className="divide-y divide-slate-100">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{r.recipientName || r.recipientEmail}</p>
                  <p className="text-xs text-slate-400 truncate">{r.recipientEmail}</p>
                  {r.error && <p className="text-[11px] text-red-500 mt-0.5 truncate">{r.error}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'sent'
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />{ar ? 'أُرسل' : 'Sent'}</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-red-600"><X className="h-3.5 w-3.5" />{ar ? 'فشل' : 'Failed'}</span>}
                  <button onClick={() => showPreview(r)} className="text-slate-400 hover:text-indigo-600 p-1" title={ar ? 'معاينة' : 'Preview'}>
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onMouseDown={() => setPreview(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl my-8" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <span className="text-sm font-semibold">{ar ? 'معاينة ما تم استلامه' : 'Preview of what was received'}</span>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm font-medium text-slate-800 mb-2">{preview.subject}</p>
              <div
                className="text-sm text-slate-700 border-t border-slate-100 pt-3"
                style={{ fontFamily: "'Times New Roman', 'Traditional Arabic', serif", fontSize: '13px' }}
                dangerouslySetInnerHTML={{ __html: preview.body }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}