-- Governance layer, step 3 of 3: foundation (increment A).
--
-- Design (locked with Hatem):
--   pmo / pm are first-class roles. They match NO existing role-gated policy
--   (role in ('rm','arm'), role = 'admin', etc.), so they are fail-closed by
--   default: no operational rosters, no approver dropdowns, no admin cascades.
--   This migration ADDS what they need and touches only the two dept walls.
--
--   Visibility:  pmo = org-wide operational read. pm = assigned departments only.
--   Authority:   neither approves operational work. pmo line-manages its own
--                PM team (vacations already work via the admin_id line-manager
--                pattern; tasks need the additive policy below).
--   Reporting:   pm.admin_id -> their pmo; pmo.admin_id -> super_admin.

-- ---------------------------------------------------------------- 1. assignments
create table public.pm_department_assignments (
  pm_id uuid not null references public.users(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  assigned_by_id uuid references public.users(id),
  organization_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (pm_id, department_id)
);

alter table public.pm_department_assignments enable row level security;

-- Read: the PM themself, any pmo, any super_admin (org-scoped).
create policy pm_dept_assignments_read on public.pm_department_assignments
  for select using (
    organization_id = public.current_user_organization_id()
    and (
      pm_id = auth.uid()
      or public.current_user_role() in ('pmo', 'super_admin')
    )
  );

-- Write: a pmo for their OWN PMs, or super_admin.
create policy pm_dept_assignments_write on public.pm_department_assignments
  using (
    organization_id = public.current_user_organization_id()
    and (
      public.current_user_role() = 'super_admin'
      or (
        public.current_user_role() = 'pmo'
        and exists (
          select 1 from public.users u
          where u.id = pm_department_assignments.pm_id
            and u.admin_id = auth.uid()
            and u.role = 'pm'
        )
      )
    )
  )
  with check (
    organization_id = public.current_user_organization_id()
    and (
      public.current_user_role() = 'super_admin'
      or (
        public.current_user_role() = 'pmo'
        and exists (
          select 1 from public.users u
          where u.id = pm_department_assignments.pm_id
            and u.admin_id = auth.uid()
            and u.role = 'pm'
        )
      )
    )
  );

-- ---------------------------------------------------------------- 2. helpers
create or replace function public.current_user_is_governance() returns boolean
  language sql stable security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('pmo', 'pm') and deleted_at is null
  );
$$;

-- pmo covers everything; pm covers only assigned departments; others: false.
create or replace function public.governance_covers_department(p_dept uuid) returns boolean
  language sql stable security definer
  set search_path to 'public'
as $$
  select case
    when exists (
      select 1 from public.users
      where id = auth.uid() and role = 'pmo' and deleted_at is null
    ) then true
    when exists (
      select 1 from public.users
      where id = auth.uid() and role = 'pm' and deleted_at is null
    ) then exists (
      select 1 from public.pm_department_assignments a
      where a.pm_id = auth.uid() and a.department_id = p_dept
    )
    else false
  end;
$$;

