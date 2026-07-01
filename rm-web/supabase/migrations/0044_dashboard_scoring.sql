-- =====================================================================
-- 0044  DASHBOARD SCORING — composite performance index
--
-- performance_weights   : org-wide (and optional per-department) weighting
--                         of Volume / Timeliness / Outcomes.
-- monthly_performance   : recorded score per user per month (snapshot-ready;
--                         v1 computes live, this table lets us freeze later).
--
-- Run BLOCK BY BLOCK single-line in the Supabase SQL editor.
-- =====================================================================


-- ---- BLOCK 1: performance_weights (org default + optional per-dept) ----
create table if not exists public.performance_weights (id uuid primary key default gen_random_uuid(), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), department_id uuid references public.departments(id) on delete cascade, volume_weight int not null default 40, timeliness_weight int not null default 30, outcomes_weight int not null default 30, updated_by_id uuid references public.users(id), updated_at timestamptz not null default now());


-- ---- BLOCK 2: one org-wide default row (department_id null = the org default) ----
insert into public.performance_weights (organization_id, department_id, volume_weight, timeliness_weight, outcomes_weight) values ('00000000-0000-0000-0000-000000000001'::uuid, null, 40, 30, 30) on conflict do nothing;


-- ---- BLOCK 3: unique — one weight row per (org, department) incl the null-dept org default ----
create unique index if not exists performance_weights_org_dept_uniq on public.performance_weights (organization_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));


-- ---- BLOCK 4: monthly_performance (recorded score per user per month) ----
create table if not exists public.monthly_performance (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade, year_month text not null, department_id uuid references public.departments(id) on delete set null, tasks_closed int not null default 0, tasks_on_time int not null default 0, challenges_resolved int not null default 0, avg_closure_days numeric not null default 0, survey_avg numeric, volume_score int not null default 0, timeliness_score int not null default 0, outcomes_score int not null default 0, composite_score int not null default 0, tier text not null default 'low', organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), computed_at timestamptz not null default now());


-- ---- BLOCK 5: unique one row per user per month ----
create unique index if not exists monthly_performance_user_month_uniq on public.monthly_performance (user_id, year_month);


-- ---- BLOCK 6: index for department + month rollups ----
create index if not exists monthly_performance_dept_month_idx on public.monthly_performance (department_id, year_month);


-- ---- BLOCK 7: enable RLS ----
alter table public.performance_weights enable row level security;
alter table public.monthly_performance enable row level security;


-- ---- BLOCK 8: performance_weights RLS — read any org member; write super OR admin-with-permission ----
create policy perf_weights_read on public.performance_weights for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());


-- ---- BLOCK 9 (run alone) ----
create policy perf_weights_write on public.performance_weights for all using (organization_id = public.current_user_organization_id() and (public.current_user_is_super() or 'configure_performance' = any((select permissions from public.users where id = auth.uid())))) with check (organization_id = public.current_user_organization_id());


-- ---- BLOCK 10: monthly_performance RLS — read own OR (admin/super see dept/org); no direct write (computed via service path / future job) ----
create policy monthly_perf_read on public.monthly_performance for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder() and (user_id = auth.uid() or public.current_user_is_super() or department_id = public.current_user_department_id()));


-- ---- BLOCK 11 (run alone): allow super/admin-with-permission to upsert recorded scores ----
create policy monthly_perf_write on public.monthly_performance for all using (organization_id = public.current_user_organization_id() and (public.current_user_is_super() or 'configure_performance' = any((select permissions from public.users where id = auth.uid())))) with check (organization_id = public.current_user_organization_id());


-- ---- BLOCK 12 (run alone): new permission for configuring performance weights / recording scores ----
alter type public.user_permission add value if not exists 'configure_performance';


-- ---- BLOCK 13: schema cache reload ----
notify pgrst, 'reload schema';
