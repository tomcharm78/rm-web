-- =============================================================================
-- RM Platform — Integration & Multi-tenancy Foundation
-- Migration: 0007_integration_fields.sql
-- =============================================================================
--
-- This migration is the first big architectural shift since the initial schema.
-- It does three things, in order:
--
--   1. Adds `organization_id` to every business entity (multi-tenancy).
--      Backfilled to a single seed org so existing rows remain valid.
--
--   2. Adds external integration columns to every entity that might be
--      synced to/from outside systems (MOH, partner facilities, etc.):
--        - external_id        : the foreign system's primary key for this row
--        - source_system      : a short slug identifying the origin (e.g. 'moh')
--        - source_metadata    : free-form JSONB for whatever the source sends us
--      Combined with the existing `id` (our own UUID PK), this gives a clean
--      stable mapping between our records and any external system's records.
--
--   3. Creates webhook scaffolding tables:
--        - integration_organizations  : external systems we trust (MOH etc.)
--        - webhook_subscriptions      : who wants what events
--        - webhook_events             : queue of pending outbound notifications
--      No worker is built yet — the tables exist so that every write
--      automatically records what should be sent. We turn the spigot on
--      later by activating a worker.
--
-- IDEMPOTENT: safe to re-run. Every ALTER/CREATE uses IF NOT EXISTS where
-- supported, and the seed insert uses ON CONFLICT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Organizations table (multi-tenancy root)
-- -----------------------------------------------------------------------------
-- We model "tenant" as `organization`. Today there's one (the MOH Investment
-- Department). The model is built so we can add a second tomorrow without
-- schema changes — only RLS policies need to scope by org_id (next migration).

create table if not exists public.organizations (
  id              uuid primary key default gen_random_uuid(),
  -- Display
  name            text not null,                          -- English name
  name_ar         text not null,                          -- Arabic name
  slug            text not null unique,                   -- url-safe, e.g. 'moh-investment'
  -- Classification
  org_type        text not null default 'government',     -- government | private | partner | other
  country         text not null default 'Saudi Arabia',
  -- Lifecycle
  is_active       boolean not null default true,
  -- Integration foundations (orgs can themselves come from external systems)
  external_id     text,
  source_system   text,
  source_metadata jsonb,
  -- Audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- Constraints
  constraint organizations_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint organizations_org_type_valid check (org_type in ('government', 'private', 'partner', 'other')),
  constraint organizations_external_id_unique
    unique nulls not distinct (source_system, external_id)
);

create index if not exists idx_organizations_active on public.organizations(is_active) where deleted_at is null;
create index if not exists idx_organizations_source on public.organizations(source_system, external_id)
  where source_system is not null;

-- Standard updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_organizations_updated_at') then
    create trigger trg_organizations_updated_at
      before update on public.organizations
      for each row execute function set_updated_at();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Step 2: Seed the bootstrap organization
-- -----------------------------------------------------------------------------
-- Every existing row in the database needs an organization_id. We use a single
-- well-known UUID so this migration is reproducible and the next migration
-- (0008_first_organization) can reference it explicitly.

