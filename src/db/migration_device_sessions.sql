-- ==================================================
-- MIGRATION: One-Active-Device / One-Active-Session System
-- EduVault Database Migration
-- ==================================================

-- 1. Ensure public.device_sessions table exists with all required columns
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_identifier text NOT NULL,
  session_token_hash text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_seen timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  revoked_at timestamp with time zone,
  is_revoked boolean
);

-- If table already existed, ensure columns exist
ALTER TABLE public.device_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE public.device_sessions ADD COLUMN IF NOT EXISTS last_seen timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE public.device_sessions ADD COLUMN IF NOT EXISTS revoked_at timestamp with time zone;
ALTER TABLE public.device_sessions ADD COLUMN IF NOT EXISTS is_revoked boolean;

-- Update is_revoked for existing rows
UPDATE public.device_sessions SET is_revoked = (revoked_at IS NOT NULL);

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS device_sessions_user_id_idx ON public.device_sessions(user_id);
CREATE INDEX IF NOT EXISTS device_sessions_revoked_at_idx ON public.device_sessions(revoked_at);

-- Safe partial unique index: only one active session per user (where revoked_at IS NULL)
-- First, revoke any duplicate active sessions keeping the most recent one active
WITH ranked_sessions AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_seen_at DESC, created_at DESC) as rn
  FROM public.device_sessions
  WHERE revoked_at IS NULL
)
UPDATE public.device_sessions
SET revoked_at = timezone('utc'::text, now()), is_revoked = true
WHERE id IN (SELECT id FROM ranked_sessions WHERE rn > 1);

-- Now create partial unique index
DROP INDEX IF EXISTS device_sessions_user_active_idx;
CREATE UNIQUE INDEX device_sessions_user_active_idx ON public.device_sessions(user_id) WHERE revoked_at IS NULL;

-- 3. Enable RLS
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Users can view own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can insert own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can update own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Admins can manage device sessions" ON public.device_sessions;

CREATE POLICY "Users can view own device sessions"
  ON public.device_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own device sessions"
  ON public.device_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own device sessions"
  ON public.device_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage device sessions"
  ON public.device_sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.status = 'active'
    )
  );

-- 5. Atomic RPC function for authorizing device session and handling conflicts
CREATE OR REPLACE FUNCTION public.authorize_device_session(
  p_device_identifier text,
  p_force_takeover boolean DEFAULT false,
  p_token_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_user_id uuid;
  v_existing_id uuid;
  v_existing_device text;
  v_session_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  -- Check if there is already an active session for another device
  select id, device_identifier into v_existing_id, v_existing_device
  from public.device_sessions
  where user_id = v_user_id
    and revoked_at is null
    and device_identifier != p_device_identifier
  limit 1;

  if v_existing_id is not null then
    if p_force_takeover then
      -- Revoke the other active session(s)
      update public.device_sessions
      set revoked_at = timezone('utc'::text, now()), is_revoked = true
      where user_id = v_user_id
        and revoked_at is null;

      -- Log audit event for conflict takeover
      insert into public.access_logs (user_id, event_type, metadata)
      values (v_user_id, 'device_session_conflict', jsonb_build_object('revoked_device', v_existing_device, 'new_device', p_device_identifier));
    else
      -- Return conflict info
      return jsonb_build_object(
        'success', false,
        'conflict', true,
        'existing_device', v_existing_device,
        'message', 'Your EduVault account is already active on another device.'
      );
    end if;
  end if;

  -- Insert or update current device session
  insert into public.device_sessions (user_id, device_identifier, session_token_hash, last_seen_at, last_seen, revoked_at, is_revoked)
  values (v_user_id, p_device_identifier, p_token_hash, timezone('utc'::text, now()), timezone('utc'::text, now()), null, false)
  on conflict (user_id) where revoked_at is null
  do update set
    device_identifier = excluded.device_identifier,
    last_seen_at = timezone('utc'::text, now()),
    last_seen = timezone('utc'::text, now())
  returning id into v_session_id;

  if v_session_id is null then
    insert into public.device_sessions (user_id, device_identifier, session_token_hash, last_seen_at, last_seen, revoked_at, is_revoked)
    values (v_user_id, p_device_identifier, p_token_hash, timezone('utc'::text, now()), timezone('utc'::text, now()), null, false)
    returning id into v_session_id;
  end if;

  -- Log session creation
  insert into public.access_logs (user_id, event_type, metadata)
  values (v_user_id, 'device_session_created', jsonb_build_object('device_identifier', p_device_identifier));

  return jsonb_build_object('success', true, 'session_id', v_session_id);
end;
$$;

-- 6. Function to update session heartbeat
CREATE OR REPLACE FUNCTION public.update_device_heartbeat(
  p_device_identifier text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  update public.device_sessions
  set last_seen_at = timezone('utc'::text, now()),
      last_seen = timezone('utc'::text, now())
  where user_id = v_user_id
    and device_identifier = p_device_identifier
    and revoked_at is null;

  return found;
end;
$$;
