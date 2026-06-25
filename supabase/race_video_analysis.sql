create table if not exists public.race_video_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete set null,
  competition_name text,
  competition_date date,
  result_id uuid references public.competition_results(id) on delete set null,
  title text not null,
  event text not null,
  pool_length integer not null check (pool_length in (25, 50)),
  race_distance integer not null check (race_distance > 0),
  video_url text,
  video_start_seconds integer not null default 0,
  video_end_seconds integer,
  athlete_lane integer check (athlete_lane between 1 and 8),
  lanes jsonb not null default '[]'::jsonb,
  is_pb_reference boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.race_video_analyses enable row level security;

drop policy if exists "race_video_analyses_select_own" on public.race_video_analyses;
create policy "race_video_analyses_select_own"
on public.race_video_analyses for select
using (user_id = auth.uid() or public.is_linked_coach(user_id));

drop policy if exists "race_video_analyses_insert_own" on public.race_video_analyses;
create policy "race_video_analyses_insert_own"
on public.race_video_analyses for insert
with check (user_id = auth.uid());

drop policy if exists "race_video_analyses_update_own" on public.race_video_analyses;
create policy "race_video_analyses_update_own"
on public.race_video_analyses for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "race_video_analyses_delete_own" on public.race_video_analyses;
create policy "race_video_analyses_delete_own"
on public.race_video_analyses for delete
using (user_id = auth.uid());

create index if not exists race_video_analyses_user_event_idx
  on public.race_video_analyses (user_id, event, created_at desc);

alter table public.race_video_analyses
  add column if not exists competition_name text;

alter table public.race_video_analyses
  add column if not exists competition_date date;
