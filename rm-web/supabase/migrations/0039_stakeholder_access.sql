-- =====================================================================
-- 0039  EXTERNAL STAKEHOLDER ACCESS — slice 1 (foundation)
--
-- IMPORTANT: run PART 1 ALONE first (enum value can't be used in the same
-- transaction it's created in), confirm success, THEN run PART 2.
-- =====================================================================


-- ====================== PART 1 — run this alone ======================

alter type public.user_role add value if not exists 'stakeholder';


-- ====================== PART 2 — run after Part 1 ====================

-- helper: is the current user a stakeholder account?
create or replace function public.current_user_is_stakeholder()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'stakeholder'
  );
$$;

-- access/link table: one row = one stakeholder + one challenge = one link.
create table if not exists public.challenge_stakeholder_access (
  id                  uuid primary key default gen_random_uuid(),
  challenge_id        uuid not null references public.challenges(id) on delete cascade,
  stakeholder_user_id uuid not null references public.users(id) on delete cascade,
  token               text not null unique,
  created_by_id       uuid not null references public.users(id),
  organization_id     uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
                        references public.organizations(id),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '90 days'),
  revoked_at          timestamptz
);
create index if not exists csa_stakeholder_idx on public.challenge_stakeholder_access (stakeholder_user_id);
create index if not exists csa_challenge_idx  on public.challenge_stakeholder_access (challenge_id);
create index if not exists csa_token_idx      on public.challenge_stakeholder_access (token);

-- is the current user a stakeholder with ACTIVE access to this challenge?
-- active = assignment row, not revoked, not expired, challenge open (not closed/archived/deleted)
create or replace function public.stakeholder_has_active_access(p_challenge_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.challenge_stakeholder_access a
    join public.challenges c on c.id = a.challenge_id
    where a.stakeholder_user_id = auth.uid()
      and a.challenge_id = p_challenge_id
      and a.revoked_at is null
      and a.expires_at > now()
      and c.status <> 'closed'
      and c.deleted_at is null
      and c.archived_at is null
  );
$$;

-- ---- access-table RLS ----
alter table public.challenge_stakeholder_access enable row level security;

-- read: managers see all in org; a stakeholder sees only their own rows (for the landing page)
drop policy if exists csa_read on public.challenge_stakeholder_access;
create policy csa_read on public.challenge_stakeholder_access
for select using (
  (organization_id = public.current_user_organization_id() and public.current_user_is_manager())
  or stakeholder_user_id = auth.uid()
);

-- insert: managers only, own org, as themselves
drop policy if exists csa_insert on public.challenge_stakeholder_access;
create policy csa_insert on public.challenge_stakeholder_access
for insert with check (
  public.current_user_is_manager()
  and organization_id = public.current_user_organization_id()
  and created_by_id = auth.uid()
);

-- update: managers only (revoke = set revoked_at)
drop policy if exists csa_update on public.challenge_stakeholder_access;
create policy csa_update on public.challenge_stakeholder_access
for update using (
  public.current_user_is_manager()
  and organization_id = public.current_user_organization_id()
) with check (
  organization_id = public.current_user_organization_id()
);

-- ---- tighten challenge-family READ so stakeholders see ONLY their assigned challenge ----

-- challenges: staff see org-wide; stakeholders see only actively-assigned
drop policy if exists challenges_read on public.challenges;
create policy challenges_read on public.challenges
for select using (
  (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder())
  or public.stakeholder_has_active_access(id)
);

-- journal: same shape
drop policy if exists challenge_journal_read on public.challenge_journal;
create policy challenge_journal_read on public.challenge_journal
for select using (
  (organization_id = public.current_user_organization_id() and not public.current_user_is_stakeholder())
  or public.stakeholder_has_active_access(challenge_id)
);

-- status history: staff only (stakeholders don't need it)
drop policy if exists challenge_status_history_read on public.challenge_status_history;
create policy challenge_status_history_read on public.challenge_status_history
for select using (
  exists (select 1 from public.challenges c
          where c.id = challenge_id and c.organization_id = public.current_user_organization_id())
  and not public.current_user_is_stakeholder()
);

-- ---- activate the reserved stakeholder branch in the journal WRITE helper ----
create or replace function public.can_write_challenge_journal(p_challenge_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select
    exists (
      select 1 from public.challenges c
      where c.id = p_challenge_id
        and (c.created_by_id = auth.uid() or c.assigned_to_id = auth.uid())
    )
    or exists (
      select 1
      from public.users u
      join public.challenges c on c.id = p_challenge_id
      where u.id = auth.uid()
        and u.role = 'super_admin'
        and coalesce(u.is_higher_management, false) = false
        and u.organization_id = c.organization_id
    )
    or public.stakeholder_has_active_access(p_challenge_id);
$$;
