-- BunkerWatch: live AIS positions
-- Run once in Supabase SQL Editor, after schema.sql.
--
-- AIS is public broadcast data, so positions are NOT org-scoped: one
-- shared table of "where is every vessel in the Fujairah box right now",
-- written only by the worker (service role) and readable by any signed-in
-- user. Org-specific meaning (is this MMSI one of *my* tracked barges?) is
-- resolved in the browser by joining against the org's own `barges` rows.

-- ------------------------------------------------------------
-- Latest fix per vessel — one row per MMSI, upserted continuously.
-- This is the table the Live Map polls.
-- ------------------------------------------------------------
create table vessel_positions (
  mmsi bigint primary key,
  imo text,
  name text,
  ship_type integer,            -- AIS type code (e.g. 80-89 tanker, 70-79 cargo)
  destination text,
  latitude numeric not null,
  longitude numeric not null,
  speed_knots numeric,
  course_deg numeric,           -- course over ground
  heading_deg integer,          -- true heading (511 = not available, stored as null)
  nav_status integer,           -- AIS navigational status (1 = at anchor, 5 = moored, 0 = under way)
  received_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index idx_vessel_positions_received on vessel_positions(received_at desc);
create index idx_vessel_positions_imo on vessel_positions(imo) where imo is not null;

alter table vessel_positions enable row level security;
create policy vessel_positions_read on vessel_positions
  for select to authenticated using (true);
-- No insert/update policy for anon/authenticated: only the worker's
-- service-role key (which bypasses RLS) may write.

-- Deliberately NOT added to the Realtime publication: with hundreds of
-- vessels upserted every few seconds, postgres_changes would burn through
-- the free tier's monthly message quota in days. The Live Map polls this
-- table every 10 s instead — plain reads, which are effectively free.

-- ------------------------------------------------------------
-- History — append-only track points, for replaying "who was alongside
-- whom" in the Market Analyzer. Thinned by the worker (one point per
-- vessel per ~2 min while moving, ~10 min while stationary).
-- ------------------------------------------------------------
create table vessel_position_history (
  id bigint generated always as identity primary key,
  mmsi bigint not null,
  imo text,
  latitude numeric not null,
  longitude numeric not null,
  speed_knots numeric,
  course_deg numeric,
  nav_status integer,
  received_at timestamptz not null
);

create index idx_vph_mmsi_time on vessel_position_history(mmsi, received_at desc);
create index idx_vph_time on vessel_position_history(received_at desc);

alter table vessel_position_history enable row level security;
create policy vph_read on vessel_position_history
  for select to authenticated using (true);

-- Retention: keep 90 days. Schedule this with pg_cron (Database → Extensions
-- → enable pg_cron, then run the `cron.schedule` line once) or call it from
-- the worker daily.
create or replace function prune_vessel_position_history() returns void
language sql security definer as $$
  delete from vessel_position_history where received_at < now() - interval '90 days';
  delete from vessel_positions where received_at < now() - interval '7 days';
$$;

-- select cron.schedule('prune-vessel-history', '15 3 * * *', 'select prune_vessel_position_history()');
