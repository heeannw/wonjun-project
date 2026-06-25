create table if not exists public.race_video_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid references public.race_video_analyses(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  video_url text not null,
  video_start_seconds integer not null check (video_start_seconds >= 0),
  video_end_seconds integer not null check (video_end_seconds > video_start_seconds),
  event text not null,
  pool_length integer not null check (pool_length in (25, 50)),
  race_distance integer not null check (race_distance > 0),
  checkpoint_distances jsonb not null default '[]'::jsonb,
  result jsonb,
  error_message text,
  worker_name text,
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.race_video_analysis_jobs enable row level security;

drop policy if exists "race_video_analysis_jobs_select_own" on public.race_video_analysis_jobs;
create policy "race_video_analysis_jobs_select_own"
on public.race_video_analysis_jobs for select
using (user_id = auth.uid());

drop policy if exists "race_video_analysis_jobs_insert_own" on public.race_video_analysis_jobs;
create policy "race_video_analysis_jobs_insert_own"
on public.race_video_analysis_jobs for insert
with check (user_id = auth.uid() and status = 'queued');

drop policy if exists "race_video_analysis_jobs_cancel_own" on public.race_video_analysis_jobs;
create policy "race_video_analysis_jobs_cancel_own"
on public.race_video_analysis_jobs for update
using (user_id = auth.uid() and status = 'queued')
with check (user_id = auth.uid() and status = 'cancelled');

create index if not exists race_video_analysis_jobs_queue_idx
  on public.race_video_analysis_jobs (status, created_at);

create index if not exists race_video_analysis_jobs_user_idx
  on public.race_video_analysis_jobs (user_id, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.race_video_analysis_jobs;
exception
  when duplicate_object then null;
end $$;
