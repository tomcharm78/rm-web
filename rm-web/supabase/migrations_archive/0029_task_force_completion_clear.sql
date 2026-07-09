-- =====================================================================
-- 0029  TASK FORCE — completion-clear
-- When a borrowed subtask is marked done, close out its active request so
-- it disappears from the lead's badge and the admins' lists.
-- =====================================================================

create or replace function public.task_force_complete_on_subtask_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.is_done = true and (OLD.is_done is distinct from true) then
    update public.task_force_requests
      set status = 'completed', updated_at = now()
      where subtask_id = NEW.id and status = 'active';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_task_force_complete on public.milestone_subtasks;
create trigger trg_task_force_complete
after update of is_done on public.milestone_subtasks
for each row execute function public.task_force_complete_on_subtask_done();
