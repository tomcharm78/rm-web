-- =====================================================================
-- 0046  KPI — deputyship strategic goal ↔ organization goal (many-to-many)
--
-- A deputyship strategic goal can serve ONE OR MORE organization goals.
-- Replaces the single parent_goal_id relationship for deputyship→org.
-- (parent_goal_id column stays on the table but is no longer the primary
--  linkage for deputyship goals; this join table is authoritative.)
--
-- Run BLOCK BY BLOCK single-line in the Supabase SQL editor.
-- =====================================================================


-- ---- BLOCK 1: join table ----
create table if not exists public.strategic_goal_parents (id uuid primary key default gen_random_uuid(), deputyship_goal_id uuid not null references public.strategic_goals(id) on delete cascade, org_goal_id uuid not null references public.strategic_goals(id) on delete cascade, organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now());


-- ---- BLOCK 2: unique — no duplicate deputyship↔org link ----
create unique index if not exists strategic_goal_parents_uniq on public.strategic_goal_parents (deputyship_goal_id, org_goal_id);


-- ---- BLOCK 3: lookup indexes ----
create index if not exists sgp_deputyship_idx on public.strategic_goal_parents (deputyship_goal_id);
create index if not exists sgp_org_idx on public.strategic_goal_parents (org_goal_id);


-- ---- BLOCK 4: enable RLS ----
alter table public.strategic_goal_parents enable row level security;


-- ---- BLOCK 5: read (any org member, not stakeholder) ----
create policy sgp_read on public.strategic_goal_parents for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());


-- ---- BLOCK 6 (run alone): write — super admin only ----
create policy sgp_write on public.strategic_goal_parents for all using (organization_id = public.current_user_organization_id() and public.current_user_is_super()) with check (organization_id = public.current_user_organization_id() and public.current_user_is_super());


-- ---- BLOCK 7: schema cache reload ----
notify pgrst, 'reload schema';
