-- super-admins may edit their own organization's (deputyship) name
drop policy if exists organizations_super_update on public.organizations;
create policy organizations_super_update on public.organizations
for update using (
  public.current_user_is_super() and id = public.current_user_organization_id()
) with check (
  public.current_user_is_super() and id = public.current_user_organization_id()
);
