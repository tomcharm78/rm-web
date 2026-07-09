-- =====================================================================
-- 0036  TASKS — source_challenge_id
-- Mirrors source_session_id: a nullable pointer marking that a task was
-- generated from a challenge. Drives the "From Challenge" badge + deep link.
-- (task_challenges stays reserved for a future many-to-many need.)
-- =====================================================================

alter table public.tasks
  add column if not exists source_challenge_id uuid references public.challenges(id) on delete set null;

create index if not exists tasks_source_challenge_idx
  on public.tasks (source_challenge_id);
