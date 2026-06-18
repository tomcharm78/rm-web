-- =====================================================================
-- 0020a  DEPARTMENTS scoping layer — structure + backfill (ADDITIVE)
-- Changes NO existing RLS, so current app behavior is unchanged.
-- The department hard-wall is applied separately in 0023.
-- =====================================================================

-- 1. departments: first-class named container (multiple admins per dept)
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text not null,
  is_active boolean not null default true,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  external_id text,
  source_system text,
  source_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 2. home department on users + denormalized department on scoped tables
alter table public.users    add column if not exists department_id uuid references public.departments(id);
alter table public.tasks    add column if not exists department_id uuid references public.departments(id);
alter table public.sessions add column if not exists department_id uuid references public.departments(id);

-- 3. helpers (SECURITY DEFINER so they never re-trigger RLS)
create or replace function public.current_user_is_super()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.current_user_department_id()
returns uuid language sql security definer stable set search_path = public as $$
  select department_id from public.users where id = auth.uid();
$$;

-- 4. departments RLS: org members read; only super_admin manages
alter table public.departments enable row level security;

create policy departments_read on public.departments
for select using (organization_id = public.current_user_organization_id());

create policy departments_super_write on public.departments
for all
using      (organization_id = public.current_user_organization_id() and public.current_user_is_super())
with check (organization_id = public.current_user_organization_id() and public.current_user_is_super());

-- 5. BACKFILL ----------------------------------------------------------
-- 5a. the one existing department
insert into public.departments (name, name_ar)
values ('Investors Relations Department', 'إدارة علاقات المستثمرين');

-- 5b. assign admin(s) to it (James is the only admin today)
update public.users u
set department_id = d.id
from public.departments d
where d.name = 'Investors Relations Department'
  and u.role = 'admin'
  and u.deleted_at is null;

-- 5c. rm/arm inherit their admin's department
update public.users u
set department_id = a.department_id
from public.users a
where u.admin_id = a.id
  and u.department_id is null
  and a.department_id is not null;

-- 5d. stamp existing tasks from their assignee's department
update public.tasks t
set department_id = u.department_id
from public.users u
where t.assigned_to_id = u.id
  and t.department_id is null;

-- 5e. stamp existing sessions from their creator's department
update public.sessions s
set department_id = u.department_id
from public.users u
where s.created_by_id = u.id
  and s.department_id is null;

-- super_admins keep department_id null (above all departments).
