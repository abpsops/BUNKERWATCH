-- Applied 2026-10-21. Fill organization_id from the caller's profile when the
-- app omits it, so inserts from SupabaseDataProvider pass RLS.
alter table competitors    alter column organization_id set default current_org_id();
alter table barges         alter column organization_id set default current_org_id();
alter table sts_operations alter column organization_id set default current_org_id();
alter table data_imports   alter column organization_id set default current_org_id();
create policy vessels_updatable on vessels for update using (true) with check (true);
