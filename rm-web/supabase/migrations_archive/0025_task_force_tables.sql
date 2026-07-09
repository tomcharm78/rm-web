-- =====================================================================
-- 0025  TASK FORCE — approval engine (schema + RLS)
-- Two-stage borrow workflow: RM/ARM -> managing admin -> other-dept admins.
-- Delivery (subtask -> member inbox -> done) reuses existing subtask/support.
-- =====================================================================

create table if not exists public.task_force_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  subtask_id uuid not null references public.milestone_subtasks(id) on delete cascade,
  requested_by uuid not null references public.users(id),       -- the RM/ARM lead
  request_note text,                                            -- help-needed description
  managing_admin_id uuid references public.users(id),           -- Admin 1
  admin1_status text not null default 'pending'
    check (admin1_status in ('pending','approved','rejected')),
  admin1_rejected_reason text,
  status text not null default 'requested'
    check (status in ('requested','sourcing','active','completed','rejected','cancelled')),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.task_force_borrows (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.task_force_requests(id) on delete cascade,
  to_admin_id uuid not null references public.users(id),        -- lending admin asked
  to_department_id uuid references public.departments(id),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','withdrawn')),
  assigned_member_id uuid references public.users(id),          -- employee the lending admin assigns
  rejected_reason text,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tfr_task on public.task_force_requests(task_id);
create index if not exists idx_tfr_subtask on public.task_force_requests(subtask_id);
create index if not exists idx_tfr_admin on public.task_force_requests(managing_admin_id);
-- only one live request per subtask (new subtask => new request)
create unique index if not exists uq_tfr_active_subtask on public.task_force_requests(subtask_id)
  where status in ('requested','sourcing','active') and deleted_at is null;
create index if not exists idx_tfb_request on public.task_force_borrows(request_id);
create index if not exists idx_tfb_to_admin on public.task_force_borrows(to_admin_id);
create index if not exists idx_tfb_member on public.task_force_borrows(assigned_member_id);

alter table public.task_force_requests enable row level security;
alter table public.task_force_borrows  enable row level security;

-- ---- requests RLS: visible to lead, Admin 1, lending admins/members, super ----
-- NOTE: the read policies here are SUPERSEDED by 0028 (recursion fix). Kept for history.
create policy task_force_requests_read on public.task_force_requests
for select using (
  organization_id = public.current_user_organization_id()
  and (
    requested_by = auth.uid()
    or managing_admin_id = auth.uid()
    or public.current_user_is_super()
    or exists (
      select 1 from public.task_force_borrows b
      where b.request_id = task_force_requests.id
        and (b.to_admin_id = auth.uid() or b.assigned_member_id = auth.uid())
    )
  )
);

create policy task_force_requests_insert on public.task_force_requests
for insert with check (
  organization_id = public.current_user_organization_id()
  and requested_by = auth.uid()
  and exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to_id = auth.uid())
);

create policy task_force_requests_update on public.task_force_requests
for update using (
  managing_admin_id = auth.uid() or requested_by = auth.uid() or public.current_user_is_super()
) with check (organization_id = public.current_user_organization_id());

-- ---- borrows RLS ----
create policy task_force_borrows_read on public.task_force_borrows
for select using (
  to_admin_id = auth.uid()
  or assigned_member_id = auth.uid()
  or public.current_user_is_super()
  or exists (
    select 1 from public.task_force_requests r
    where r.id = request_id and (r.managing_admin_id = auth.uid() or r.requested_by = auth.uid())
  )
);

create policy task_force_borrows_insert on public.task_force_borrows
for insert with check (
  exists (select 1 from public.task_force_requests r where r.id = request_id and r.managing_admin_id = auth.uid())
);

create policy task_force_borrows_update on public.task_force_borrows
for update using (
  to_admin_id = auth.uid()
  or public.current_user_is_super()
  or exists (select 1 from public.task_force_requests r where r.id = request_id and r.managing_admin_id = auth.uid())
) with check (organization_id = public.current_user_organization_id());
