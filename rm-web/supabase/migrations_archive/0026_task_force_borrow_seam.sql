-- =====================================================================
-- 0026  TASK FORCE — borrow seam
-- (1) dept-wall allowance: you may read a task if you own a subtask on it
-- (2) approve_borrow(): lending admin assigns their employee -> sets the
--     subtask owner cross-dept + activates the request, atomically (definer).
-- =====================================================================

-- (1) helper + widen the restrictive wall ------------------------------
create or replace function public.user_owns_subtask_on_task(p_task_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.milestone_subtasks ms
    join public.task_milestones m on m.id = ms.milestone_id
    where m.task_id = p_task_id and ms.assigned_to_id = auth.uid()
  );
$$;

drop policy if exists tasks_dept_wall on public.tasks;
create policy tasks_dept_wall on public.tasks
as restrictive for select
using (
  public.current_user_is_super()
  or department_id = public.current_user_department_id()
  or public.user_owns_subtask_on_task(id)
);

-- (2) approve_borrow: lending admin approves + assigns one of THEIR team ---
create or replace function public.approve_borrow(p_borrow_id uuid, p_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_request_id uuid;
  v_to_admin uuid;
  v_subtask_id uuid;
begin
  select b.request_id, b.to_admin_id into v_request_id, v_to_admin
  from public.task_force_borrows b where b.id = p_borrow_id;
  if v_request_id is null then
    raise exception 'borrow not found';
  end if;

  -- only the lending admin (or super) may approve
  if v_to_admin <> v_caller and not public.current_user_is_super() then
    raise exception 'not authorized to approve this borrow';
  end if;

  -- the assigned member must be on the lending admin's own team
  if not public.current_user_is_super()
     and not exists (select 1 from public.users u where u.id = p_member_id and u.admin_id = v_caller) then
    raise exception 'assigned member must be on the lending admin team';
  end if;

  -- approve this borrow
  update public.task_force_borrows
    set status = 'approved', assigned_member_id = p_member_id, updated_at = now()
    where id = p_borrow_id;

  -- withdraw any sibling pending borrows on the same request
  update public.task_force_borrows
    set status = 'withdrawn', updated_at = now()
    where request_id = v_request_id and id <> p_borrow_id and status = 'pending';

  -- activate the request + hand the subtask to the borrowed member.
  -- support_status='requested' makes the existing notify_subtask_support trigger
  -- fire and the subtask land in the member's "Subtasks I own" inbox.
  select subtask_id into v_subtask_id from public.task_force_requests where id = v_request_id;
  update public.task_force_requests set status = 'active', updated_at = now() where id = v_request_id;
  update public.milestone_subtasks
    set assigned_to_id = p_member_id, support_status = 'requested',
        support_decline_reason = null, updated_at = now()
    where id = v_subtask_id;
end $$;

grant execute on function public.approve_borrow(uuid, uuid) to authenticated;
