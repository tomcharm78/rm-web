// /api/public-survey — the ONLY path that touches survey responses from the
// public (no-login) form. Deliberately narrow: it can validate a token, return
// that survey's questions, and write exactly one response. Nothing else.
//
// GET  ?token=...            → { survey, questions } (or error)
// POST { token, answers, respondentName?, respondentEmail? } → writes one response
//
// Uses the service role (bypasses RLS) but is scoped to this one job.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// resolve a token → { distribution, survey, tokenRow|null, isGeneric }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveToken(db: any, token: string) {
  // try generic token on a distribution first
  const { data: genDist } = await db
    .from('survey_distributions')
    .select('id, survey_id, organization_id, closed_at, generic_token')
    .eq('generic_token', token).maybeSingle();
  if (genDist) {
    return { distribution: genDist, tokenRow: null, isGeneric: true };
  }
  // else a per-investor token
  const { data: tok } = await db
    .from('survey_tokens')
    .select('id, distribution_id, investor_id, used_at, organization_id')
    .eq('token', token).maybeSingle();
  if (!tok) return null;
  const { data: dist } = await db
    .from('survey_distributions')
    .select('id, survey_id, organization_id, closed_at, generic_token')
    .eq('id', tok.distribution_id).maybeSingle();
  if (!dist) return null;
  return { distribution: dist, tokenRow: tok, isGeneric: false };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  const db = admin();
  const resolved = await resolveToken(db, token);
  if (!resolved) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });

  const { distribution, tokenRow, isGeneric } = resolved;

  const { data: survey } = await db
    .from('surveys')
    .select('id, title, title_ar, description, description_ar, status, is_anonymous, collect_respondent_info')
    .eq('id', distribution.survey_id).maybeSingle();
  if (!survey) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });

  if (survey.status !== 'active') {
    return NextResponse.json({ error: 'survey_closed' }, { status: 403 });
  }
  // per-investor token already used → block (one response each)
  if (!isGeneric && tokenRow?.used_at) {
    return NextResponse.json({ error: 'already_submitted' }, { status: 409 });
  }

  const { data: questions } = await db
    .from('survey_questions')
    .select('id, question, question_ar, q_type, options, is_required, sort_order')
    .eq('survey_id', survey.id)
    .order('sort_order', { ascending: true });

  return NextResponse.json({
    survey: {
      id: survey.id,
      title: survey.title, titleAr: survey.title_ar,
      description: survey.description, descriptionAr: survey.description_ar,
      isAnonymous: survey.is_anonymous,
      collectRespondentInfo: survey.collect_respondent_info,
      isGeneric,
    },
    questions: questions ?? [],
  });
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  const token: string = body.token;
  // answers: [{ questionId, value }]   value = string | string[] | number
  const answers: { questionId: string; value: unknown }[] = Array.isArray(body.answers) ? body.answers : [];
  const respondentName: string = (body.respondentName ?? '').toString().slice(0, 200);
  const respondentEmail: string = (body.respondentEmail ?? '').toString().slice(0, 200);

  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

  const db = admin();
  const resolved = await resolveToken(db, token);
  if (!resolved) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });
  const { distribution, tokenRow, isGeneric } = resolved;

  const { data: survey } = await db
    .from('surveys').select('id, status, is_anonymous, organization_id').eq('id', distribution.survey_id).maybeSingle();
  if (!survey) return NextResponse.json({ error: 'invalid_token' }, { status: 404 });
  if (survey.status !== 'active') return NextResponse.json({ error: 'survey_closed' }, { status: 403 });
  if (!isGeneric && tokenRow?.used_at) return NextResponse.json({ error: 'already_submitted' }, { status: 409 });

  // validate required questions are answered
  const { data: questions } = await db
    .from('survey_questions').select('id, is_required, q_type').eq('survey_id', survey.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qMap = new Map((questions ?? []).map((q: any) => [q.id, q]));
  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const q of (questions ?? []) as any[]) {
    if (q.is_required) {
      const v = answerMap.get(q.id);
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) return NextResponse.json({ error: 'missing_required' }, { status: 400 });
    }
  }

  const anon = !!survey.is_anonymous;

  // write the response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respInsert: any = {
    survey_id: survey.id,
    distribution_id: distribution.id,
    token_id: tokenRow?.id ?? null,
    is_anonymous: anon,
    organization_id: survey.organization_id,
  };
  if (!anon) {
    respInsert.respondent_investor_id = tokenRow?.investor_id ?? null;
    respInsert.respondent_name = respondentName;
    respInsert.respondent_email = respondentEmail;
  }

  const { data: resp, error: respErr } = await db.from('survey_responses').insert(respInsert).select('id').single();
  if (respErr) return NextResponse.json({ error: 'write_failed', message: respErr.message }, { status: 500 });

  // write answers (only for known questions)
  const answerRows = answers
    .filter((a) => qMap.has(a.questionId))
    .map((a) => ({
      response_id: resp.id,
      question_id: a.questionId,
      answer: a.value === undefined ? null : a.value,
      organization_id: survey.organization_id,
    }));
  if (answerRows.length > 0) {
    const { error: aErr } = await db.from('survey_answers').insert(answerRows);
    if (aErr) return NextResponse.json({ error: 'answers_failed', message: aErr.message }, { status: 500 });
  }

  // mark per-investor token used (one response each)
  if (!isGeneric && tokenRow?.id) {
    await db.from('survey_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id);
  }

  return NextResponse.json({ ok: true });
}
