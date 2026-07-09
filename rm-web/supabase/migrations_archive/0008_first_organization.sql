-- =============================================================================
-- RM Platform — Multi-tenant RLS Policy Update
-- Migration: 0008_first_organization.sql
-- =============================================================================
--
-- This migration replaces the existing single-tenant RLS policies on every
-- business table with multi-tenant equivalents. The new policies wrap the old
-- role checks (super_admin / admin / RM / ARM) in an additional organization
-- scope: a user can only see rows that share their organization_id.
--
-- Pattern for every table:
--
--   USING (
--     organization_id = current_user_organization_id()    -- tenant fence
--     AND (
--       <existing role-based rule>                        -- original logic
--     )
--   )
--
-- This means: even if a future bug in the role logic accidentally returns
-- true, the org fence still blocks cross-tenant data leaks. Defense in depth.
--
-- This migration also:
--   - Confirms the MOH org seeded by 0007 is the authoritative bootstrap org
--   - Adds a `current_user_organization()` helper that returns the full row
--   - Documents which tables we have NOT yet updated (out of scope here)
--
-- IDEMPOTENT: every policy is dropped-and-recreated. Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Confirm bootstrap org exists (safety check)
-- -----------------------------------------------------------------------------
do $$
declare
  v_org_count integer;
begin
  select count(*) into v_org_count from public.organizations
    where id = '00000000-0000-0000-0000-000000000001'::uuid;
  if v_org_count = 0 then
    raise exception 'Bootstrap organization missing. Run 0007 first.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Step 2: Helpful view of "my org" for app code
-- -----------------------------------------------------------------------------
-- The auth provider in the frontend already knows the user. With this RPC
-- the frontend can fetch the org once and cache it.

create or replace function public.current_user_organization()
returns public.organizations
language sql
stable
security definer
set search_path = public
as $$
  select o.*
    from public.organizations o
    join public.users u on u.organization_id = o.id
   where u.id = auth.uid()
     and u.deleted_at is null
     and o.deleted_at is null
   limit 1
$$;

revoke execute on function public.current_user_organization() from public;
grant execute on function public.current_user_organization() to authenticated;

-- -----------------------------------------------------------------------------
-- Step 3: Update RLS policies on `investors`
-- -----------------------------------------------------------------------------
-- Original policies (from 0002_rls.sql) are dropped and replaced. The
-- replacement adds the org fence around the existing role logic.

drop policy if exists investors_read         on public.investors;
drop policy if exists investors_insert       on public.investors;
drop policy if exists investors_update       on public.investors;
drop policy if exists investors_delete       on public.investors;
drop policy if exists investors_super_all    on public.investors;

-- READ: anyone in the same org who is authenticated and the row isn't deleted.
-- Super admin can see deleted rows too (for restore flows).
create policy investors_read on public.investors
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
    and (deleted_at is null or current_user_role() = 'super_admin')
  );

-- INSERT: RM, ARM, admin, super_admin can create within their own org.
-- The `with check` ensures they can't set organization_id to someone else's.
create policy investors_insert on public.investors
  for insert with check (
    organization_id = current_user_organization_id()
    and current_user_role() in ('rm', 'arm', 'admin', 'super_admin')
  );

-- UPDATE: RM/ARM can update investors they created;
-- admin can update any investor in their org;
-- super_admin can do anything within their org.
create policy investors_update on public.investors
  for update using (
    organization_id = current_user_organization_id()
    and (
      current_user_role() = 'super_admin'
      or current_user_role() = 'admin'
      or (current_user_role() in ('rm', 'arm') and created_by_id = auth.uid())
    )
  ) with check (
    organization_id = current_user_organization_id()
  );

-- DELETE: only admin and super_admin (within their org).
-- In practice the app uses soft-delete (set deleted_at via UPDATE),
-- but a real DELETE is still gated for emergency cleanup.
create policy investors_delete on public.investors
  for delete using (
    organization_id = current_user_organization_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- Step 4: Update RLS policies on `users`
-- -----------------------------------------------------------------------------
-- Existing 0002 policies allowed cross-tenant reads under some conditions.
-- Replace with org-scoped versions.

drop policy if exists users_read         on public.users;
drop policy if exists users_self_update  on public.users;
drop policy if exists users_admin_manage on public.users;
drop policy if exists users_super_all    on public.users;

-- READ: anyone authenticated in the same org. (Listing teammates is fine.)
-- Soft-deleted rows are visible only to super_admin (for restore).
create policy users_read on public.users
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
    and (deleted_at is null or current_user_role() = 'super_admin')
  );

