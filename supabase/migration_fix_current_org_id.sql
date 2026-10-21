-- Applied 2026-10-21. current_org_id() read user_profiles under RLS while the
-- user_profiles policy called current_org_id() -> infinite recursion; every
-- authenticated query failed. Run it as owner and add a self-row policy.
create or replace function current_org_id()
returns uuid language sql stable security definer set search_path = public
as $$ select organization_id from user_profiles where id = auth.uid() $$;
revoke all on function current_org_id() from public;
grant execute on function current_org_id() to authenticated, anon, service_role;
drop policy if exists self_org_select on user_profiles;
create policy self_select on user_profiles for select using (id = auth.uid());
create policy org_select on user_profiles for select using (organization_id = current_org_id());
