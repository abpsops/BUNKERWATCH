-- Applied 2026-10-21. Extra particulars available from ShipFinder's
-- Vessels-in-Zone feed, plus which feed each row came from.
alter table vessel_positions
  add column if not exists call_sign text,
  add column if not exists length_m numeric,
  add column if not exists width_m numeric,
  add column if not exists draught_m numeric,
  add column if not exists eta timestamptz,
  add column if not exists dest_code text,
  add column if not exists source text not null default 'aisstream';