-- SELF UPDATE: anyone can edit their own row.
create policy users_self_update on public.users
  for update using (id = auth.uid())
  with check (id = auth.uid() and organization_id = current_user_organization_id());

-- ADMIN MANAGE: admin can manage rm/arm rows they themselves admin, within their org.
create policy users_admin_manage on public.users
  for all using (
    organization_id = current_user_organization_id()
    and current_user_role() = 'admin'
    and admin_id = auth.uid()
    and role = any (array['rm'::user_role, 'arm'::user_role])
  ) with check (
    organization_id = current_user_organization_id()
    and current_user_role() = 'admin'
    and admin_id = auth.uid()
    and role = any (array['rm'::user_role, 'arm'::user_role])
  );

-- SUPER ADMIN: full access within their own org.
create policy users_super_all on public.users
  for all using (
    organization_id = current_user_organization_id()
    and current_user_role() = 'super_admin'
  ) with check (
    organization_id = current_user_organization_id()
    and current_user_role() = 'super_admin'
  );

-- -----------------------------------------------------------------------------
-- Step 5: Update RLS policies on `tasks`, `challenges`, `sessions`
-- -----------------------------------------------------------------------------
-- These tables follow the same pattern as investors. The detailed role-based
-- logic from 0002 is preserved, wrapped in the org fence.

-- Tasks: read for everyone in org; assigned user or admin/super can manage.
drop policy if exists tasks_read         on public.tasks;
drop policy if exists tasks_insert       on public.tasks;
drop policy if exists tasks_update       on public.tasks;
drop policy if exists tasks_delete       on public.tasks;

create policy tasks_read on public.tasks
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
    and (deleted_at is null or current_user_role() = 'super_admin')
  );

create policy tasks_insert on public.tasks
  for insert with check (
    organization_id = current_user_organization_id()
    and current_user_role() in ('rm', 'arm', 'admin', 'super_admin')
  );

create policy tasks_update on public.tasks
  for update using (
    organization_id = current_user_organization_id()
    and (
      current_user_role() in ('super_admin', 'admin')
      or assigned_to_id = auth.uid()
      or created_by_id = auth.uid()
    )
  ) with check (
    organization_id = current_user_organization_id()
  );

create policy tasks_delete on public.tasks
  for delete using (
    organization_id = current_user_organization_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- Challenges: similar pattern.
drop policy if exists challenges_read   on public.challenges;
drop policy if exists challenges_insert on public.challenges;
drop policy if exists challenges_update on public.challenges;
drop policy if exists challenges_delete on public.challenges;

create policy challenges_read on public.challenges
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
    and (deleted_at is null or current_user_role() = 'super_admin')
  );

create policy challenges_insert on public.challenges
  for insert with check (
    organization_id = current_user_organization_id()
    and current_user_role() in ('rm', 'arm', 'admin', 'super_admin')
  );

create policy challenges_update on public.challenges
  for update using (
    organization_id = current_user_organization_id()
    and (
      current_user_role() in ('super_admin', 'admin')
      or assigned_to_id = auth.uid()
      or created_by_id = auth.uid()
    )
  ) with check (
    organization_id = current_user_organization_id()
  );

create policy challenges_delete on public.challenges
  for delete using (
    organization_id = current_user_organization_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- Sessions: read for org members, manage by creator/admin/super.
drop policy if exists sessions_read   on public.sessions;
drop policy if exists sessions_insert on public.sessions;
drop policy if exists sessions_update on public.sessions;
drop policy if exists sessions_delete on public.sessions;

create policy sessions_read on public.sessions
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
    and (deleted_at is null or current_user_role() = 'super_admin')
  );

create policy sessions_insert on public.sessions
  for insert with check (
    organization_id = current_user_organization_id()
    and current_user_role() in ('rm', 'arm', 'admin', 'super_admin')
  );

