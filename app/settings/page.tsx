
-- Run this in Supabase SQL Editor
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;
create policy "settings_select" on public.app_settings for select using (true);
create policy "settings_upsert" on public.app_settings for insert with check (auth.role() = 'authenticated');
create policy "settings_update" on public.app_settings for update using (auth.role() = 'authenticated');

-- Insert defaults
insert into public.app_settings (key, value) values
  ('categories',  '["maintenance","review","report","meeting","audit","other"]'),
  ('frequencies', '[{"key":"daily","label":"Daily"},{"key":"weekly","label":"Weekly"},{"key":"monthly","label":"Monthly"},{"key":"quarterly","label":"Quarterly"},{"key":"yearly","label":"Yearly"},{"key":"once","label":"One-time"}]')
on conflict (key) do nothing;
