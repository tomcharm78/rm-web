-- =====================================================================
-- 0028  TASK FORCE — fix RLS recursion (500 on read)
-- The two read policies (0025) referenced each other's table directly,
-- causing infinite RLS recursion. Move the cross-table checks into
-- SECURITY DEFINER helpers (bypass RLS => no loop) and recreate the reads.
-- =====================================================================

create or replace function public.tf_user_in_borrow(p_request_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.task_force_borrows b
    where b.request_id = p_request_id
      and (b.to_admin_id = auth.uid() or b.assigned_member_id = auth.uid())
  );
$$;

create or replace function public.tf_user_owns_request(p_request_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.task_force_requests r
    where r.id = p_request_id
      and (r.managing_admin_id = auth.uid() or r.requested_by = auth.uid())
  );
$$;

drop policy if exists task_force_requests_read on public.task_force_requests;
create policy task_force_requests_read on public.task_force_requests
for select using (
  organization_id = public.current_user_organization_id()
  and (
    requested_by = auth.uid()
    or managing_admin_id = auth.uid()
    or public.current_user_is_super()
    or public.tf_user_in_borrow(id)
  )
);

drop policy if exists task_force_borrows_read on public.task_force_borrows;
create policy task_force_borrows_read on public.task_force_borrows
for select using (
  to_admin_id = auth.uid()
  or assigned_member_id = auth.uid()
  or public.current_user_is_super()
  or public.tf_user_owns_request(request_id)
);
