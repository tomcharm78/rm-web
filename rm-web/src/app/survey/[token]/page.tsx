'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Star, Loader2, Check, AlertCircle } from 'lucide-react';

type Q = {
  id: string; question: string; question_ar: string;
  q_type: string; options: { id: string; label: string; labelAr: string }[];
  is_required: boolean;
};
type SurveyMeta = {
  id: string; title: string; titleAr: string;
  description: string; descriptionAr: string;
  isAnonymous: boolean; collectRespondentInfo: boolean; isGeneric: boolean;
};

export default function PublicSurveyPage() {
  const params = useParams();
  const token = String(params.token);

  // form is bilingual; default to Arabic layout (RTL) but show both labels.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<SurveyMeta | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public-survey?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'invalid_token'); return; }
        setSurvey(data.survey);
        setQuestions(data.questions);
      } catch {
        setError('network');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const setAnswer = (qid: string, value: unknown) => setAnswers((a) => ({ ...a, [qid]: value }));

  const toggleMulti = (qid: string, optId: string) => {
    setAnswers((a) => {
      const cur = Array.isArray(a[qid]) ? (a[qid] as string[]) : [];
      return { ...a, [qid]: cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId] };
    });
  };

  const submit = async () => {
    // client-side required check
    for (const q of questions) {
      if (q.is_required) {
        const v = answers[q.id];
        const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        if (empty) { setError('missing_required'); window.scrollTo({ top: 0 }); return; }
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/public-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
          respondentName: name, respondentEmail: email,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'submit_failed'); return; }
      setDone(true);
    } catch {
      setError('network');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Centered><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></Centered>;
  }

  if (error && !survey) {
    return (
      <Centered>
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <p className="text-slate-700">{errorText(error)}</p>
        </div>
      </Centered>
    );
  }

  if (done) {
    return (
      <Centered>
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <p className="text-lg font-medium text-slate-800">شكرًا لمشاركتكم</p>
          <p className="text-slate-500 mt-1">Thank you — your response has been recorded.</p>
        </div>
      </Centered>
    );
  }

  if (!survey) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* header */}
        <div className="bg-white rounded-t-xl border border-slate-200 border-b-0 p-6">
          <h1 className="text-xl font-semibold text-slate-900" dir="rtl">{survey.titleAr || survey.title}</h1>
          <h2 className="text-lg text-slate-700" dir="ltr">{survey.title || survey.titleAr}</h2>
          {(survey.descriptionAr || survey.description) && (
            <>
              <p className="text-sm text-slate-500 mt-2" dir="rtl">{survey.descriptionAr || survey.description}</p>
              <p className="text-sm text-slate-500" dir="ltr">{survey.description || survey.descriptionAr}</p>
            </>
          )}
        </div>

        {error === 'missing_required' && (
          <div className="bg-red-50 border-x border-red-200 px-6 py-2 text-sm text-red-600 text-center">
            الرجاء الإجابة على جميع الأسئلة المطلوبة · Please answer all required questions
          </div>
        )}

        {/* questions */}
        <div className="bg-white border border-slate-200 border-t-0 divide-y divide-slate-100">
          {questions.map((q, idx) => (
            <div key={q.id} className="p-6">
              <div className="mb-3">
                <p className="font-medium text-slate-800" dir="rtl">
                  <span className="text-slate-400 me-1">{idx + 1}.</span>{q.question_ar || q.question}
                  {q.is_required && <span className="text-red-500 ms-1">*</span>}
                </p>
                {(q.question && q.question_ar) && <p className="text-sm text-slate-500" dir="ltr">{q.question}</p>}
              </div>
              <QuestionField q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} onToggleMulti={(optId) => toggleMulti(q.id, optId)} />
            </div>
          ))}

          {/* collect respondent info (generic link + opted in + not anonymous) */}
          {survey.isGeneric && survey.collectRespondentInfo && !survey.isAnonymous && (
            <div className="p-6 space-y-3 bg-slate-50/50">
              <p className="text-sm text-slate-500" dir="rtl">معلومات اختيارية · Optional</p>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم · Name"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد · Email" dir="ltr"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        {/* submit */}
        <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-6">
          <button onClick={submit} disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 text-sm font-medium disabled:opacity-60">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            إرسال · Submit
          </button>
          {survey.isAnonymous && (
            <p className="text-[11px] text-slate-400 text-center mt-2" dir="rtl">هذا الاستبيان مجهول الهوية · This survey is anonymous</p>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionField({ q, value, onChange, onToggleMulti }: {
  q: Q; value: unknown; onChange: (v: unknown) => void; onToggleMulti: (optId: string) => void;
}) {
  if (q.q_type === 'rating') {
    const cur = typeof value === 'number' ? value : 0;
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}>
            <Star className={'h-8 w-8 ' + (n <= cur ? 'text-amber-400 fill-amber-400' : 'text-slate-300')} />
          </button>
        ))}
      </div>
    );
  }
  if (q.q_type === 'yes_no') {
    return (
      <div className="flex gap-2">
        {[['yes', 'نعم · Yes'], ['no', 'لا · No']].map(([val, label]) => (
          <button key={val} type="button" onClick={() => onChange(val)}
            className={'flex-1 rounded-md border py-2 text-sm ' + (value === val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600')}>
            {label}
          </button>
        ))}
      </div>
    );
  }
  if (q.q_type === 'short_text') {
    return (
      <textarea value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} rows={3}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" dir="auto" />
    );
  }
  if (q.q_type === 'single_choice') {
    return (
      <div className="space-y-2">
        {q.options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.id)}
            className={'w-full text-start rounded-md border px-3 py-2 text-sm flex items-center gap-2 ' + (value === o.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200')}>
            <span className={'h-3.5 w-3.5 rounded-full border shrink-0 ' + (value === o.id ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300')} />
            <span className="flex flex-col gap-0.5 min-w-0 flex-1"><span dir="rtl" className="text-start">{o.labelAr || o.label}</span>{o.label && o.labelAr && <span dir="ltr" className="text-xs text-slate-500 text-start">{o.label}</span>}</span>
          </button>
        ))}
      </div>
    );
  }
  if (q.q_type === 'multi_choice') {
    const cur = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-2">
        {q.options.map((o) => (
          <button key={o.id} type="button" onClick={() => onToggleMulti(o.id)}
            className={'w-full text-start rounded-md border px-3 py-2 text-sm flex items-center gap-2 ' + (cur.includes(o.id) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200')}>
            <span className={'h-3.5 w-3.5 rounded-sm border shrink-0 flex items-center justify-center ' + (cur.includes(o.id) ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300')}>
              {cur.includes(o.id) && <Check className="h-2.5 w-2.5 text-white" />}
            </span>
            <span className="flex flex-col gap-0.5 min-w-0 flex-1"><span dir="rtl" className="text-start">{o.labelAr || o.label}</span>{o.label && o.labelAr && <span dir="ltr" className="text-xs text-slate-500 text-start">{o.label}</span>}</span>
          </button>
        ))}
      </div>
    );
  }
  return null;
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">{children}</div>;
}

function errorText(code: string): string {
  const m: Record<string, string> = {
    invalid_token: 'هذا الرابط غير صالح · This link is not valid.',
    survey_closed: 'هذا الاستبيان مغلق حاليًا · This survey is closed.',
    already_submitted: 'تم استلام ردك مسبقًا · Your response was already submitted.',
    network: 'تعذّر الاتصال · Connection error.',
  };
  return m[code] ?? 'حدث خطأ · Something went wrong.';
}
