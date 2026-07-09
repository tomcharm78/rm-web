-- 0034  CHALLENGES slice 3 — stakeholders (outside parties on a case)
-- Admin-registered contact records. Read = any deputyship member;
-- write = managers (admin/super). `type` is the reserved seam for slice 5.

create table if not exists public.challenge_stakeholders (
  id                uuid primary key default gen_random_uuid(),
  challenge_id      uuid not null references public.challenges(id) on delete cascade,
  name              text not null,
  name_ar           text not null default '',
  organization_name text not null default '',
  role              text not null default '',
  email             text,
  type              text not null default 'external',
  notes             text not null default '',
  created_by_id     uuid not null references public.users(id),
  organization_id   uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
                      references public.organizations(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists challenge_stakeholders_challenge_idx
  on public.challenge_stakeholders (challenge_id, created_at);

alter table public.challenge_stakeholders enable row level security;

drop policy if exists challenge_stakeholders_read on public.challenge_stakeholders;
create policy challenge_stakeholders_read on public.challenge_stakeholders
for select using (
  organization_id = public.current_user_organization_id()
);

drop policy if exists challenge_stakeholders_insert on public.challenge_stakeholders;
create policy challenge_stakeholders_insert on public.challenge_stakeholders
for insert with check (
  public.current_user_is_manager()
  and organization_id = public.current_user_organization_id()
  and created_by_id = auth.uid()
  and exists (select 1 from public.challenges c
              where c.id = challenge_id
                and c.organization_id = public.current_user_organization_id())
);

drop policy if exists challenge_stakeholders_update on public.challenge_stakeholders;
create policy challenge_stakeholders_update on public.challenge_stakeholders
for update using (
  public.current_user_is_manager()
  and organization_id = public.current_user_organization_id()
) with check (
  organization_id = public.current_user_organization_id()
);

drop policy if exists challenge_stakeholders_delete on public.challenge_stakeholders;
create policy challenge_stakeholders_delete on public.challenge_stakeholders
for delete using (
  public.current_user_is_manager()
  and organization_id = public.current_user_organization_id()
);