insert into public.organizations (
  id, name, name_ar, slug, org_type, country, is_active
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Saudi Ministry of Health — Investment Department',
  'وزارة الصحة السعودية — إدارة الاستثمار',
  'moh-investment',
  'government',
  'Saudi Arabia',
  true
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Step 3: Helper to add the same set of integration columns to a table
-- -----------------------------------------------------------------------------
-- Doing this as a DO block so we can apply the same set of changes to many
-- tables without repetition or copy-paste drift.

do $$
declare
  t text;
  business_tables text[] := array[
    'users',
    'investors',
    'tasks',
    'challenges',
    'sessions',
    'vacation_requests',
    'approval_requests',
    'transfer_requests',
    'endorsement_requests',
    'password_reset_requests',
    'attachments',
    'messages',
    'notifications',
    'session_links',
    'domains',
    'sub_domains'
  ];
begin
  foreach t in array business_tables loop
    -- organization_id : multi-tenancy column
    execute format($f$
      alter table public.%I
        add column if not exists organization_id uuid
          references public.organizations(id) on delete restrict
    $f$, t);

    -- external_id : foreign system's identifier for this row
    execute format($f$
      alter table public.%I
        add column if not exists external_id text
    $f$, t);

    -- source_system : slug identifying the origin
    execute format($f$
      alter table public.%I
        add column if not exists source_system text
    $f$, t);

    -- source_metadata : free-form JSONB from the source
    execute format($f$
      alter table public.%I
        add column if not exists source_metadata jsonb
    $f$, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Step 4: Backfill organization_id on all existing rows
-- -----------------------------------------------------------------------------
-- The seed rows from 0004 don't have an organization_id. Set them all to the
-- bootstrap org we just created.

do $$
declare
  t text;
  business_tables text[] := array[
    'users',
    'investors',
    'tasks',
    'challenges',
    'sessions',
    'vacation_requests',
    'approval_requests',
    'transfer_requests',
    'endorsement_requests',
    'password_reset_requests',
    'attachments',
    'messages',
    'notifications',
    'session_links',
    'domains',
    'sub_domains'
  ];
  bootstrap_org uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  foreach t in array business_tables loop
    execute format($f$
      update public.%I
         set organization_id = %L
       where organization_id is null
    $f$, t, bootstrap_org);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Step 5: Lock organization_id NOT NULL after backfill (defensive)
-- -----------------------------------------------------------------------------
-- After backfill, organization_id must always be present on new rows.

do $$
declare
  t text;
  business_tables text[] := array[
    'users',
    'investors',
    'tasks',
    'challenges',
    'sessions',
    'vacation_requests',
    'approval_requests',
    'transfer_requests',
    'endorsement_requests',
    'password_reset_requests',
    'attachments',
    'messages',
    'notifications',
    'session_links',
    'domains',
    'sub_domains'
  ];
begin
  foreach t in array business_tables loop
    execute format($f$
      alter table public.%I alter column organization_id set not null
    $f$, t);
    -- Default to the bootstrap org so new rows from existing code paths
    -- don't immediately break. Multi-org code paths set this explicitly.
    execute format($f$
      alter table public.%I alter column organization_id set default '00000000-0000-0000-0000-000000000001'::uuid
    $f$, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Step 6: External-source uniqueness
-- -----------------------------------------------------------------------------
-- If a row has both source_system and external_id, that pair must be unique
-- within the organization. (We allow nulls so internal-only rows are fine.)

do $$
declare
  t text;
  business_tables text[] := array[
    'investors',
    'users',
    'tasks',
    'challenges',
    'sessions'
  ];
begin
  foreach t in array business_tables loop
    execute format($f$
      create unique index if not exists idx_%I_external_source
        on public.%I (organization_id, source_system, external_id)
        where source_system is not null and external_id is not null
    $f$, t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Step 7: Index organization_id everywhere for RLS performance
-- -----------------------------------------------------------------------------
-- RLS policies will filter by organization_id on every query. Without an
-- index on this column, every read becomes a sequential scan.

do $$
declare
  t text;
  business_tables text[] := array[
    'users',
    'investors',
    'tasks',
    'challenges',
    'sessions',
    'vacation_requests',
    'approval_requests',
    'transfer_requests',
    'endorsement_requests',
    'password_reset_requests',
    'attachments',
    'messages',
    'notifications',
    'session_links',
    'domains',
    'sub_domains'
  ];
begin
  foreach t in array business_tables loop
    execute format($f$
      create index if not exists idx_%I_organization_id on public.%I (organization_id)
    $f$, t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Step 8: Webhook scaffolding — subscriptions & event queue
-- -----------------------------------------------------------------------------

-- An "integration partner" is an external system we either send data to or
-- receive data from. Each partner is associated with one of our organizations
-- (so MOH can have its own partners separate from another org's).

create table if not exists public.integration_partners (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  -- Identification
  slug            text not null,                          -- e.g. 'moh-cdc', 'partner-x'
  display_name    text not null,
  -- Trust
  is_active       boolean not null default false,         -- explicitly off until activated
  -- Outbound config: where we POST events
  outbound_url    text,
  outbound_secret text,                                   -- HMAC signing secret
  -- Inbound config: which IPs/origins are allowed (optional, defense-in-depth)
  inbound_allow_origins text[],
  -- Audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- Uniqueness within an organization
  unique (organization_id, slug)
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_integration_partners_updated_at') then
    create trigger trg_integration_partners_updated_at
      before update on public.integration_partners
      for each row execute function set_updated_at();
  end if;
end $$;

-- A subscription expresses "partner X wants event type Y about entity table Z".
-- Today no subscriptions exist; partners create them when they onboard.

create table if not exists public.webhook_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  partner_id      uuid not null references public.integration_partners(id) on delete cascade,
  -- What they want to know about
  entity_type     text not null,                          -- e.g. 'investor', 'task', 'session'
  event_type      text not null,                          -- e.g. 'created', 'updated', 'deleted', '*'
  -- Lifecycle
  is_active       boolean not null default true,
  -- Audit
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (partner_id, entity_type, event_type),
  constraint webhook_sub_event_type_valid
    check (event_type in ('created', 'updated', 'deleted', '*')),
  constraint webhook_sub_entity_type_valid
    check (entity_type in (
      'investor', 'task', 'challenge', 'session', 'user',
      'vacation_request', 'approval_request', '*'
    ))
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_webhook_subs_updated_at') then
    create trigger trg_webhook_subs_updated_at
      before update on public.webhook_subscriptions
      for each row execute function set_updated_at();
  end if;
end $$;

-- The event queue. Triggers on business tables INSERT into this. A worker
-- (future) drains pending rows in chronological order, POSTs to subscribers,
-- and marks each row as sent or failed.

create table if not exists public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  -- What happened
  entity_type     text not null,
  entity_id       uuid not null,
  event_type      text not null,                          -- 'created' | 'updated' | 'deleted'
  payload         jsonb not null,                         -- full row (or before+after for updates)
  -- Delivery
  status          text not null default 'pending',        -- pending | sent | failed | dead
  attempt_count   integer not null default 0,
  last_attempt_at timestamptz,
  last_error      text,
  delivered_at    timestamptz,
  -- Audit
  created_at      timestamptz not null default now(),
  -- Constraints
  constraint webhook_events_status_valid
    check (status in ('pending', 'sent', 'failed', 'dead')),
  constraint webhook_events_event_type_valid
    check (event_type in ('created', 'updated', 'deleted'))
);

create index if not exists idx_webhook_events_pending
  on public.webhook_events (organization_id, created_at)
  where status = 'pending';

create index if not exists idx_webhook_events_entity
  on public.webhook_events (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Step 9: Enable RLS on the new tables
-- -----------------------------------------------------------------------------

alter table public.organizations         enable row level security;
alter table public.integration_partners  enable row level security;
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_events        enable row level security;

-- Read your own organization
create policy organizations_read_own on public.organizations
  for select using (
    id = (select organization_id from public.users where id = auth.uid())
  );

-- Only super_admin can manage organizations (a future "platform admin" might differ)
create policy organizations_super_admin on public.organizations
  for all using (current_user_role() = 'super_admin')
  with check (current_user_role() = 'super_admin');

-- Same for integration partners + subscriptions + events: read within your org,
-- modify only if super_admin.
create policy integration_partners_read on public.integration_partners
  for select using (
    organization_id = (select organization_id from public.users where id = auth.uid())
  );

create policy integration_partners_super_admin on public.integration_partners
  for all using (current_user_role() = 'super_admin')
  with check (current_user_role() = 'super_admin');

create policy webhook_subs_read on public.webhook_subscriptions
  for select using (
    organization_id = (select organization_id from public.users where id = auth.uid())
  );

create policy webhook_subs_super_admin on public.webhook_subscriptions
  for all using (current_user_role() = 'super_admin')
  with check (current_user_role() = 'super_admin');

create policy webhook_events_read on public.webhook_events
  for select using (
    organization_id = (select organization_id from public.users where id = auth.uid())
  );

-- webhook_events is system-managed (triggers insert; only workers update);
-- no INSERT/UPDATE policies for end users.

-- -----------------------------------------------------------------------------
-- Step 10: Helper function — current user's organization_id
-- -----------------------------------------------------------------------------
-- All future RLS policies will use this. Wrapping it in SECURITY DEFINER means
-- the policy can call it without re-triggering RLS on public.users (the same
-- pattern that fixed the auth.users login bug).

create or replace function public.current_user_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid() and deleted_at is null
$$;

revoke execute on function public.current_user_organization_id() from public;
grant execute on function public.current_user_organization_id() to authenticated;

-- -----------------------------------------------------------------------------
-- Step 11: Webhook emission helper
-- -----------------------------------------------------------------------------
-- A simple internal helper that triggers will call to enqueue an event.
-- Today it just inserts; tomorrow we add filtering by subscriptions.

create or replace function public.emit_webhook_event(
  p_entity_type text,
  p_entity_id   uuid,
  p_event_type  text,
  p_payload     jsonb,
  p_org_id      uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  -- Use explicit org if provided; else look it up via auth context.
  v_org := coalesce(p_org_id, current_user_organization_id());
  if v_org is null then
    -- No org context — abort silently. Triggers must always supply an org.
    return;
  end if;

  insert into public.webhook_events (
    organization_id, entity_type, entity_id, event_type, payload
  ) values (
    v_org, p_entity_type, p_entity_id, p_event_type, p_payload
  );
end $$;

revoke execute on function public.emit_webhook_event(text, uuid, text, jsonb, uuid) from public;
grant execute on function public.emit_webhook_event(text, uuid, text, jsonb, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Step 12: Trigger emit for investors (other entities added in later modules)
-- -----------------------------------------------------------------------------
-- When investors are created/updated/deleted, we emit a webhook event.

create or replace function public.emit_investor_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_payload    jsonb;
  v_org_id     uuid;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'created';
    v_payload := to_jsonb(new);
    v_org_id := new.organization_id;
  elsif tg_op = 'UPDATE' then
    -- Skip if nothing meaningful changed (we don't want UPDATE storms on RLS rechecks)
    if new is not distinct from old then
      return new;
    end if;
    v_event_type := 'updated';
    v_payload := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    v_org_id := new.organization_id;
  elsif tg_op = 'DELETE' then
    v_event_type := 'deleted';
    v_payload := to_jsonb(old);
    v_org_id := old.organization_id;
  end if;

  perform emit_webhook_event('investor', coalesce(new.id, old.id), v_event_type, v_payload, v_org_id);
  return coalesce(new, old);
end $$;

drop trigger if exists trg_emit_investor_event on public.investors;
create trigger trg_emit_investor_event
  after insert or update or delete on public.investors
  for each row execute function emit_investor_event();

-- =============================================================================
-- End of 0007. Verification queries (run separately, not part of the migration):
--
--   select count(*) from public.organizations;          -- expect 1
--   select count(*) from public.investors where organization_id is null;  -- expect 0
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='investors'
--       and column_name in ('organization_id','external_id','source_system','source_metadata');
--   -- expect 4 rows
-- =============================================================================
