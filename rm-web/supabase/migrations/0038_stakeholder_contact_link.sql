-- =====================================================================
-- 0038  CHALLENGE STAKEHOLDERS → CONTACTS DIRECTORY (option b)
-- Add a nullable link to a directory contact. The old inline columns
-- (name, organization_name, role, email, type, notes) are KEPT as a
-- fallback for now; the UI reads through contact_id once set.
-- Backfill of existing rows is run separately (see backfill block).
-- =====================================================================

alter table public.challenge_stakeholders
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists challenge_stakeholders_contact_idx
  on public.challenge_stakeholders (contact_id);
