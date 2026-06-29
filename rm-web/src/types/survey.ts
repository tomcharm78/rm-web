// Survey module types. DB rows (snake_case) + canonical (camelCase) + mappers.

export type SurveyStatus = 'draft' | 'active' | 'closed';

export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'rating'        // 1–5 stars
  | 'short_text'
  | 'yes_no';

export const QUESTION_TYPES: { value: QuestionType; en: string; ar: string }[] = [
  { value: 'single_choice', en: 'Single choice', ar: 'اختيار واحد' },
  { value: 'multi_choice',  en: 'Multiple choice', ar: 'اختيار متعدد' },
  { value: 'rating',        en: 'Rating (stars)', ar: 'تقييم (نجوم)' },
  { value: 'short_text',    en: 'Short text', ar: 'نص قصير' },
  { value: 'yes_no',        en: 'Yes / No', ar: 'نعم / لا' },
];

export function questionTypeLabel(t: string, ar: boolean): string {
  const f = QUESTION_TYPES.find((x) => x.value === t);
  return f ? (ar ? f.ar : f.en) : t;
}

// ---- Survey ----
export type Survey = {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  status: SurveyStatus;
  isAnonymous: boolean;
  collectRespondentInfo: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToSurvey(r: any): Survey {
  return {
    id: r.id,
    title: r.title ?? '',
    titleAr: r.title_ar ?? '',
    description: r.description ?? '',
    descriptionAr: r.description_ar ?? '',
    status: r.status ?? 'draft',
    isAnonymous: !!r.is_anonymous,
    collectRespondentInfo: !!r.collect_respondent_info,
    createdById: r.created_by_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at ?? null,
  };
}

// ---- Question ----
// options is a list of {value, label, labelAr} for choice types; empty otherwise.
export type QuestionOption = { id: string; label: string; labelAr: string };

export type SurveyQuestion = {
  id: string;
  surveyId: string;
  question: string;
  questionAr: string;
  qType: QuestionType;
  options: QuestionOption[];
  isRequired: boolean;
  sortOrder: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToQuestion(r: any): SurveyQuestion {
  let opts: QuestionOption[] = [];
  try {
    const raw = typeof r.options === 'string' ? JSON.parse(r.options) : r.options;
    if (Array.isArray(raw)) opts = raw;
  } catch { opts = []; }
  return {
    id: r.id,
    surveyId: r.survey_id,
    question: r.question ?? '',
    questionAr: r.question_ar ?? '',
    qType: r.q_type,
    options: opts,
    isRequired: !!r.is_required,
    sortOrder: r.sort_order ?? 0,
  };
}

export function statusLabel(s: string, ar: boolean): string {
  const m: Record<string, [string, string]> = {
    draft: ['Draft', 'مسودة'],
    active: ['Active', 'نشط'],
    closed: ['Closed', 'مغلق'],
  };
  return m[s] ? (ar ? m[s][1] : m[s][0]) : s;
}

export function statusColor(s: string): string {
  switch (s) {
    case 'active': return 'bg-emerald-100 text-emerald-700';
    case 'closed': return 'bg-slate-200 text-slate-600';
    default: return 'bg-amber-100 text-amber-700'; // draft
  }
}

// choice types need an options editor
export function typeNeedsOptions(t: QuestionType): boolean {
  return t === 'single_choice' || t === 'multi_choice';
}
