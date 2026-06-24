-- ============================================================
-- TASK MANAGER — Complete Supabase Schema
-- Run this entire file in: Supabase → SQL Editor → New Query
-- ============================================================

-- 1. PROFILES (extends Supabase auth.users)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  role          text not null default 'member' check (role in ('admin','manager','member')),
  department    text,
  created_at    timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'member')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. TASKS
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  assigned_to   uuid references public.profiles(id) on delete set null,
  category      text not null default 'other' check (category in ('maintenance','review','report','meeting','audit','other')),
  priority      text not null default 'medium' check (priority in ('high','medium','low')),
  frequency     text not null default 'once' check (frequency in ('daily','weekly','monthly','quarterly','yearly','once')),
  status        text not null default 'pending' check (status in ('pending','in-progress','review','done')),
  due_date      date,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- 3. ROW-LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.tasks    enable row level security;

-- Profiles: everyone can read; own row writable
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Tasks: authenticated users can read all
create policy "tasks_select" on public.tasks for select using (auth.role() = 'authenticated');

-- Tasks: admin + manager can insert/update/delete (enforced in app by role check)
create policy "tasks_insert" on public.tasks for insert with check (auth.role() = 'authenticated');
create policy "tasks_update" on public.tasks for update using (auth.role() = 'authenticated');
create policy "tasks_delete" on public.tasks for delete using (auth.role() = 'authenticated');

-- 4. SAMPLE DATA (optional — delete after testing)
-- Insert via the app after your first admin signs up.

-- ============================================================
-- Done! Go back to the setup guide and continue to Step 3.
-- ============================================================
