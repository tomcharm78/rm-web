import { createClient } from '@/lib/supabase/client';
import {
  type Survey, type SurveyQuestion, type SurveyStatus, type QuestionType, type QuestionOption,
  rowToSurvey, rowToQuestion,
} from '@/types/survey';

// ---- surveys ----

export async function listSurveys(): Promise<(Survey & { responseCount: number })[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('surveys').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const surveys = (data ?? []).map((r) => rowToSurvey(r));

  // response counts per survey (one grouped query)
  const { data: respRows } = await supabase.from('survey_responses').select('survey_id');
  const counts = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (respRows ?? []) as any[]) {
    counts.set(r.survey_id, (counts.get(r.survey_id) ?? 0) + 1);
  }
  return surveys.map((s) => ({ ...s, responseCount: counts.get(s.id) ?? 0 }));
}

export async function getSurvey(id: string): Promise<Survey | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('surveys').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSurvey(data) : null;
}

export async function getSurveyQuestions(surveyId: string): Promise<SurveyQuestion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('survey_questions').select('*').eq('survey_id', surveyId).order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToQuestion(r));
}

export type SurveyInput = {
  title: string; titleAr: string;
  description: string; descriptionAr: string;
  isAnonymous: boolean; collectRespondentInfo: boolean;
};

export async function createSurvey(input: SurveyInput): Promise<Survey> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  const { data: appUser } = await supabase.from('users').select('organization_id').eq('id', user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (appUser as any)?.organization_id;

  const { data, error } = await supabase.from('surveys').insert({
    title: input.title, title_ar: input.titleAr,
    description: input.description, description_ar: input.descriptionAr,
    is_anonymous: input.isAnonymous, collect_respondent_info: input.collectRespondentInfo,
    status: 'draft',
    created_by_id: user.id, organization_id: orgId,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToSurvey(data);
}

export async function updateSurvey(id: string, input: SurveyInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('surveys').update({
    title: input.title, title_ar: input.titleAr,
    description: input.description, description_ar: input.descriptionAr,
    is_anonymous: input.isAnonymous, collect_respondent_info: input.collectRespondentInfo,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setSurveyStatus(id: string, status: SurveyStatus): Promise<void> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { status, updated_at: new Date().toISOString() };
  if (status === 'closed') patch.closed_at = new Date().toISOString();
  const { error } = await supabase.from('surveys').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSurvey(id: string): Promise<void> {
  const supabase = createClient();
  // hard delete cascades questions/distributions/responses via FK
  const { error } = await supabase.from('surveys').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- questions ----

export type QuestionInput = {
  question: string; questionAr: string;
  qType: QuestionType;
  options: QuestionOption[];
  isRequired: boolean;
  sortOrder: number;
};

export async function addQuestion(surveyId: string, input: QuestionInput): Promise<SurveyQuestion> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  const { data: appUser } = await supabase.from('users').select('organization_id').eq('id', user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgId = (appUser as any)?.organization_id;

  const { data, error } = await supabase.from('survey_questions').insert({
    survey_id: surveyId,
    question: input.question, question_ar: input.questionAr,
    q_type: input.qType, options: input.options,
    is_required: input.isRequired, sort_order: input.sortOrder,
    organization_id: orgId,
  }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToQuestion(data);
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('survey_questions').update({
    question: input.question, question_ar: input.questionAr,
    q_type: input.qType, options: input.options,
    is_required: input.isRequired, sort_order: input.sortOrder,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteQuestion(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('survey_questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// persist new order after drag/reorder
export async function reorderQuestions(ids: string[]): Promise<void> {
  const supabase = createClient();
  await Promise.all(ids.map((id, idx) =>
    supabase.from('survey_questions').update({ sort_order: idx }).eq('id', id)
  ));
}
