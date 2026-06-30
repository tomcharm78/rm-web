'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star, MessageSquare, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/providers/language-provider';
import { getSurveyResults, type QuestionResult } from '@/lib/surveys/results-queries';
import { questionTypeLabel, statusLabel, statusColor } from '@/types/survey';

export default function SurveyResultsPage() {
  const params = useParams();
  const surveyId = String(params.id);
  const { language } = useLanguage();
  const ar = language === 'ar';

  const resultsQ = useQuery({ queryKey: ['survey-results', surveyId], queryFn: () => getSurveyResults(surveyId) });
  const data = resultsQ.data;

  if (resultsQ.isLoading) return <div className="p-8 text-slate-400">{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>;
  if (!data) return <div className="p-8 text-slate-400">{ar ? 'الاستبيان غير موجود' : 'Survey not found'}</div>;

  const { survey, responseCount, questions } = data;
  const title = ar ? survey.titleAr || survey.title : survey.title || survey.titleAr;

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-8">
      <Link href="/surveys" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ar ? 'الاستبيانات' : 'Surveys'}
      </Link>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-semibold text-slate-800">{title || (ar ? '(بدون عنوان)' : '(untitled)')}</h1>
        <span className={'rounded px-2 py-0.5 text-xs shrink-0 ' + statusColor(survey.status)}>{statusLabel(survey.status, ar)}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <BarChart3 className="h-4 w-4" />
        <span className="font-medium text-slate-700">{responseCount}</span> {ar ? 'استجابة' : 'responses'}
        {survey.isAnonymous && <span className="text-xs text-slate-400">· {ar ? 'مجهول' : 'anonymous'}</span>}
      </div>

      {responseCount === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">
          <p className="text-sm">{ar ? 'لا توجد استجابات بعد.' : 'No responses yet.'}</p>
        </div>
      )}

      <div className="space-y-4">
        {responseCount > 0 && questions.map((qr, idx) => (
          <div key={qr.question.id} className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <p className="font-medium text-slate-800">
                <span className="text-slate-400 me-1">{idx + 1}.</span>
                {ar ? qr.question.questionAr || qr.question.question : qr.question.question || qr.question.questionAr}
              </p>
              <span className="text-[11px] rounded bg-slate-100 text-slate-500 px-1.5 py-0.5 shrink-0">{questionTypeLabel(qr.question.qType, ar)}</span>
            </div>
            <ResultView qr={qr} ar={ar} />
            <p className="text-[11px] text-slate-400 mt-3">{qr.answered} {ar ? 'إجابة' : 'answered'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-700">{label}</span>
        <span className="text-slate-400 text-xs">{count} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ResultView({ qr, ar }: { qr: QuestionResult; ar: boolean }) {
  const q = qr.question;

  if ((q.qType === 'single_choice' || q.qType === 'multi_choice') && qr.optionCounts) {
    const total = qr.optionCounts.reduce((s, o) => s + o.count, 0);
    return (
      <div>
        {qr.optionCounts.map((o) => (
          <Bar key={o.optionId} label={(ar ? o.labelAr || o.label : o.label || o.labelAr) || '—'} count={o.count} total={total} />
        ))}
      </div>
    );
  }

  if (q.qType === 'rating' && qr.ratingDist) {
    const total = qr.ratingDist.reduce((s, n) => s + n, 0);
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={'h-5 w-5 ' + (n <= Math.round(qr.ratingAvg ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200')} />
            ))}
          </div>
          <span className="text-lg font-semibold text-slate-800">{(qr.ratingAvg ?? 0).toFixed(1)}</span>
          <span className="text-xs text-slate-400">/ 5</span>
        </div>
        {[5, 4, 3, 2, 1].map((stars) => (
          <Bar key={stars} label={`${stars} ★`} count={qr.ratingDist![stars - 1]} total={total} />
        ))}
      </div>
    );
  }

  if (q.qType === 'yes_no') {
    const total = (qr.yesCount ?? 0) + (qr.noCount ?? 0);
    return (
      <div>
        <Bar label={ar ? 'نعم' : 'Yes'} count={qr.yesCount ?? 0} total={total} />
        <Bar label={ar ? 'لا' : 'No'} count={qr.noCount ?? 0} total={total} />
      </div>
    );
  }

  if (q.qType === 'short_text') {
    const list = qr.textAnswers ?? [];
    if (list.length === 0) return <p className="text-sm text-slate-400">{ar ? 'لا إجابات نصية.' : 'No text answers.'}</p>;
    return (
      <ul className="space-y-2">
        {list.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600 bg-slate-50 rounded-md px-3 py-2">
            <MessageSquare className="h-3.5 w-3.5 text-slate-300 mt-0.5 shrink-0" />
            <span dir="auto">{t}</span>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
