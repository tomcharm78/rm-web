-- =====================================================================
-- 0049  Sessions dept-wall: allow task assignee/creator to read the
--       source session even when it belongs to another department
--       (or has null department_id, e.g. created by a super admin).
--
-- PROBLEM: the RESTRICTIVE sessions_dept_wall (migration 0023) ANDs with
-- all permissive policies, so it was overriding sessions_read_task_assignee
-- (migration 0013). A task whose source session was created by a super
-- (department_id = null) was unreadable by the RM/ARM assignee → error
-- "Session not found or not accessible".
--
-- FIX: add an OR branch to the dept-wall — yield when the session is the
-- source of a task assigned to or created by the current user. Narrowly
-- scoped: does NOT open cross-department session browsing, only sessions
-- that sourced the user's own tasks.
--
-- Run BLOCK BY BLOCK single-line in the Supabase SQL editor.
-- (Already applied live Jul 6 2026; this file is for repo reproducibility.)
-- =====================================================================


-- ---- BLOCK 1: drop the old restrictive wall ----
drop policy if exists sessions_dept_wall on public.sessions;


-- ---- BLOCK 2: recreate with the task-link escape hatch ----
create policy sessions_dept_wall on public.sessions as restrictive for all using (current_user_is_super() or department_id = current_user_department_id() or exists (select 1 from public.tasks t where t.source_session_id = sessions.id and (t.assigned_to_id = auth.uid() or t.created_by_id = auth.uid())));


-- ---- BLOCK 3: reload schema ----
notify pgrst, 'reload schema';
