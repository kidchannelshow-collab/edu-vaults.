-- EduVault Row Level Security (RLS) Migration for Supabase
-- Run this script in the Supabase SQL Editor after running the schema migration.

--------------------------------------------------------------------------------
1. ENABLE ROW LEVEL SECURITY ON ALL TABLES
--------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.entitlements enable row level security;
alter table public.reading_progress enable row level security;
alter table public.device_sessions enable row level security;
alter table public.access_logs enable row level security;

--------------------------------------------------------------------------------
2. PROFILES POLICIES
--------------------------------------------------------------------------------
-- Authenticated users can select their own profile
create policy "Users can select own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Authenticated users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

--------------------------------------------------------------------------------
3. MATERIALS POLICIES
--------------------------------------------------------------------------------
-- Authenticated users can read only published materials
create policy "Authenticated users can read published materials"
  on public.materials for select
  using (auth.role() = 'authenticated' and is_published = true);

-- Note: No INSERT, UPDATE, or DELETE policies for normal users on materials (admin-only / service role).

--------------------------------------------------------------------------------
4. ENTITLEMENTS POLICIES
--------------------------------------------------------------------------------
-- Authenticated users can read only their own entitlements
create policy "Users can read own entitlements"
  on public.entitlements for select
  using (auth.uid() = user_id);

-- Note: No INSERT or UPDATE policies for users. Users cannot grant themselves access or change entitlement status.

--------------------------------------------------------------------------------
5. READING_PROGRESS POLICIES
--------------------------------------------------------------------------------
-- Users can read their own reading progress
create policy "Users can read own reading progress"
  on public.reading_progress for select
  using (auth.uid() = user_id);

-- Users can insert their own reading progress
create policy "Users can insert own reading progress"
  on public.reading_progress for insert
  with check (auth.uid() = user_id);

-- Users can update their own reading progress
create policy "Users can update own reading progress"
  on public.reading_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

--------------------------------------------------------------------------------
6. DEVICE_SESSIONS POLICIES
--------------------------------------------------------------------------------
-- Users can view their own device sessions (creation/modification restricted to server-side/service role)
create policy "Users can read own device sessions"
  on public.device_sessions for select
  using (auth.uid() = user_id);

--------------------------------------------------------------------------------
7. ACCESS_LOGS POLICIES
--------------------------------------------------------------------------------
-- Users can view their own access logs
create policy "Users can read own access logs"
  on public.access_logs for select
  using (auth.uid() = user_id);

-- Users can insert their own access logs
create policy "Users can insert own access logs"
  on public.access_logs for insert
  with check (auth.uid() = user_id);

-- Note: No UPDATE or DELETE policies for normal users on access_logs.

--------------------------------------------------------------------------------
8. VERIFICATION & SECURITY TEST QUERIES
--------------------------------------------------------------------------------
/*
  The following queries can be executed in the Supabase SQL Editor to test and verify RLS enforcement.
  
  -- Test 1: Verify unauthenticated users cannot access protected tables
  set role anon;
  select * from public.profiles; -- Should return 0 rows or permission denied error
  select * from public.materials; -- Should return 0 rows
  
  -- Test 2: Simulate User A trying to read User B's profile
  -- (Replace 'user-a-uuid' and 'user-b-uuid' with actual auth.users ids)
  select set_config('request.jwt.claim.sub', 'user-a-uuid', true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  
  select * from public.profiles where id = 'user-b-uuid'; -- Should return 0 rows
  
  -- Test 3: Simulate User A trying to read User B's entitlements
  select * from public.entitlements where user_id = 'user-b-uuid'; -- Should return 0 rows
  
  -- Test 4: Simulate User A trying to read User B's reading progress
  select * from public.reading_progress where user_id = 'user-b-uuid'; -- Should return 0 rows
  
  -- Test 5: Simulate User trying to modify entitlement status directly
  update public.entitlements set status = 'active' where user_id = 'user-a-uuid'; -- Should fail (0 rows updated or permission denied)
*/
