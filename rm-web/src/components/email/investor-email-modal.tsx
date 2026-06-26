'use client';

import { useState, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Loader2, Paperclip, Upload, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useLanguage } from '@/providers/language-provider';
import { createClient } from '@/lib/supabase/client';
import { sizeCapForRole, humanSize } from '@/types/attachment';

const IN = 'w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LBL = 'text-xs text-slate-500 mb-1 block';

const MERGE_FIELDS = [
  '{representative_name}', '{representative_name_ar}',
  '{company_name}', '{company_name_ar}',
  '{position}', '{position_ar}', '{email}',
];

type Recipient = { id: string; name: string; email: string | null };

export function InvestorEmailModal({
  recipients, organizationId, onClose,
}: {
  recipients: Recipient[];
  organizationId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const ar = language === 'ar';
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const emailable = recipients.filter((r) => (r.email ?? '').trim());
  const skipped = recipients.length - emailable.length;

  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [cc, setCc] = useState('');
  const [attachments, setAttachments] = useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<null | { success: number; fail: number }>(null);

  // insert a merge token at the body cursor
  const insertField = (token: string) => {
    const el = bodyRef.current;
    if (!el) { setBodyText((b) => b + token); return; }
    const start = el.selectionStart ?? bodyText.length;
    const end = el.selectionEnd ?? bodyText.length;
    setBodyText(bodyText.slice(0, start) + token + bodyText.slice(end));
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; }, 0);
  };

  // upload an attachment to the 'attachments' bucket under an email/ path
  const uploadFile = useCallback(async (file: File) => {
    const cap = sizeCapForRole(user?.role ?? '');
    if (file.size > cap) { alert(ar ? `الحد الأقصى ${humanSize(cap)}` : `Max ${humanSize(cap)}`); return; }
    setUploading(true);
    try {
      const supabase = createClient();
      const uid = (crypto as Crypto).randomUUID();
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120);
      const path = `org/${organizationId}/email/${uid}-${safe}`;
      const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) { alert(error.message); return; }
      setAttachments((a) => [...a, { path, name: file.name }]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [organizationId, ar]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFile(f);
  };

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/send-investor-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investorIds: emailable.map((r) => r.id),
          subjectTemplate: subject,
          bodyTemplate: bodyText.replace(/\n/g, '<br>'),
          cc,
          attachmentPaths: attachments.map((a) => a.path),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'send_failed');
      return data as { success: number; fail: number };
    },
    onSuccess: (data) => setResult({ success: data.success, fail: data.fail }),
  });

  const canSend = subject.trim() && bodyText.trim() && emailable.length > 0 && !sendMut.isPending && !uploading;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8" onMouseDown={(e) => e.stopPropagation()} dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{ar ? 'بريد المستثمرين' : 'Investor Email'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        {result ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-slate-800 font-medium">{ar ? 'تم الإرسال' : 'Sent'}</p>
            <p className="text-sm text-slate-500 mt-1">
              {ar ? `نجح: ${result.success} · فشل: ${result.fail}` : `Sent: ${result.success} · Failed: ${result.fail}`}
            </p>
            <Button onClick={onClose} className="mt-5 bg-indigo-600 hover:bg-indigo-700">{ar ? 'إغلاق' : 'Close'}</Button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                {ar ? `المستلمون: ${emailable.length}` : `Recipients: ${emailable.length}`}
                {skipped > 0 && <span className="text-amber-600"> · {ar ? `${skipped} بدون بريد (تم تخطيهم)` : `${skipped} without email (skipped)`}</span>}
              </div>

              <div>
                <label className={LBL}>{ar ? 'الموضوع' : 'Subject'} *</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={IN} dir={ar ? 'rtl' : 'ltr'} />
              </div>

              <div>
                <label className={LBL}>{ar ? 'نسخة إلى (CC) — تُفصل بفواصل' : 'CC (comma-separated)'}</label>
                <input value={cc} onChange={(e) => setCc(e.target.value)} className={IN} dir="ltr" placeholder="a@x.com, b@y.com" />
              </div>

              <div>
                <label className={LBL}>{ar ? 'النص' : 'Body'} *</label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {MERGE_FIELDS.map((f) => (
                    <button key={f} type="button" onClick={() => insertField(f)} className="text-[11px] rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.5 hover:bg-indigo-100">{f}</button>
                  ))}
                </div>
                <textarea
                  ref={bodyRef} value={bodyText} onChange={(e) => setBodyText(e.target.value)}
                  rows={9} className={IN}
                  style={{ fontFamily: "'Times New Roman', 'Traditional Arabic', serif", fontSize: '13px' }}
                  dir={ar ? 'rtl' : 'ltr'}
                  placeholder={ar ? 'اكتب الرسالة… استخدم الحقول أعلاه للتخصيص' : 'Write your message… use the fields above to personalize'}
                />
                <p className="text-[11px] text-slate-400 mt-1">{ar ? 'يُدمج كل حقل ببيانات المستثمر لكل مستلم.' : 'Each field is merged with the investor’s data per recipient.'}</p>
              </div>

              {/* attachments */}
              <div>
                <label className={LBL}>{ar ? 'المرفقات' : 'Attachments'}</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={'rounded-md border border-dashed p-3 text-center text-sm ' + (dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200')}
                >
                  <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {ar ? 'اختر ملفًا أو اسحبه هنا' : 'Choose a file or drag it here'}
                  </button>
                  <p className="text-[11px] text-slate-400 mt-1">{ar ? 'نفس الملف يُرسل لكل المستلمين · حتى 10 ميغابايت' : 'Same file sent to all recipients · up to 10 MB'}</p>
                </div>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((a, i) => (
                      <li key={a.path} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1">
                        <span className="inline-flex items-center gap-1 text-slate-600"><Paperclip className="h-3 w-3" />{a.name}</span>
                        <button onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {sendMut.isError && <p className="text-xs text-red-600">{sendErrorMessage((sendMut.error as Error).message, ar)}</p>}
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
              <span className="text-[11px] text-slate-400">{ar ? `الرد يذهب إلى: ${user?.email ?? ''}` : `Replies go to: ${user?.email ?? ''}`}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={sendMut.isPending}>{ar ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={() => sendMut.mutate()} disabled={!canSend} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{ar ? 'إرسال' : 'Send'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function sendErrorMessage(code: string, ar: boolean): string {
  const m: Record<string, [string, string]> = {
    module_disabled: ['The email module is disabled.', 'وحدة البريد معطّلة.'],
    not_authorized: ['You do not have permission to send.', 'لا تملك صلاحية الإرسال.'],
    no_emailable_recipients: ['None of the selected investors have an email.', 'لا يوجد بريد لأي من المستثمرين المحددين.'],
    resend_not_configured: ['Email service not configured.', 'خدمة البريد غير مهيأة.'],
  };
  return m[code] ? (ar ? m[code][1] : m[code][0]) : (ar ? 'تعذّر الإرسال.' : 'Could not send.');
}
