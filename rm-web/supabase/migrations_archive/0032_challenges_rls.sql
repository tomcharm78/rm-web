-- =====================================================================
-- 0032  CHALLENGES slice 1 — org-wide RLS + investgit statusor seam + helpers
-- Visibility = any member of the deputyship (org). Manage = owner/admin/super.
-- =====================================================================

-- admin-or-super helper (challenges aren't department-walled)
create or replace function public.current_user_is_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin','super_admin')
  );
$$;

-- reserved seam (no UI yet): link a challenge to an investor later
alter table public.challenges add column if not exists investor_id uuid;

-- drop Rork's nine domain-scoped policies
drop policy if exists challenges_admin_domain on public.challenges;
drop policy if exists challenges_delete       on public.challenges;
drop policy if exists challenges_insert       on public.challenges;
drop policy if exists challenges_insert_self  on public.challenges;
drop policy if exists challenges_read         on public.challenges;
drop policy if exists challenges_rm_own       on public.challenges;
drop policy if exists challenges_rm_select    on public.challenges;
drop policy if exists challenges_super        on public.challenges;
drop policy if exists challenges_update       on public.challenges;

-- clean policies --------------------------------------------------------
-- read: anyone in the deputyship
create policy challenges_read on public.challenges
for select using (
  organization_id = public.current_user_organization_id()
);

-- insert: any member, as themselves (the reporter)
create policy challenges_insert on public.challenges
for insert with check (
  organization_id = public.current_user_organization_id()
  and created_by_id = auth.uid()
);

-- update: managers (admin/super) any time; the owner (lead); the creator while still 'open'
create policy challenges_update on public.challenges
for update using (
  organization_id = public.current_user_organization_id()
  and (
    public.current_user_is_manager()
    or assigned_to_id = auth.uid()
    or (created_by_id = auth.uid() and status = 'open')
  )
) with check (
  organization_id = public.current_user_organization_id()
);

-- hard delete: super only (normal removal is soft-delete via update)
create policy challenges_delete on public.challenges
for delete using (public.current_user_is_super());

-- status history -------------------------------------------------------
alter table public.challenge_status_history enable row level security;

drop policy if exists challenge_status_history_read on public.challenge_status_history;
create policy challenge_status_history_read on public.challenge_status_history
for select using (
  exists (select 1 from public.challenges c
          where c.id = challenge_id and c.organization_id = public.current_user_organization_id())
);

drop policy if exists challenge_status_history_insert on public.challenge_status_history;
create policy challenge_status_history_insert on public.challenge_status_history
for insert with check (
  changed_by_id = auth.uid()
  and exists (select 1 from public.challenges c
              where c.id = challenge_id and c.organization_id = public.current_user_organization_id())
);
