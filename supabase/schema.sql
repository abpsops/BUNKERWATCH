-- BunkerWatch — Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) against a
-- fresh project. Designed for Supabase Auth + Row Level Security.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANIZATIONS & USERS
-- ============================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type user_role as enum ('ADMIN', 'ANALYST', 'VIEWER');

create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'ANALYST',
  created_at timestamptz not null default now()
);

create index idx_user_profiles_org on user_profiles(organization_id);

-- Helper used throughout RLS policies below.
create or replace function current_org_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select organization_id from user_profiles where id = auth.uid()
$$;

-- ============================================================
-- COMPETITORS
-- ============================================================
create table competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_competitors_org on competitors(organization_id);

-- ============================================================
-- BARGES
-- ============================================================
create table barges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  name text not null,
  imo text not null,
  mmsi text,
  call_sign text,
  flag text,
  vessel_type text,
  dwt integer,
  loa numeric,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_barge_org_imo unique (organization_id, imo),
  constraint chk_barge_imo_format check (imo ~ '^\d{7}$')
);

create index idx_barges_org on barges(organization_id);
create index idx_barges_competitor on barges(competitor_id);
create index idx_barges_imo on barges(imo);

-- ============================================================
-- VESSELS (receiving vessels observed across all competitors)
-- ============================================================
create table vessels (
  id uuid primary key default gen_random_uuid(),
  imo text unique,
  mmsi text,
  name text not null,
  vessel_type text,
  flag text,
  dwt integer,
  loa numeric,
  call_sign text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vessels_imo on vessels(imo);
create index idx_vessels_name on vessels(name);

-- ============================================================
-- STS OPERATIONS
-- ============================================================
create type operation_type as enum ('STS_BUNKERING', 'STS_SUPPLY', 'OTHER_STS');

create table sts_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  barge_id uuid not null references barges(id) on delete cascade,
  barge_imo text not null,
  barge_name text not null,
  competitor_id uuid not null references competitors(id) on delete cascade,
  competitor_name text not null,

  receiving_vessel_id uuid references vessels(id),
  receiving_vessel_imo text,
  receiving_vessel_name text not null,

  operation_date date not null,
  start_time time,
  end_time time,
  duration_minutes integer,

  location text,
  latitude numeric,
  longitude numeric,

  operation_type operation_type not null,
  raw_operation_label text not null,

  source_provider text not null,
  source_record_id text,
  confidence text not null default 'high' check (confidence in ('high', 'medium', 'low')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_operation_source unique (organization_id, source_provider, source_record_id)
);

create index idx_sts_org on sts_operations(organization_id);
create index idx_sts_barge on sts_operations(barge_id);
create index idx_sts_barge_imo on sts_operations(barge_imo);
create index idx_sts_date on sts_operations(operation_date);
create index idx_sts_type on sts_operations(operation_type);
create index idx_sts_location on sts_operations(location);
create index idx_sts_receiving_vessel on sts_operations(receiving_vessel_id);
create index idx_sts_receiving_imo on sts_operations(receiving_vessel_imo);
create index idx_sts_competitor on sts_operations(competitor_id);

-- ============================================================
-- DATA IMPORT TRACKING
-- ============================================================
create table data_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  filename text not null,
  provider text not null,
  records_detected integer not null default 0,
  records_imported integer not null default 0,
  records_skipped integer not null default 0,
  records_failed integer not null default 0,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  error_summary text,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now()
);

create table data_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references data_imports(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  normalized_data jsonb,
  status text not null check (status in ('valid','duplicate','invalid','imported')),
  error_message text
);

create index idx_import_rows_import on data_import_rows(import_id);

-- ============================================================
-- WATCHLISTS
-- ============================================================
create table watchlists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table watchlist_barges (
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  barge_id uuid not null references barges(id) on delete cascade,
  primary key (watchlist_id, barge_id)
);

-- ============================================================
-- SAVED SEARCHES
-- ============================================================
create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  filters_json jsonb not null,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- ALERTS
-- ============================================================
create table alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  alert_type text not null check (alert_type in ('competitor_activity','barge_activity','vessel_activity')),
  conditions_json jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references user_profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_org on audit_logs(organization_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table competitors enable row level security;
alter table barges enable row level security;
alter table sts_operations enable row level security;
alter table data_imports enable row level security;
alter table data_import_rows enable row level security;
alter table watchlists enable row level security;
alter table watchlist_barges enable row level security;
alter table saved_searches enable row level security;
alter table alerts enable row level security;
alter table audit_logs enable row level security;
alter table user_profiles enable row level security;

create policy org_isolation_select on competitors for select using (organization_id = current_org_id());
create policy org_isolation_write on competitors for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());

create policy org_isolation_select on barges for select using (organization_id = current_org_id());
create policy org_isolation_write on barges for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());

create policy org_isolation_select on sts_operations for select using (organization_id = current_org_id());
create policy org_isolation_write on sts_operations for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());

create policy org_isolation_select on data_imports for select using (organization_id = current_org_id());
create policy org_isolation_write on data_imports for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());

create policy org_isolation_select on data_import_rows for select
  using (import_id in (select id from data_imports where organization_id = current_org_id()));

create policy org_isolation_select on watchlists for select using (organization_id = current_org_id());
create policy org_isolation_write on watchlists for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());

create policy org_isolation_select on watchlist_barges for select
  using (watchlist_id in (select id from watchlists where organization_id = current_org_id()));

create policy org_isolation_select on saved_searches for select using (organization_id = current_org_id());
create policy org_isolation_write on saved_searches for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());

create policy org_isolation_select on alerts for select using (organization_id = current_org_id());
create policy org_isolation_write on alerts for all using (organization_id = current_org_id()) with check (organization_id = current_org_id());

create policy org_isolation_select on audit_logs for select using (organization_id = current_org_id());

create policy self_select on user_profiles for select using (id = auth.uid());
create policy org_select on user_profiles for select using (organization_id = current_org_id());

-- vessels intentionally has no org scoping — it's a shared reference table
-- of vessels observed across imports, not organization-owned data.
alter table vessels enable row level security;
create policy vessels_readable on vessels for select using (true);
create policy vessels_writable on vessels for insert with check (true);
