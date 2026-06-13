-- Coach access setup for WONJUN PROJECT
-- Run this once in Supabase SQL Editor after creating the coach auth user.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('athlete', 'coach')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_athlete_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'pending', 'inactive')),
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  note_date date not null default current_date,
  category text not null default '코칭 메모',
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.coach_athlete_links enable row level security;
alter table public.coach_notes enable row level security;

create or replace function public.is_linked_coach(target_athlete_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_athlete_links l
    where l.coach_id = auth.uid()
      and l.athlete_id = target_athlete_id
      and l.status = 'active'
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "coach_links_select_related" on public.coach_athlete_links;
create policy "coach_links_select_related"
on public.coach_athlete_links for select
using (coach_id = auth.uid() or athlete_id = auth.uid());

drop policy if exists "coach_notes_select_related" on public.coach_notes;
create policy "coach_notes_select_related"
on public.coach_notes for select
using (coach_id = auth.uid() or athlete_id = auth.uid());

drop policy if exists "coach_notes_insert_by_linked_coach" on public.coach_notes;
create policy "coach_notes_insert_by_linked_coach"
on public.coach_notes for insert
with check (coach_id = auth.uid() and public.is_linked_coach(athlete_id));

drop policy if exists "coach_notes_update_own" on public.coach_notes;
create policy "coach_notes_update_own"
on public.coach_notes for update
using (coach_id = auth.uid())
with check (coach_id = auth.uid());

drop policy if exists "coach_notes_delete_own" on public.coach_notes;
create policy "coach_notes_delete_own"
on public.coach_notes for delete
using (coach_id = auth.uid());

-- Coach read access to linked athlete data.
-- Existing athlete self-access policies should remain as-is; these are additive coach policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'athlete_profiles',
    'training_logs',
    'personal_bests',
    'goals',
    'mental_journals',
    'body_records',
    'strength_records',
    'competitions',
    'competition_results',
    'training_plans',
    'training_feedback'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'coach_select_linked_' || table_name, table_name);
      execute format(
        'create policy %I on public.%I for select using (public.is_linked_coach(user_id))',
        'coach_select_linked_' || table_name,
        table_name
      );
    end if;
  end loop;
end $$;

-- After creating auth users, set roles and connect coach to athlete.
-- Replace the UUID values below with actual auth.users IDs.
--
-- insert into public.profiles (id, role, display_name)
-- values
--   ('ATHLETE_USER_ID', 'athlete', '원준'),
--   ('COACH_USER_ID', 'coach', '코치 이름')
-- on conflict (id) do update
-- set role = excluded.role,
--     display_name = excluded.display_name,
--     updated_at = now();
--
-- insert into public.coach_athlete_links (coach_id, athlete_id, status)
-- values ('COACH_USER_ID', 'ATHLETE_USER_ID', 'active')
-- on conflict (coach_id, athlete_id) do update
-- set status = 'active';
