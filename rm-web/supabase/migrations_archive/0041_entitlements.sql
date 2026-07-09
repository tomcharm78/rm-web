-- =====================================================================
-- 0041  ENTITLEMENTS FOUNDATION — premium-module gating
--
-- One row per (org, module_key). enabled = switched on for this org.
-- licensed (nullable, unused now) = future payment/vendor flag.
-- Controlled now by a capability holder (Sarah) via can_manage_modules;
-- later flipped by a payment webhook (Moyasar) instead.
--
-- Run BLOCK BY BLOCK in the Supabase SQL editor (single-line statements).
-- Core modules are NOT rows here — they are always on by definition.
-- =====================================================================


-- ---- BLOCK 1: capability flag (clean, module-agnostic) ----
alter table public.users add column if not exists can_manage_modules boolean not null default false;


-- ---- BLOCK 2: entitlements table (single line) ----
create table if not exists public.org_module_settings (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), module_key text not null, enabled boolean not null default false, licensed boolean, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, module_key));


-- ---- BLOCK 3: index + RLS enable ----
create index if not exists org_module_settings_org_idx on public.org_module_settings (organization_id);
alter table public.org_module_settings enable row level security;


-- ---- BLOCK 4: capability helper ----
create or replace function public.current_user_can_manage_modules() returns boolean language sql security definer stable set search_path = public as $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.can_manage_modules = true); $$;


-- ---- BLOCK 5: RLS — everyone in the org READS (so gates work for all); only capability holder writes ----
create policy oms_read on public.org_module_settings for select using (organization_id = public.current_user_organization_id());
create policy oms_insert on public.org_module_settings for insert with check (organization_id = public.current_user_organization_id() and public.current_user_can_manage_modules());
create policy oms_update on public.org_module_settings for update using (organization_id = public.current_user_organization_id() and public.current_user_can_manage_modules()) with check (organization_id = public.current_user_organization_id());


-- ---- BLOCK 6: grant the capability to Sarah ----
update public.users set can_manage_modules = true where email = 'sarah.mitchell@rmplatform.com';


-- ---- BLOCK 7: seed premium modules for the MOH org (all default OFF — Sarah enables for POC) ----
insert into public.org_module_settings (organization_id, module_key, enabled)
values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'vacations', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'reports', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'survey', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'hr_training', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'community', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'events', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'kpis', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'emails', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'attachments', false),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'exports', false)
on conflict (organization_id, module_key) do nothing;
