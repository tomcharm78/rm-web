-- Governance layer, step 1 of 3: add the 'pmo' role.
-- Enum ADD VALUE must run in its own migration (cannot be used in the same
-- transaction that adds it), hence three separate files.
alter type public.user_role add value if not exists 'pmo';
