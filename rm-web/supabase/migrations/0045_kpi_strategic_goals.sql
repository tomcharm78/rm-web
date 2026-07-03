-- =====================================================================
-- 0045  KPI / STRATEGIC GOALS MODULE  (slice 1)
--
-- strategic_goals   : org + deputyship tiers (super-admin-set). Org goals
--                     are qualitative (targets nullable); deputyship goals
--                     carry the quarterly numbers.
-- department_goals  : admin-set, each REQUIRED to link up to a deputyship
--                     goal (the alignment enforcement point). Quarterly
--                     targets required.
-- task_goals        : join — a task can link to MANY department goals.
-- challenge_goals   : join — a challenge can link to MANY department goals.
--
-- Gating: module_key 'kpis' already seeded in org_module_settings.
-- Run BLOCK BY BLOCK single-line in the Supabase SQL editor.
-- =====================================================================


-- ---- BLOCK 1: strategic_goals (org + deputyship) ----
create table if not exists public.strategic_goals (id uuid primary key default gen_random_uuid(), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), tier text not null check (tier in ('organization','deputyship')), parent_goal_id uuid references public.strategic_goals(id) on delete set null, title text not null, title_ar text not null default '', description text not null default '', description_ar text not null default '', year int not null, q1_target int, q2_target int, q3_target int, q4_target int, status text not null default 'active' check (status in ('active','archived')), created_by_id uuid references public.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());


-- ---- BLOCK 2: department_goals (admin-set, links up to a deputyship goal) ----
create table if not exists public.department_goals (id uuid primary key default gen_random_uuid(), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), department_id uuid not null references public.departments(id) on delete cascade, deputyship_goal_id uuid not null references public.strategic_goals(id) on delete restrict, title text not null, title_ar text not null default '', description text not null default '', description_ar text not null default '', year int not null, q1_target int not null default 0, q2_target int not null default 0, q3_target int not null default 0, q4_target int not null default 0, status text not null default 'active' check (status in ('active','archived')), created_by_id uuid references public.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());


-- ---- BLOCK 3: task_goals (join — task ↔ department_goal, many-to-many) ----
create table if not exists public.task_goals (id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade, department_goal_id uuid not null references public.department_goals(id) on delete cascade, linked_by_id uuid references public.users(id), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now());


-- ---- BLOCK 4: challenge_goals (join — challenge ↔ department_goal) ----
create table if not exists public.challenge_goals (id uuid primary key default gen_random_uuid(), challenge_id uuid not null references public.challenges(id) on delete cascade, department_goal_id uuid not null references public.department_goals(id) on delete cascade, linked_by_id uuid references public.users(id), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now());


-- ---- BLOCK 5: unique links (no duplicate task↔goal / challenge↔goal) ----
create unique index if not exists task_goals_uniq on public.task_goals (task_id, department_goal_id);
create unique index if not exists challenge_goals_uniq on public.challenge_goals (challenge_id, department_goal_id);


-- ---- BLOCK 6: lookup indexes ----
create index if not exists strategic_goals_tier_year_idx on public.strategic_goals (organization_id, tier, year);
create index if not exists department_goals_dept_year_idx on public.department_goals (department_id, year);
create index if not exists department_goals_deputyship_idx on public.department_goals (deputyship_goal_id);
create index if not exists task_goals_goal_idx on public.task_goals (department_goal_id);
create index if not exists challenge_goals_goal_idx on public.challenge_goals (department_goal_id);


-- ---- BLOCK 7: enable RLS ----
alter table public.strategic_goals enable row level security;
alter table public.department_goals enable row level security;
alter table public.task_goals enable row level security;
alter table public.challenge_goals enable row level security;


-- ---- BLOCK 8: strategic_goals read (any org member, not stakeholder) ----
create policy strategic_goals_read on public.strategic_goals for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());


-- ---- BLOCK 9 (run alone): strategic_goals write — super admin only ----
create policy strategic_goals_write on public.strategic_goals for all using (organization_id = public.current_user_organization_id() and public.current_user_is_super()) with check (organization_id = public.current_user_organization_id() and public.current_user_is_super());


-- ---- BLOCK 10: department_goals read (super all; others their department) ----
create policy department_goals_read on public.department_goals for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder() and (public.current_user_is_super() or department_id = public.current_user_department_id()));


-- ---- BLOCK 11 (run alone): department_goals write — super any; admin their own department ----
create policy department_goals_write on public.department_goals for all using (organization_id = public.current_user_organization_id() and (public.current_user_is_super() or (department_id = public.current_user_department_id() and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')))) with check (organization_id = public.current_user_organization_id());


-- ---- BLOCK 12: task_goals read (follows org, not stakeholder) ----
create policy task_goals_read on public.task_goals for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());


-- ---- BLOCK 13 (run alone): task_goals write — super or admin ----
create policy task_goals_write on public.task_goals for all using (organization_id = public.current_user_organization_id() and (public.current_user_is_super() or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))) with check (organization_id = public.current_user_organization_id());


-- ---- BLOCK 14: challenge_goals read ----
create policy challenge_goals_read on public.challenge_goals for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());


-- ---- BLOCK 15 (run alone): challenge_goals write — super or admin ----
create policy challenge_goals_write on public.challenge_goals for all using (organization_id = public.current_user_organization_id() and (public.current_user_is_super() or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))) with check (organization_id = public.current_user_organization_id());


-- ---- BLOCK 16: schema cache reload ----
notify pgrst, 'reload schema';