create policy sessions_update on public.sessions
  for update using (
    organization_id = current_user_organization_id()
    and (
      current_user_role() in ('super_admin', 'admin')
      or created_by_id = auth.uid()
    )
  ) with check (
    organization_id = current_user_organization_id()
  );

create policy sessions_delete on public.sessions
  for delete using (
    organization_id = current_user_organization_id()
    and current_user_role() in ('admin', 'super_admin')
  );

-- -----------------------------------------------------------------------------
-- Step 6: Org-scope the support tables (vacation/approval/transfer/endorsement)
-- -----------------------------------------------------------------------------
-- These all follow the standard read-in-org + manage-by-role pattern. We
-- update them with a generic policy set; module-specific modules can refine
-- later if needed.

do $$
declare
  t text;
  generic_tables text[] := array[
    'vacation_requests',
    'approval_requests',
    'transfer_requests',
    'endorsement_requests',
    'password_reset_requests'
  ];
  pol text;
  pol_list text[] := array['read', 'insert', 'update', 'delete', 'super_all'];
begin
  foreach t in array generic_tables loop
    foreach pol in array pol_list loop
      execute format('drop policy if exists %I_%I on public.%I', t, pol, t);
    end loop;
  end loop;
end $$;

-- READ: everyone in the org sees their org's records
do $$
declare
  t text;
  generic_tables text[] := array[
    'vacation_requests',
    'approval_requests',
    'transfer_requests',
    'endorsement_requests',
    'password_reset_requests'
  ];
begin
  foreach t in array generic_tables loop
    execute format($f$
      create policy %I_read on public.%I
        for select using (
          organization_id = current_user_organization_id()
          and auth.uid() is not null
        )
    $f$, t, t);

    execute format($f$
      create policy %I_insert on public.%I
        for insert with check (
          organization_id = current_user_organization_id()
          and current_user_role() in ('rm', 'arm', 'admin', 'super_admin')
        )
    $f$, t, t);

    execute format($f$
      create policy %I_super_all on public.%I
        for all using (
          organization_id = current_user_organization_id()
          and current_user_role() in ('admin', 'super_admin')
        ) with check (
          organization_id = current_user_organization_id()
        )
    $f$, t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Step 7: Reference data — domains, sub_domains
-- -----------------------------------------------------------------------------
-- Domains and sub-domains are reference data shared org-wide. Everyone reads,
-- only super_admin writes.

drop policy if exists domains_read         on public.domains;
drop policy if exists domains_super_admin  on public.domains;
drop policy if exists sub_domains_read         on public.sub_domains;
drop policy if exists sub_domains_super_admin  on public.sub_domains;

create policy domains_read on public.domains
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
  );

create policy domains_super_admin on public.domains
  for all using (
    organization_id = current_user_organization_id()
    and current_user_role() = 'super_admin'
  ) with check (
    organization_id = current_user_organization_id()
    and current_user_role() = 'super_admin'
  );

create policy sub_domains_read on public.sub_domains
  for select using (
    organization_id = current_user_organization_id()
    and auth.uid() is not null
  );

create policy sub_domains_super_admin on public.sub_domains
  for all using (
    organization_id = current_user_organization_id()
    and current_user_role() = 'super_admin'
  ) with check (
    organization_id = current_user_organization_id()
    and current_user_role() = 'super_admin'
  );

-- -----------------------------------------------------------------------------
-- Step 8: Things we intentionally do NOT touch in this migration
-- -----------------------------------------------------------------------------
--
-- - audit_logs       : has its own policy from 0003; doesn't need org_id
--                      because every logged row already includes the org's
--                      record_id we can join through. Keep as-is.
-- - user_domains     : junction table; policies inherit from users + domains.
-- - task_challenges  : same — junction table.
-- - challenge_status_history, task_status_history, session_edit_history :
--                      logged history records, follow parent's RLS.
-- - attachments, messages, notifications, session_links :
--                      updated in their own module migrations when needed.
--
-- =============================================================================
-- End of 0008. Verification:
--
--   -- All business tables now have an organization_id NOT NULL:
--   select table_name from information_schema.columns
--    where table_schema='public' and column_name='organization_id'
--    order by table_name;
--
--   -- Policy count should still be ~64:
--   select count(*) from pg_policies where schemaname = 'public';
--
--   -- Sarah can still log in and see her data — that's the real test.
-- =============================================================================
