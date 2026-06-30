import { createClient } from '@/lib/supabase/client';
import { getSurvey, getSurveyQuestions } from '@/lib/surveys/queries';
import type { Survey, SurveyQuestion } from '@/types/survey';

// Aggregated result for one question — shape is Dashboard-ready.
export type QuestionResult = {
  question: SurveyQuestion;
  answered: number;            // how many responses answered this question
  // choice types: count per option id
  optionCounts?: { optionId: string; label: string; labelAr: string; count: number }[];
  // rating: average + distribution 1..5
  ratingAvg?: number;
  ratingDist?: number[];       // index 0..4 → stars 1..5
  // yes/no: counts
  yesCount?: number;
  noCount?: number;
  // short_text: the raw answers
  textAnswers?: string[];
};

export type SurveyResults = {
  survey: Survey;
  responseCount: number;
  questions: QuestionResult[];
};

export async function getSurveyResults(surveyId: string): Promise<SurveyResults | null> {
  const supabase = createClient();

  const survey = await getSurvey(surveyId);
  if (!survey) return null;
  const questions = await getSurveyQuestions(surveyId);

  // total responses
  const { data: responses } = await supabase
    .from('survey_responses').select('id').eq('survey_id', surveyId);
  const responseCount = (responses ?? []).length;

  // all answers for this survey's responses (join via question_id belonging to the survey)
  const questionIds = questions.map((q) => q.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let answers: any[] = [];
  if (questionIds.length) {
    const { data } = await supabase
      .from('survey_answers').select('question_id, answer').in('question_id', questionIds);
    answers = data ?? [];
  }

  // group answers by question
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byQ = new Map<string, any[]>();
  for (const a of answers) {
    const list = byQ.get(a.question_id) ?? [];
    list.push(a.answer);
    byQ.set(a.question_id, list);
  }

  const results: QuestionResult[] = questions.map((q) => {
    const raw = byQ.get(q.id) ?? [];
    const answered = raw.length;
    const r: QuestionResult = { question: q, answered };

    if (q.qType === 'single_choice' || q.qType === 'multi_choice') {
      const counts = new Map<string, number>();
      for (const v of raw) {
        const ids = Array.isArray(v) ? v : [v];
        for (const id of ids) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
      }
      r.optionCounts = q.options.map((o) => ({
        optionId: o.id, label: o.label, labelAr: o.labelAr, count: counts.get(o.id) ?? 0,
      }));
    } else if (q.qType === 'rating') {
      const dist = [0, 0, 0, 0, 0];
      let sum = 0, n = 0;
      for (const v of raw) {
        const num = Number(v);
        if (num >= 1 && num <= 5) { dist[num - 1]++; sum += num; n++; }
      }
      r.ratingDist = dist;
      r.ratingAvg = n > 0 ? sum / n : 0;
    } else if (q.qType === 'yes_no') {
      let y = 0, no = 0;
      for (const v of raw) { if (v === 'yes') y++; else if (v === 'no') no++; }
      r.yesCount = y; r.noCount = no;
    } else if (q.qType === 'short_text') {
      r.textAnswers = raw.map((v) => String(v ?? '')).filter((s) => s.trim());
    }
    return r;
  });

  return { survey, responseCount, questions: results };
}
