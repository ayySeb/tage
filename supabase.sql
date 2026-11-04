-- Schema for Tage sync. Run once in the Supabase SQL editor.

create table public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at bigint not null,          -- the task's own updatedAt (ms), decides which edit wins
  synced_at timestamptz not null default now()  -- set by the server on every write, used as pull cursor
);

create index tasks_user_synced on public.tasks (user_id, synced_at);

-- Everyone sees and changes only their own tasks.
alter table public.tasks enable row level security;
create policy "own tasks" on public.tasks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A late upload of an older version never overwrites a newer one.
create function public.tasks_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

-- Push changes to other open devices right away.
alter publication supabase_realtime add table public.tasks;

-- Calendar subscriptions (iCal addresses). The edge function "ics" fetches them on the user's behalf.
create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default '',
  url text not null,
  color text not null default 'blue',
  only_single boolean not null default false,  -- hide recurring events, show one-off appointments only
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
create policy "own feeds" on public.calendar_feeds for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
