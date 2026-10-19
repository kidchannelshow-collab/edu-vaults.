import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Resolve the caller's public IP.
 *
 * Supabase terminates TLS in front of the function, so the socket address is
 * the proxy's — the real client IP only exists in these headers. Order matters:
 * cf-connecting-ip is set by Cloudflare and cannot be spoofed by the client,
 * whereas a client is free to prepend junk to x-forwarded-for.
 */
function resolveClientIp(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();

  // x-forwarded-for is a list; the first entry is the original client.
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { device_identifier, force_takeover } = body;

    if (!device_identifier) {
      return new Response(JSON.stringify({ error: 'Missing device_identifier' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Telemetry recorded against the session so Settings and the admin console
    // can show a real IP and device rather than a placeholder.
    const clientIp = resolveClientIp(req);
    const userAgent = req.headers.get('user-agent');

    // 1. Check if there is already an active session for another device
    const { data: existingSessions, error: queryErr } = await supabaseAdmin
      .from('device_sessions')
      .select('id, device_identifier')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .neq('device_identifier', device_identifier);

    if (queryErr) {
      console.error('Error querying active sessions:', queryErr);
    }

    if (existingSessions && existingSessions.length > 0) {
      const existingDev = existingSessions[0];
      if (force_takeover) {
        // Revoke all active sessions for user
        await supabaseAdmin
          .from('device_sessions')
          .update({ revoked_at: new Date().toISOString(), is_revoked: true })
          .eq('user_id', userId)
          .is('revoked_at', null);

        // Audit log
        await supabaseAdmin.from('access_logs').insert({
          user_id: userId,
          event_type: 'device_session_conflict',
          metadata: { revoked_device: existingDev.device_identifier, new_device: device_identifier },
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          conflict: true,
          existing_device: existingDev.device_identifier,
          message: 'Your EduVault account is already active on another device.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. Upsert or create current device session
    // Check if session already exists for this user + device
    const { data: currentDev, error: curErr } = await supabaseAdmin
      .from('device_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('device_identifier', device_identifier)
      .maybeSingle();

    let sessionId = currentDev?.id;

    if (sessionId) {
      // Update existing record
      await supabaseAdmin
        .from('device_sessions')
        .update({
          revoked_at: null,
          is_revoked: false,
          last_seen_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          ip_address: clientIp,
          user_agent: userAgent,
        })
        .eq('id', sessionId);
    } else {
      // Insert new record
      const { data: insData, error: insErr } = await supabaseAdmin
        .from('device_sessions')
        .insert({
          user_id: userId,
          device_identifier: device_identifier,
          created_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          revoked_at: null,
          is_revoked: false,
          ip_address: clientIp,
          user_agent: userAgent,
        })
        .select('id')
        .single();

      if (insErr) {
        // If unique constraint violation (active session race condition), handle gracefully
        return new Response(JSON.stringify({
          success: false,
          conflict: true,
          message: 'Your EduVault account is already active on another device.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      sessionId = insData?.id;
    }

    // Log session creation / activation
    await supabaseAdmin.from('access_logs').insert({
      user_id: userId,
      event_type: 'device_session_created',
      metadata: { device_identifier },
    });

    return new Response(JSON.stringify({
      success: true,
      session_id: sessionId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('authorize-device-session error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
