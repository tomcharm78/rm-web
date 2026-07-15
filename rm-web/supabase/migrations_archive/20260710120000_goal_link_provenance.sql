-- Governance increment B: goal-link provenance + governance write access.
--
-- linked_by_role records the CAPACITY in which a link was made (role at link
-- time). Existing links are null = treated as legacy operational (admin) links.
-- Governance writes stamp 'pmo'/'pm' so a "Linked by PM" correction is
-- distinguishable from an admin's link in the UI and history.
--
-- Also grants governance roles INSERT/DELETE on the two link tables, scoped to
-- items they cover (increment A gave them read only). Authority stays narrow:
-- this is the ONE operational-data write governance roles get, by design.

-- ---------------------------------------------------------------- provenance column
alter table public.task_goals add column if not exists linked_by_role public.user_role;
alter table public.challenge_goals add column if not exists linked_by_role public.user_role;

-- ---------------------------------------------------------------- task_goals governance write
-- A governance user may link/unlink a task's goals when they cover the task's
-- department. (Admins/supers keep whatever access they already had via existing
-- policies; these are additive.)
drop policy if exists task_goals_governance_write on public.task_goals;
create policy task_goals_governance_write on public.task_goals
  using (
    public.current_user_is_governance()
    and exists (
      select 1 from public.tasks t
      where t.id = task_goals.task_id
        and public.governance_covers_department(t.department_id)
    )
  )
  with check (
    public.current_user_is_governance()
    and exists (
      select 1 from public.tasks t
      where t.id = task_goals.task_id
        and public.governance_covers_department(t.department_id)
    )
  );

-- ---------------------------------------------------------------- challenge_goals governance write
-- Challenges are domain-based (no department_id): cover via creator/assignee.
drop policy if exists challenge_goals_governance_write on public.challenge_goals;
create policy challenge_goals_governance_write on public.challenge_goals
  using (
    public.current_user_is_governance()
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_goals.challenge_id
        and (
          public.governance_covers_user(c.created_by_id)
          or public.governance_covers_user(c.assigned_to_id)
        )
    )
  )
  with check (
    public.current_user_is_governance()
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_goals.challenge_id
        and (
          public.governance_covers_user(c.created_by_id)
          or public.governance_covers_user(c.assigned_to_id)
        )
    )
  );

notify pgrst, 'reload schema';
