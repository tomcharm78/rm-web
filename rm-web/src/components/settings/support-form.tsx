'use client';
// The support request form.
//
// The point is to get a REPORTABLE bug out of a frustrated user without making
// them write an essay. So: structured questions with likely answers, an "Other"
// escape hatch, and everything about their setup captured silently.
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2, Send, Upload, Check } from 'lucide-react';
import { createSupportRequest } from '@/lib/support/queries';
import { createClient } from '@/lib/supabase/client';

const MODULES: [string, string, string][] = [
  // key, EN, AR
  ['dashboard', 'Dashboard', 'لوحة المعلومات'],
  ['investors', 'Investors', 'المستثمرون'],
  ['contacts', 'Contacts', 'جهات الاتصال'],
  ['tasks', 'Tasks', 'المهام'],
  ['challenges', 'Challenges', 'التحديات'],
  ['sessions', 'Sessions', 'الجلسات'],
  ['email', 'Email', 'البريد'],
  ['surveys', 'Surveys', 'الاستبيانات'],
  ['vacations', 'Vacations', 'الإجازات'],
  ['approvals', 'Approvals', 'الموافقات'],
  ['reports', 'Reports', 'التقارير'],
  ['kpis', 'KPIs', 'مؤشرات الأداء'],
  ['users', 'Users', 'المستخدمون'],
  ['login', 'Signing in', 'تسجيل الدخول'],
  ['other', 'Something else', 'شيء آخر'],
];

const ACTIVITIES: [string, string, string][] = [
  ['creating', 'Creating something', 'إنشاء عنصر'],
  ['editing', 'Editing something', 'تعديل عنصر'],
  ['deleting', 'Deleting something', 'حذف عنصر'],
  ['viewing', 'Just viewing a page', 'عرض صفحة'],
  ['exporting', 'Exporting or downloading', 'تصدير أو تنزيل'],
  ['searching', 'Searching or filtering', 'بحث أو تصفية'],
  ['signing_in', 'Signing in', 'تسجيل الدخول'],
  ['other', 'Something else', 'شيء آخر'],
];

const PROBLEMS: [string, string, string][] = [
  ['nothing_happened', 'Nothing happened when I clicked', 'لم يحدث شيء عند الضغط'],
  ['error_message', 'I got an error message', 'ظهرت رسالة خطأ'],
  ['wrong_data', 'The wrong information appeared', 'ظهرت بيانات غير صحيحة'],
  ['stuck_loading', 'The page froze or kept loading', 'تجمّدت الصفحة أو استمر التحميل'],
  ['saved_wrong', 'It saved, but the result was wrong', 'تم الحفظ لكن النتيجة خاطئة'],
  ['looks_broken', 'Something looked broken or misplaced', 'يبدو التصميم مكسورًا'],
  ['cannot_find', 'I could not find what I needed', 'لم أجد ما أبحث عنه'],
  ['other', 'Something else', 'شيء آخر'],
];

/** Guess the module from the page they were on — they can change it. */
function moduleFromPath(path: string): string {
  const seg = path.split('/').filter(Boolean)[0] ?? '';
  return MODULES.some(([k]) => k === seg) ? seg : 'other';
}

export function SupportForm({ ar, onDone }: { ar: boolean; onDone: () => void }) {
  const pathname = usePathname();
  const [moduleKey, setModuleKey] = useState(moduleFromPath(pathname ?? ''));
  const [activity, setActivity] = useState('');
  const [problem, setProblem] = useState('');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setErr('');
    if (!activity || !problem) {
      setErr(ar ? 'أجب عن السؤالين أعلاه.' : 'Please answer both questions above.');
      return;
    }
    setSaving(true);
    try {
      let attachmentPath: string | null = null;

      // Screenshot goes into the existing private attachments bucket.
      if (file) {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? 'anon';
        const path = `support/${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
        if (upErr) throw new Error(upErr.message);
        attachmentPath = path;
      }

      await createSupportRequest({
        moduleKey,
        activity: labelOf(ACTIVITIES, activity, ar),
        problem: labelOf(PROBLEMS, problem, ar),
        details,
        attachmentPath,
      });
      setDone(true);
      setTimeout(onDone, 1200);
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-lg border border-green-200 p-8 text-center">
        <Check className="h-8 w-8 text-green-600 mx-auto mb-2" />
        <p className="text-sm text-slate-700">
          {ar ? 'تم إرسال طلبك. سيصلك إشعار بالرد.' : 'Your request has been sent. You will be notified when it is answered.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      <p className="text-xs text-slate-500">
        {ar
          ? 'أجب عن الأسئلة التالية. سيتم إرفاق تفاصيل جهازك والصفحة تلقائيًا — لا داعي لكتابتها.'
          : 'Answer the questions below. Your page, browser and account details are attached automatically — no need to describe them.'}
      </p>

      <div>
        <label className="block text-xs text-slate-600 mb-1">
          {ar ? 'أي وحدة؟' : 'Which module?'}
        </label>
        <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)} className={SEL}>
          {MODULES.map(([k, en, arL]) => (
            <option key={k} value={k}>{ar ? arL : en}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-600 mb-1">
          {ar ? 'ماذا كنت تفعل؟ *' : 'What were you doing? *'}
        </label>
        <select value={activity} onChange={(e) => setActivity(e.target.value)} className={SEL}>
          <option value="">{ar ? '— اختر —' : '— select —'}</option>
          {ACTIVITIES.map(([k, en, arL]) => (
            <option key={k} value={k}>{ar ? arL : en}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-600 mb-1">
          {ar ? 'ماذا حدث؟ *' : 'What happened? *'}
        </label>
        <select value={problem} onChange={(e) => setProblem(e.target.value)} className={SEL}>
          <option value="">{ar ? '— اختر —' : '— select —'}</option>
          {PROBLEMS.map(([k, en, arL]) => (
            <option key={k} value={k}>{ar ? arL : en}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-600 mb-1">
          {ar ? 'أي تفاصيل إضافية؟ (إن ظهرت رسالة خطأ، الصقها هنا)' : 'Anything else? (If you saw an error message, paste it here)'}
        </label>
        <textarea
          dir={ar ? 'rtl' : 'ltr'}
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-600 mb-1">
          {ar ? 'صورة للشاشة (اختياري — الأكثر فائدة)' : 'Screenshot (optional — the most useful thing you can send)'}
        </label>
        <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
          <Upload className="h-4 w-4 text-slate-500" />
          {file ? file.name : (ar ? 'اختر صورة' : 'Choose an image')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {ar ? 'إرسال' : 'Send request'}
        </button>
      </div>
    </div>
  );
}

function labelOf(list: [string, string, string][], key: string, ar: boolean): string {
  const found = list.find(([k]) => k === key);
  return found ? (ar ? found[2] : found[1]) : key;
}

const SEL =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900';
