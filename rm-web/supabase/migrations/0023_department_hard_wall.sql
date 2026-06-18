-- =====================================================================
-- 0023  DEPARTMENT HARD-WALL (restrictive RLS)
-- Postgres AND's restrictive policies with the permissive ones, so these
-- cap EVERYONE EXCEPT super to their own department, without dropping or
-- editing any existing policy. Super sees all; super-created / null-dept
-- rows stay super-only. Apply LAST, after stamping is everywhere.
-- =====================================================================

drop policy if exists tasks_dept_wall on public.tasks;
drop policy if exists sessions_dept_wall on public.sessions;

create policy tasks_dept_wall on public.tasks
as restrictive for select
using (public.current_user_is_super() or department_id = public.current_user_department_id());

create policy sessions_dept_wall on public.sessions
as restrictive for select
using (public.current_user_is_super() or department_id = public.current_user_department_id());
