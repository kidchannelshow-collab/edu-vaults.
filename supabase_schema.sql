-- EduVault PostgreSQL Database Schema Migration for Supabase
-- Note: Run this script in the Supabase SQL Editor. RLS is not enabled in this initial step.

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

--------------------------------------------------------------------------------
-- 1. PROFILES TABLE
--------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for profiles
create index if not exists idx_profiles_id on public.profiles(id);

--------------------------------------------------------------------------------
-- 2. MATERIALS TABLE
--------------------------------------------------------------------------------
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  subject text,
  category text,
  file_path text not null,
  estimated_reading_minutes integer,
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

--------------------------------------------------------------------------------
-- 3. ENTITLEMENTS TABLE
--------------------------------------------------------------------------------
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  material_id uuid references materials(id) on delete cascade,
  status text not null check (status in ('active', 'expired', 'revoked')),
  granted_at timestamptz default now(),
  expires_at timestamptz,
  created_at timestamptz default now(),
  constraint unique_user_material_entitlement unique (user_id, material_id)
);

-- Indexes for entitlements
create index if not exists idx_entitlements_user_id on public.entitlements(user_id);
create index if not exists idx_entitlements_material_id on public.entitlements(material_id);

--------------------------------------------------------------------------------
-- 4. READING_PROGRESS TABLE
--------------------------------------------------------------------------------
create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  material_id uuid references materials(id) on delete cascade,
  current_page integer default 1,
  progress_percent numeric default 0,
  last_read_at timestamptz default now(),
  constraint unique_user_material_progress unique (user_id, material_id)
);

-- Indexes for reading_progress
create index if not exists idx_reading_progress_user_id on public.reading_progress(user_id);
create index if not exists idx_reading_progress_material_id on public.reading_progress(material_id);

--------------------------------------------------------------------------------
-- 5. DEVICE_SESSIONS TABLE (Supports one-active-device policy)
--------------------------------------------------------------------------------
create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_identifier text not null,
  session_token_hash text,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  revoked_at timestamptz
);

-- Indexes for device_sessions
create index if not exists idx_device_sessions_user_id on public.device_sessions(user_id);
create index if not exists idx_device_sessions_revoked_at on public.device_sessions(revoked_at);

--------------------------------------------------------------------------------
-- 6. ACCESS_LOGS TABLE
--------------------------------------------------------------------------------
create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  material_id uuid references materials(id) on delete set null,
  event_type text not null,
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

-- Indexes for access_logs
create index if not exists idx_access_logs_user_id on public.access_logs(user_id);
create index if not exists idx_access_logs_created_at on public.access_logs(created_at);

--------------------------------------------------------------------------------
-- AUTOMATIC PROFILE CREATION TRIGGER (Helper for Supabase Auth)
--------------------------------------------------------------------------------
create or function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

-- Trigger execution on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
