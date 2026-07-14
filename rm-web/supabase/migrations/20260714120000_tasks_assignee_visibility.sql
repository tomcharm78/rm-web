-- A task's ASSIGNEE (or creator) can always read it, regardless of role or
-- department. The dept wall was written for departmental scoping and governance
-- oversight; it never anticipated governance users being assignees of
-- department-less tasks (pm/pmo have department_id = null, so the task's
-- department_id is null and every departmental clause fails — the task was
-- invisible to its own assignee).

ALTER POLICY tasks_dept_wall ON public.tasks
USING (
  current_user_is_super()
  OR (department_id = current_user_department_id())
  OR user_owns_subtask_on_task(id)
  OR governance_covers_department(department_id)
  OR assigned_to_id = auth.uid()
  OR created_by_id = auth.uid()
);