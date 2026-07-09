-- =====================================================================
-- 0047  KPI — executive goal target TYPES
--
-- Executive goals can be measured as:
--   count      → progress auto-tallied from completed linked tasks/challenges
--   percentage → progress is an admin-reported current_value (e.g. 22 toward 30%)
--   sar        → progress is an admin-reported current_value (SAR amount)
--
-- unit_label   : optional display unit ("investors", "%", "SAR M")
-- current_value: admin-reported achieved value (used for percentage/sar)
--
-- Run BLOCK BY BLOCK single-line in the Supabase SQL editor.
-- =====================================================================


-- ---- BLOCK 1: target_type ----
alter table public.department_goals add column if not exists target_type text not null default 'count' check (target_type in ('count','percentage','sar'));


-- ---- BLOCK 2: unit_label ----
alter table public.department_goals add column if not exists unit_label text not null default '';


-- ---- BLOCK 3: current_value (admin-reported achieved, for percentage/sar) ----
alter table public.department_goals add column if not exists current_value numeric not null default 0;


-- ---- BLOCK 4: schema cache reload ----
notify pgrst, 'reload schema';
