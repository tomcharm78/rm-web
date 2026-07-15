-- CORRECTION to the org-wide read patch.
--
-- Making every department-less session readable org-wide was wrong: the Deputy
-- holds a lot of meetings, and within a year every RM's Sessions page would be
-- flooded with hundreds of records that have nothing to do with them. The signal
-- dies in the noise.
--
-- The right rule is RELEVANCE, not hierarchy: you see a session if it produced
-- work that touches you — a task assigned to you or created by you, or (for an
-- Admin) a task that landed on someone in your department. A meeting matters to
-- you when it puts something on your desk. Otherwise it is not your business.
--
-- Governance (pmo/pm) keeps its established oversight via
-- governance_covers_department() — those rules are already settled and unchanged.

ALTER POLICY sessions_read_wall ON public.sessions
USING (
  current_user_is_super()
  OR (department_id = current_user_department_id())
  OR governance_covers_department(department_id)
  -- I own or created a task from this session
  OR (EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.source_session_id = sessions.id
          AND (t.assigned_to_id = auth.uid() OR t.created_by_id = auth.uid())
      ))
  -- I am an Admin and a task from this session landed on someone in my department
  OR (EXISTS (
        SELECT 1
        FROM public.tasks t
        JOIN public.users u ON u.id = t.assigned_to_id
        WHERE t.source_session_id = sessions.id
          AND t.deleted_at IS NULL
          AND u.department_id = current_user_department_id()
          AND current_user_role() = 'admin'::user_role
      ))
);