-- =====================================================================
-- 0050  VACATIONS MODULE (slice 1 schema)
--
-- 1. Extend leave_type enum: sick, hajj, unpaid, other
--    (EACH "add value" MUST run ALONE — enum values can't be used in
--     the same transaction they're created in.)
-- 2. leave_type_other: free-text when leave_type = 'other'.
-- 3. RLS REWORK — Rork policies were too loose (org-wide read leaked
--    everyone's leave). New model = direct-manager hierarchy:
--      - requester reads/inserts/cancels OWN requests
--      - a MANAGER reads + approves ONLY their DIRECT REPORTS
--        (users.admin_id = auth.uid())
--      - super admin reads/manages all
--
-- Run BLOCK BY BLOCK single-line in the Supabase SQL editor.
-- =====================================================================


-- ---- BLOCK 1 (run ALONE): enum + sick ----
alter type public.leave_type add value if not exists 'sick';


-- ---- BLOCK 2 (run ALONE): enum + hajj ----
alter type public.leave_type add value if not exists 'hajj';


-- ---- BLOCK 3 (run ALONE): enum + unpaid ----
alter type public.leave_type add value if not exists 'unpaid';


-- ---- BLOCK 4 (run ALONE): enum + other ----
alter type public.leave_type add value if not exists 'other';


-- ---- BLOCK 5: free-text column for 'other' ----
alter table public.vacation_requests add column if not exists leave_type_other text;


-- ---- BLOCK 6: drop the loose Rork policies ----
drop policy if exists vacation_requests_read on public.vacation_requests;
drop policy if exists vacation_requests_insert on public.vacation_requests;
drop policy if exists vacation_requests_admin on public.vacation_requests;
drop policy if exists vacation_requests_super_all on public.vacation_requests;


-- ---- BLOCK 7: read — own OR direct reports OR super ----
create policy vacation_requests_read on public.vacation_requests for select using (organization_id = public.current_user_organization_id() and (user_id = auth.uid() or public.current_user_is_super() or exists (select 1 from public.users u where u.id = vacation_requests.user_id and u.admin_id = auth.uid())));


-- ---- BLOCK 8: insert — self only ----
create policy vacation_requests_insert on public.vacation_requests for insert with check (organization_id = public.current_user_organization_id() and user_id = auth.uid());


-- ---- BLOCK 9: update — requester (own, e.g. cancel) OR direct manager (approve/reject) OR super ----
create policy vacation_requests_update on public.vacation_requests for update using (organization_id = public.current_user_organization_id() and (user_id = auth.uid() or public.current_user_is_super() or exists (select 1 from public.users u where u.id = vacation_requests.user_id and u.admin_id = auth.uid()))) with check (organization_id = public.current_user_organization_id());


-- ---- BLOCK 10: schema cache reload ----
notify pgrst, 'reload schema';