-- Does the governance caller cover a given USER (via that user's department)?
create or replace function public.governance_covers_user(p_user uuid) returns boolean
  language sql stable security definer
  set search_path to 'public'
as $$
  select public.governance_covers_department(
    (select department_id from public.users where id = p_user)
  );
$$;

-- ---------------------------------------------------------------- 3. dept walls
-- Recreate the two restrictive walls with one extra OR branch each.
-- (tasks_read is already org-wide permissive, so the wall extension alone
--  grants governance task visibility; sessions also needs a permissive read
--  policy, added in section 4.)

drop policy if exists tasks_dept_wall on public.tasks;
create policy tasks_dept_wall on public.tasks
  as restrictive for select using (
    public.current_user_is_super()
    or department_id = public.current_user_department_id()
    or public.user_owns_subtask_on_task(id)
    or public.governance_covers_department(department_id)
  );

drop policy if exists sessions_dept_wall on public.sessions;
create policy sessions_dept_wall on public.sessions
  as restrictive using (
    public.current_user_is_super()
    or department_id = public.current_user_department_id()
    or exists (
      select 1 from public.tasks t
      where t.source_session_id = sessions.id
        and (t.assigned_to_id = auth.uid() or t.created_by_id = auth.uid())
    )
    or public.governance_covers_department(department_id)
  );

-- ---------------------------------------------------------------- 4. governance reads
-- Additive permissive SELECT policies. Redundant grants are harmless; missing
-- ones are lockouts, so we cover every operational surface governance oversees.

create policy sessions_governance_read on public.sessions
  for select using (
    organization_id = public.current_user_organization_id()
    and public.current_user_is_governance()
    and deleted_at is null
    and public.governance_covers_department(department_id)
  );

-- Challenges have no department_id (domain-based): derive via creator/assignee.
create policy challenges_governance_read on public.challenges
  for select using (
    organization_id = public.current_user_organization_id()
    and public.current_user_is_governance()
    and (
      public.governance_covers_user(created_by_id)
      or public.governance_covers_user(assigned_to_id)
    )
  );

create policy vacation_requests_governance_read on public.vacation_requests
  for select using (
    organization_id = public.current_user_organization_id()
    and public.current_user_is_governance()
    and deleted_at is null
    and public.governance_covers_user(user_id)
  );

create policy transfer_requests_governance_read on public.transfer_requests
  for select using (
    organization_id = public.current_user_organization_id()
    and public.current_user_is_governance()
    and deleted_at is null
    and public.governance_covers_user(requester_id)
  );

-- Letters have no department: derive via the requester.
create policy approval_requests_governance_read on public.approval_requests
  for select using (
    organization_id = public.current_user_organization_id()
    and public.current_user_is_governance()
    and deleted_at is null
    and public.governance_covers_user(requester_id)
  );

-- Goals surfaces (the governance roles' core subject matter).
create policy strategic_goals_governance_read on public.strategic_goals
  for select using (
    organization_id = public.current_user_organization_id()
    and public.current_user_is_governance()
  );

create policy department_goals_governance_read on public.department_goals
  for select using (
    organization_id = public.current_user_organization_id()
    and public.current_user_is_governance()
    and public.governance_covers_department(department_id)
  );

create policy task_goals_governance_read on public.task_goals
  for select using (
    public.current_user_is_governance()
    and exists (
      select 1 from public.tasks t
      where t.id = task_goals.task_id
        and public.governance_covers_department(t.department_id)
    )
  );

create policy challenge_goals_governance_read on public.challenge_goals
  for select using (
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

-- ---------------------------------------------------------------- 5. pmo line-management
-- Vacations already route via the admin_id line-manager pattern (no role gate),
-- so a PM's leave approval by their pmo works with zero changes. Tasks' update
-- policies ARE role-gated (admin/super or owner), so the pmo needs this to
-- approve/reject its own PMs' closures:
create policy tasks_pmo_line_manage on public.tasks
  for update using (
    organization_id = public.current_user_organization_id()
    and public.current_user_role() = 'pmo'
    and exists (
      select 1 from public.users u
      where u.id = tasks.assigned_to_id and u.admin_id = auth.uid()
    )
  )
  with check (organization_id = public.current_user_organization_id());

-- ---------------------------------------------------------------- 6. pmo manages PMs
-- Mirror of users_admin_manage: a pmo manages ONLY its own reports of role 'pm'.
create policy users_pmo_manage on public.users
  using (
    organization_id = public.current_user_organization_id()
    and public.current_user_role() = 'pmo'
    and admin_id = auth.uid()
    and role = 'pm'
  )
  with check (
    organization_id = public.current_user_organization_id()
    and public.current_user_role() = 'pmo'
    and admin_id = auth.uid()
    and role = 'pm'
  );
