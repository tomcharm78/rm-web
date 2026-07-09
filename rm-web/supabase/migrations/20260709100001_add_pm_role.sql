-- Governance layer, step 2 of 3: add the 'pm' role.
alter type public.user_role add value if not exists 'pm';
