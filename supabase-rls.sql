create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id),
  email text,
  created_at timestamp with time zone default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.schedules(id) on delete cascade,
  user_id uuid references auth.users(id) not null,
  title text not null,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  priority text,
  status text default 'open',
  notes text,
  created_at timestamp with time zone default now()
);

create index if not exists schedules_user_id_idx on public.schedules(user_id);
create index if not exists schedule_items_user_id_idx on public.schedule_items(user_id);
create index if not exists schedule_items_schedule_id_idx on public.schedule_items(schedule_id);

alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_items enable row level security;

drop policy if exists "Users can select their own profile" on public.profiles;
create policy "Users can select their own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
on public.profiles for delete
using (auth.uid() = id);

drop policy if exists "Users can select their own schedules" on public.schedules;
create policy "Users can select their own schedules"
on public.schedules for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own schedules" on public.schedules;
create policy "Users can insert their own schedules"
on public.schedules for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own schedules" on public.schedules;
create policy "Users can update their own schedules"
on public.schedules for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own schedules" on public.schedules;
create policy "Users can delete their own schedules"
on public.schedules for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select their own schedule items" on public.schedule_items;
create policy "Users can select their own schedule items"
on public.schedule_items for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own schedule items" on public.schedule_items;
create policy "Users can insert their own schedule items"
on public.schedule_items for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own schedule items" on public.schedule_items;
create policy "Users can update their own schedule items"
on public.schedule_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own schedule items" on public.schedule_items;
create policy "Users can delete their own schedule items"
on public.schedule_items for delete
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
