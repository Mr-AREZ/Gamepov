-- =====================================================================
-- Gamepov — Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query
-- The FIRST account that signs up automatically becomes the admin.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ---------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Viewer',
  role         text not null default 'viewer' check (role in ('admin','viewer')),
  created_at   timestamptz not null default now()
);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  cover_url   text,
  description text,
  genre       text,
  platform    text,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists public.streams (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  description      text,
  game_id          uuid references public.games(id) on delete set null,
  kind             text not null default 'stream' check (kind in ('stream','clip','highlight')),
  source           text not null default 'youtube' check (source in ('youtube','twitch','upload')),
  video_ref        text not null,
  thumbnail_url    text,
  duration_seconds integer not null default 0,
  published_at     timestamptz not null default now(),
  is_published     boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists streams_game_idx on public.streams(game_id);
create index if not exists streams_published_idx on public.streams(published_at desc);

create table if not exists public.schedule (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  game_id    uuid references public.games(id) on delete set null,
  starts_at  timestamptz not null,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text,
  body         text not null default '',
  cover_url    text,
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  icon        text default '🏆',
  achieved_at date,
  created_at  timestamptz not null default now()
);

create table if not exists public.sponsors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  url        text,
  logo_url   text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  stream_id   uuid not null references public.streams(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists comments_stream_idx on public.comments(stream_id, created_at);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null check (char_length(email) between 3 and 200),
  subject    text,
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

-- ---------- Helpers --------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Create a profile for every new account. The very first one becomes admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles where role = 'admin') into first_user;
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    case when first_user then 'admin' else 'viewer' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row level security ---------------------------------------

alter table public.profiles     enable row level security;
alter table public.settings     enable row level security;
alter table public.games        enable row level security;
alter table public.streams      enable row level security;
alter table public.schedule     enable row level security;
alter table public.posts        enable row level security;
alter table public.achievements enable row level security;
alter table public.sponsors     enable row level security;
alter table public.comments     enable row level security;
alter table public.messages     enable row level security;

-- profiles
drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update using (public.is_admin());

-- public-read, admin-write tables
do $$
declare t text;
begin
  foreach t in array array['settings','games','schedule','achievements','sponsors'] loop
    execute format('drop policy if exists "%1$s public read" on public.%1$s', t);
    execute format('create policy "%1$s public read" on public.%1$s for select using (true)', t);
    execute format('drop policy if exists "%1$s admin write" on public.%1$s', t);
    execute format('create policy "%1$s admin write" on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- streams & posts: the public only sees published rows
drop policy if exists "streams public read" on public.streams;
create policy "streams public read" on public.streams
  for select using (is_published or public.is_admin());
drop policy if exists "streams admin write" on public.streams;
create policy "streams admin write" on public.streams
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "posts public read" on public.posts;
create policy "posts public read" on public.posts
  for select using (is_published or public.is_admin());
drop policy if exists "posts admin write" on public.posts;
create policy "posts admin write" on public.posts
  for all using (public.is_admin()) with check (public.is_admin());

-- comments: anyone reads, signed-in users write as themselves, owner/admin delete
drop policy if exists "comments public read" on public.comments;
create policy "comments public read" on public.comments for select using (true);
drop policy if exists "comments insert own" on public.comments;
create policy "comments insert own" on public.comments
  for insert with check (auth.uid() = user_id);
drop policy if exists "comments delete own or admin" on public.comments;
create policy "comments delete own or admin" on public.comments
  for delete using (auth.uid() = user_id or public.is_admin());

-- contact messages: anyone can send, only admin reads/deletes
drop policy if exists "messages anyone insert" on public.messages;
create policy "messages anyone insert" on public.messages for insert with check (true);
drop policy if exists "messages admin read" on public.messages;
create policy "messages admin read" on public.messages for select using (public.is_admin());
drop policy if exists "messages admin delete" on public.messages;
create policy "messages admin delete" on public.messages for delete using (public.is_admin());

-- ---------- Storage buckets ------------------------------------------
-- NOTE: Supabase's free plan caps a single file at 50 MB. For long stream
-- uploads you need a paid plan (Pro raises the limit up to 50 GB per file):
-- Dashboard → Storage → Settings → "Global file size limit".

insert into storage.buckets (id, name, public) values ('videos', 'videos', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('images', 'images', true)
  on conflict (id) do update set public = true;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select using (bucket_id in ('videos','images'));
drop policy if exists "media admin insert" on storage.objects;
create policy "media admin insert" on storage.objects
  for insert with check (bucket_id in ('videos','images') and public.is_admin());
drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects
  for update using (bucket_id in ('videos','images') and public.is_admin());
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects
  for delete using (bucket_id in ('videos','images') and public.is_admin());
