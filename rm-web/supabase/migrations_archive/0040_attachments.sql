-- =====================================================================
-- 0040  ATTACHMENTS — generic polymorphic file attachments
--
-- Replaces a defunct Rork-era attachments table (task/challenge/session
-- FK design + context_type enum) with a clean polymorphic table.
-- NOTE: context_type enum is SHARED (session_links.link_type,
-- messages.context_type) — do NOT drop it.
-- Run block by block in the Supabase SQL editor (single-line statements).
-- Storage bucket 'attachments' (private) created separately in Storage UI.
-- =====================================================================

-- ---- BLOCK 1: drop the defunct Rork table (data was dev-only) ----
drop table if exists public.attachments cascade;

-- ---- BLOCK 2: capability flag + org switch columns ----
alter table public.users add column if not exists can_manage_attachments boolean not null default false;
alter table public.organizations add column if not exists attachments_enabled boolean not null default false;

-- ---- BLOCK 3: clean polymorphic attachments table (single line) ----
create table public.attachments (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null, purpose text not null default 'record', storage_path text not null, file_name text not null, mime_type text not null, size_bytes bigint not null, comment text not null default '', classification text not null default 'general', uploaded_by_id uuid not null references public.users(id), organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id), created_at timestamptz not null default now(), deleted_at timestamptz);

-- ---- BLOCK 4: indexes + RLS ----
create index attachments_entity_idx on public.attachments (entity_type, entity_id);
create index attachments_org_idx on public.attachments (organization_id);
create index attachments_purpose_idx on public.attachments (purpose);
alter table public.attachments enable row level security;

-- ---- BLOCK 5: policies (stakeholders get NO attachment access; insert gated by org switch) ----
create policy attachments_read on public.attachments for select using (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder());
create policy attachments_insert on public.attachments for insert with check (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder() and uploaded_by_id = auth.uid() and exists (select 1 from public.organizations o where o.id = organization_id and o.attachments_enabled = true));
create policy attachments_update on public.attachments for update using (organization_id = public.current_user_organization_id() and (uploaded_by_id = auth.uid() or public.current_user_is_manager())) with check (organization_id = public.current_user_organization_id());

-- ---- BLOCK 6: org-switch flip guarded by the capability flag ----
create or replace function public.current_user_can_manage_attachments() returns boolean language sql security definer stable set search_path = public as $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.can_manage_attachments = true); $$;
create policy organizations_attachments_switch on public.organizations for update using (id = public.current_user_organization_id() and public.current_user_can_manage_attachments()) with check (id = public.current_user_organization_id());

-- ---- BLOCK 7: grant the capability to Sarah (the only holder for now) ----
update public.users set can_manage_attachments = true where email = 'sarah.mitchell@rmplatform.com';
