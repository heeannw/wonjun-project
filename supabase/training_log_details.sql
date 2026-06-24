-- Additional training log details.
-- Run once in the Supabase SQL Editor.

alter table public.training_logs
  add column if not exists equipment text[] not null default '{}';

alter table public.training_logs
  add column if not exists cycle_minutes integer
  check (cycle_minutes is null or cycle_minutes >= 0);

alter table public.training_logs
  add column if not exists cycle_seconds integer
  check (cycle_seconds is null or cycle_seconds between 0 and 59);

alter table public.training_logs
  add column if not exists dive_count integer
  check (dive_count is null or dive_count >= 0);
