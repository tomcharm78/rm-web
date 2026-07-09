-- =====================================================================
-- 0037  CONTACTS DIRECTORY — org-wide people directory
-- One table for MOH-internal + external people. Investor representatives
-- are NOT stored here (read live from investors, merged in the UI).
-- All roles in the deputyship can read + create + edit + soft-delete.
-- Email is optional but UNIQUE per organization when provided.
-- =====================================================================

create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  name_ar         text not null default '',
  email           text,                              -- optional; unique-when-present (see index below)
  organization    text not null default '',          -- the body / entity they represent
  role            text not null default '',          -- title / role
  phone           text not null default '',
  type            text not null default 'external',  -- internal_moh | external | government | private | other
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
                    references public.organizations(id),
  created_by_id   uuid not null references public.users(id),
  edited_by_id    uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                        -- soft-delete
);

create index if not exists contacts_org_idx on public.contacts (organization_id, created_at desc);

-- Email optional, but no two LIVE contacts in the same org may share an email.
-- Partial unique: only enforced when email is present and the row isn't soft-deleted.
create unique index if not exists contacts_email_unique
  on public.contacts (organization_id, lower(email))
  where email is not null and deleted_at is null;

alter table public.contacts enable row level security;

-- read: anyone in the deputyship
drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts
for select using (
  organization_id = public.current_user_organization_id()
);

-- insert: any member, as themselves, in their org
drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
for insert with check (
  organization_id = public.current_user_organization_id()
  and created_by_id = auth.uid()
);

-- update: any member, in their org (covers edit AND soft-delete via deleted_at)
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
for update using (
  organization_id = public.current_user_organization_id()
) with check (
  organization_id = public.current_user_organization_id()
);

-- no hard-delete policy: removal is soft-delete (set deleted_at via update).
