-- =====================================================================
-- 0033  CHALLENGES slice 2 — journal (follow-up log)
-- Attributed entries (name . department . time), universal 1-edit/1-hour lock.
-- Read = any deputyship member (stakeholder scoping arrives in slice 5).
-- =====================================================================

create table if not exists public.challenge_journal (
  id                   uuid primary key default gen_random_uuid(),
  challenge_id         uuid not null references public.challenges(id) on delete cascade,
  author_id            uuid not null references public.users(id),
  body                 text not null,
  -- attribution denormalized at post time (copy-at-emit pattern, like notifications)
  author_name          text not null default '',
  author_name_ar       text not null default '',
  author_department    text not null default '',
  author_department_ar text not null default '',
  organization_id      uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
                         references public.organizations(id),
  created_at           timestamptz not null default now(),
  edited_at            timestamptz,                 -- null until the single edit is used
  updated_at           timestamptz not null default now()
);

create index if not exists challenge_journal_challenge_idx
  on public.challenge_journal (challenge_id, created_at desc);

alter table public.challenge_journal enable row level security;

-- read: anyone in the deputyship
drop policy if exists challenge_journal_read on public.challenge_journal;
create policy challenge_journal_read on public.challenge_journal
for select using (
  organization_id = public.current_user_organization_id()
);

-- insert: author = me, my org, on a challenge in my org
drop policy if exists challenge_journal_insert on public.challenge_journal;
create policy challenge_journal_insert on public.challenge_journal
for insert with check (
  author_id = auth.uid()
  and organization_id = public.current_user_organization_id()
  and exists (select 1 from public.challenges c
              where c.id = challenge_id
                and c.organization_id = public.current_user_organization_id())
);

-- update: author only, ONCE (edited_at still null), within 1 hour of posting.
-- USING is checked against the pre-update row, so after the edit sets edited_at,
-- and after the hour elapses, any further edit is refused by the database.
drop policy if exists challenge_journal_update on public.challenge_journal;
create policy challenge_journal_update on public.challenge_journal
for update using (
  author_id = auth.uid()
  and edited_at is null
  and created_at > now() - interval '1 hour'
) with check (
  author_id = auth.uid()
);

-- no delete policy: journal entries are permanent (history integrity).
