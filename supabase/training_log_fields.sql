alter table public.training_logs
  add column if not exists session_period text
  check (session_period in ('오전', '오후'));

alter table public.training_logs
  add column if not exists pace_seconds numeric(7, 2)
  check (pace_seconds is null or pace_seconds > 0);

update public.training_logs
set session_period = '오후'
where session_period is null;

alter table public.training_logs
  alter column session_period set default '오후';
