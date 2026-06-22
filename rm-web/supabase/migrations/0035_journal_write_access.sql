-- =====================================================================
-- 0035  CHALLENGES — restrict journal WRITE access
-- Read stays org-wide. Posting / editing an entry is limited to:
--   1. the challenge creator        (challenges.created_by_id)
--   2. the assigned owner           (challenges.assigned_to_id)
--   3. a same-org super_admin that is NOT Higher Management
--   4. a linked stakeholder         -- RESERVED for slice 5 (inert today)
-- Higher Management is excluded (non-real anchor account).
-- =====================================================================

-- helper: may the current user write to THIS challenge's journal?
-- SECURITY DEFINER + single-table lookups only (no cross-policy recursion).
create or replace function public.can_write_challenge_journal(p_challenge_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- creator or assigned owner of the challenge
    exists (
      select 1 from public.challenges c
      where c.id = p_challenge_id
        and (c.created_by_id = auth.uid() or c.assigned_to_id = auth.uid())
    )
    -- OR a same-org super_admin that is not Higher Management
    or exists (
      select 1
      from public.users u
      join public.challenges c on c.id = p_challenge_id
      where u.id = auth.uid()
        and u.role = 'super_admin'
        and coalesce(u.is_higher_management, false) = false
        and u.organization_id = c.organization_id
    );
    -- slice 5 will add: OR the user is a stakeholder linked to this challenge
$$;

-- INSERT: author = me AND I'm allowed to write to this challenge
drop policy if exists challenge_journal_insert on public.challenge_journal;
create policy challenge_journal_insert on public.challenge_journal
for insert with check (
  author_id = auth.uid()
  and organization_id = public.current_user_organization_id()
  and public.can_write_challenge_journal(challenge_id)
);

-- UPDATE: original author only, still once, still within the hour,
-- and still currently permitted to write to this challenge.
drop policy if exists challenge_journal_update on public.challenge_journal;
create policy challenge_journal_update on public.challenge_journal
for update using (
  author_id = auth.uid()
  and edited_at is null
  and created_at > now() - interval '1 hour'
  and public.can_write_challenge_journal(challenge_id)
) with check (
  author_id = auth.uid()
);
