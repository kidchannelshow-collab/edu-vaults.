import { supabase } from './supabase';

const DEVICE_ID_KEY = 'eduvault_device_identifier';

/**
 * Obtain or generate a unique browser device identifier persisted in localStorage.
 */
export function getDeviceIdentifier(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        deviceId = crypto.randomUUID();
      } else {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'fallback_device_id';
  }
}

/**
 * Request server-side device session authorization via secure RPC.
 */
export async function authorizeDeviceSession(forceTakeover = false): Promise<{ success: boolean; conflict?: boolean; existingDevice?: string; message?: string; error?: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const deviceIdentifier = getDeviceIdentifier();

    // Call secure Edge Function for device authorization
    const { data, error } = await supabase.functions.invoke('authorize-device-session', {
      body: { device_identifier: deviceIdentifier, force_takeover: forceTakeover },
    });

    if (error || !data) {
      // Fallback to RPC if edge function invocation fails
      const { data: rpcData, error: rpcError } = await supabase.rpc('authorize_device_session', {
        p_device_identifier: deviceIdentifier,
        p_force_takeover: forceTakeover,
        p_token_hash: null,
      });

      if (rpcError) {
        return { success: false, error: rpcError.message || error?.message || 'Device authorization failed' };
      }

      if (rpcData && typeof rpcData === 'object') {
        return {
          success: !!rpcData.success,
          conflict: !!rpcData.conflict,
          existingDevice: rpcData.existing_device,
          message: rpcData.message,
          error: rpcData.error,
        };
      }
      return { success: true };
    }

    return {
      success: !!data.success,
      conflict: !!data.conflict,
      existingDevice: data.existing_device,
      message: data.message,
      error: data.error,
    };
  } catch (err: any) {
    return { success: false, error: err.message || err };
  }
}

/**
 * Send session heartbeat to update last_seen_at timestamp.
 */
export async function sendDeviceHeartbeat(): Promise<boolean> {
  try {
    const deviceIdentifier = getDeviceIdentifier();
    const { data, error } = await supabase.rpc('update_device_heartbeat', {
      p_device_identifier: deviceIdentifier,
    });
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Check if current device session has been explicitly revoked on another device or by an admin.
 */
export async function checkDeviceSessionActive(): Promise<{ active: boolean; revoked: boolean; error?: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { active: false, revoked: false };
    }

    const deviceIdentifier = getDeviceIdentifier();
    const { data, error } = await supabase
      .from('device_sessions')
      .select('id, revoked_at, is_revoked')
      .eq('user_id', user.id)
      .eq('device_identifier', deviceIdentifier)
      .maybeSingle();

    if (error) {
      // Query or network error: do not falsely assume session is revoked
      return { active: true, revoked: false, error };
    }

    // Only if a device session record explicitly exists and is flagged as revoked
    if (data && (data.revoked_at !== null || data.is_revoked === true)) {
      return { active: false, revoked: true };
    }

    return { active: true, revoked: false };
  } catch (err) {
    return { active: true, revoked: false, error: err };
  }
}

/**
 * Explicitly revoke current device session on logout.
 */
export async function revokeCurrentDeviceSession(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const deviceIdentifier = getDeviceIdentifier();
    await supabase
      .from('device_sessions')
      .update({ revoked_at: new Date().toISOString(), is_revoked: true })
      .eq('user_id', user.id)
      .eq('device_identifier', deviceIdentifier)
      .is('revoked_at', null);

    // Audit log
    await supabase.from('access_logs').insert({
      user_id: user.id,
      event_type: 'device_session_revoked',
      metadata: { reason: 'explicit_logout', device_identifier: deviceIdentifier },
    });
  } catch {
    // Non-blocking logout cleanup
  }
}
