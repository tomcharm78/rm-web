-- =====================================================================
-- 0022  task/session <-> department SYNC (triggers)
-- A task's department follows its assignee; a session's its creator.
-- Auto-stamps on insert + any assigned_to_id change (reassign/transfer).
-- No app code changes needed.
-- =====================================================================

create or replace function public.sync_task_department()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  NEW.department_id := (select u.department_id from public.users u where u.id = NEW.assigned_to_id);
  return NEW;
end $$;

drop trigger if exists trg_sync_task_department on public.tasks;
create trigger trg_sync_task_department
before insert or update of assigned_to_id on public.tasks
for each row execute function public.sync_task_department();

create or replace function public.sync_session_department()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  NEW.department_id := (select u.department_id from public.users u where u.id = NEW.created_by_id);
  return NEW;
end $$;

drop trigger if exists trg_sync_session_department on public.sessions;
create trigger trg_sync_session_department
before insert or update of created_by_id on public.sessions
for each row execute function public.sync_session_department();
