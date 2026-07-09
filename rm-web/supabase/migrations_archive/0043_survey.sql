-- =====================================================================
-- 0043  SURVEY MODULE — SurveyMonkey-lite (Google-Forms-style external path)
--
-- surveys              : the reusable definition
-- survey_questions     : questions belonging to a survey
-- survey_distributions : a run/send (internal | email | link), holds generic token
-- survey_tokens        : per-respondent tokens (internal assignment / per-investor email)
-- survey_responses     : one submission
-- survey_answers       : one answer per question per response
--
-- Internal reads gated org + non-stakeholder. The PUBLIC no-login form path
-- does NOT use RLS — it goes through a narrow service-role server route.
--
-- Run BLOCK BY BLOCK in the Supabase SQL editor (single-line statements).
-- =====================================================================


-- ---- BLOCK 1: surveys ----
create table if not exists public.surveys (id uuid primary key default gen_random_uuid(), title text not null default '', title_ar text not null default '', description text not null default '', description_ar text not null default '', status text not null default 'draft', is_anonymous boolean not null default false, collect_respondent_info boolean not null default false, created_by_id uuid not null references public.users(id), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz);


-- ---- BLOCK 2: survey_questions ----
create table if not exists public.survey_questions (id uuid primary key default gen_random_uuid(), survey_id uuid not null references public.surveys(id) on delete cascade, question text not null default '', question_ar text not null default '', q_type text not null, options jsonb not null default '[]'::jsonb, is_required boolean not null default false, sort_order int not null default 0, organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now());


-- ---- BLOCK 3: survey_distributions ----
create table if not exists public.survey_distributions (id uuid primary key default gen_random_uuid(), survey_id uuid not null references public.surveys(id) on delete cascade, channel text not null, generic_token text unique, label text not null default '', created_by_id uuid not null references public.users(id), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now(), closed_at timestamptz);


-- ---- BLOCK 4: survey_tokens (per-respondent links) ----
create table if not exists public.survey_tokens (id uuid primary key default gen_random_uuid(), distribution_id uuid not null references public.survey_distributions(id) on delete cascade, token text not null unique, investor_id uuid references public.investors(id) on delete set null, user_id uuid references public.users(id) on delete set null, used_at timestamptz, organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now());


-- ---- BLOCK 5: survey_responses ----
create table if not exists public.survey_responses (id uuid primary key default gen_random_uuid(), survey_id uuid not null references public.surveys(id) on delete cascade, distribution_id uuid references public.survey_distributions(id) on delete set null, token_id uuid references public.survey_tokens(id) on delete set null, respondent_user_id uuid references public.users(id) on delete set null, respondent_investor_id uuid references public.investors(id) on delete set null, respondent_name text not null default '', respondent_email text not null default '', is_anonymous boolean not null default false, organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), submitted_at timestamptz not null default now());


-- ---- BLOCK 6: survey_answers ----
create table if not exists public.survey_answers (id uuid primary key default gen_random_uuid(), response_id uuid not null references public.survey_responses(id) on delete cascade, question_id uuid not null references public.survey_questions(id) on delete cascade, answer jsonb not null default '"null"'::jsonb, organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now());


-- ---- BLOCK 7: indexes ----
create index if not exists survey_questions_survey_idx on public.survey_questions (survey_id, sort_order);
create index if not exists survey_distributions_survey_idx on public.survey_distributions (survey_id);
create index if not exists survey_tokens_dist_idx on public.survey_tokens (distribution_id);
create index if not exists survey_tokens_token_idx on public.survey_tokens (token);
create index if not exists survey_responses_survey_idx on public.survey_responses (survey_id);
create index if not exists survey_answers_response_idx on public.survey_answers (response_id);
create index if not exists survey_answers_question_idx on public.survey_answers (question_id);


-- ---- BLOCK 8: enable RLS ----
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_distributions enable row level security;
alter table public.survey_tokens enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;


-- ---- BLOCK 9: RLS — internal reads (org member, not stakeholder); writes for surveys/questions/distributions via authenticated managers; responses/answers WRITTEN by service-role route (public path) so no insert policy needed; internal staff read results ----
create policy surveys_read on public.surveys for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
create policy surveys_write on public.surveys for all using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder()) with check (organization_id = public.current_user_organization_id());
create policy survey_questions_read on public.survey_questions for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
create policy survey_questions_write on public.survey_questions for all using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder()) with check (organization_id = public.current_user_organization_id());
create policy survey_distributions_read on public.survey_distributions for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
create policy survey_distributions_write on public.survey_distributions for all using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder()) with check (organization_id = public.current_user_organization_id());
create policy survey_tokens_read on public.survey_tokens for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
create policy survey_tokens_write on public.survey_tokens for all using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder()) with check (organization_id = public.current_user_organization_id());
create policy survey_responses_read on public.survey_responses for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
create policy survey_answers_read on public.survey_answers for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());


-- ---- BLOCK 10: manage_surveys permission (run ALONE — enum value can't be used in same txn) ----
alter type public.user_permission add value if not exists 'manage_surveys';
-- then (separately) backfill admins/supers if desired:
-- update public.users set permissions = array_append(permissions, 'manage_surveys'::public.user_permission) where role in ('admin','super_admin') and not ('manage_surveys' = any(permissions));


-- ---- BLOCK 11: schema cache reload ----
notify pgrst, 'reload schema';
