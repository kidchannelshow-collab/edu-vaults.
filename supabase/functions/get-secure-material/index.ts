import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Header lookup is case-insensitive per Fetch; this keeps a proxy that
    // rewrites casing from turning a valid session into a 401.
    const authHeader =
      req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate the caller's JWT with the service-role client: it needs no
    // anon-key configuration and cannot inherit a stale Authorization header
    // from the invoking client.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized user session', code: 'invalid_session' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const userId = user.id;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { material_id } = body;

    if (!material_id) {
      return new Response(JSON.stringify({ error: 'Missing material_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Check profile status & role
    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('status, role')
      .eq('id', userId)
      .maybeSingle();

    if (profErr || !profile || profile.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Account suspended or profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Load material
    // NOTE: file_path is needed server-side to mint the signed URL, but it must
    // never be returned to the client. We select it explicitly and strip it below.
    const { data: material, error: matErr } = await supabaseAdmin
      .from('materials')
      // NOTE: preview_images is deliberately NOT selected. The reader does not
      // use previews, and a deployment whose schema has not applied that
      // migration would otherwise make this whole query 42703 — reported to the
      // student as "material not available" even though their entitlement is
      // valid. The protected file_path is all this function needs.
      .select('id, title, description, subject, category, file_path, estimated_reading_minutes, is_published, price')
      .eq('id', material_id)
      .maybeSingle();

    if (matErr || !material || !material.is_published) {
      return new Response(JSON.stringify({ error: 'Material not available or unpublished' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!material.file_path) {
      return new Response(JSON.stringify({ error: 'PDF document not found for this material' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check entitlement (Admins bypass)
    const isAdmin = profile.role === 'admin';
    if (!isAdmin) {
      const { data: entitlement, error: entErr } = await supabaseAdmin
        .from('entitlements')
        .select('*')
        .eq('user_id', userId)
        .eq('material_id', material_id)
        .eq('status', 'active')
        .maybeSingle();

      if (entErr || !entitlement) {
        return new Response(JSON.stringify({ error: 'No active entitlement for this material' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (entitlement.expires_at && new Date(entitlement.expires_at) <= new Date()) {
        return new Response(JSON.stringify({ error: 'Entitlement has expired' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 4. Generate a signed URL for the private object.
    //
    // This was hardcoded to 60 seconds, which is shorter than a reading session.
    // The embedded viewer holds the document once it has loaded, but any reload or
    // range re-fetch after a minute fails — and the student has no way to trigger a
    // re-mint, so they just see a dead frame. Env-overridable so the window can be
    // tuned per deployment without a code change; defaults to one hour.
    const configuredTtl = Number(Deno.env.get('SIGNED_URL_TTL_SECONDS') ?? '3600');
    const ttlSeconds =
      Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 3600;

    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from('educational-materials')
      .createSignedUrl(material.file_path, ttlSeconds);

    if (signErr || !signedData?.signedUrl) {
      return new Response(JSON.stringify({ error: 'Failed to generate secure signed URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Log security access event
    await supabaseAdmin.rpc('log_security_event', {
      p_event_type: 'secure_pdf_accessed_via_edge',
      p_material_id: material_id,
      p_metadata: { file_path: material.file_path },
    }).catch(() => {}); // non-blocking

    // Strip the storage path — the client only ever needs the signed URL.
    const { file_path: _filePath, ...safeMaterial } = material;

    return new Response(JSON.stringify({
      success: true,
      // Both keys are returned deliberately: the client accepts either, and a
      // deployed build that reads the other name must not break.
      signedUrl: signedData.signedUrl,
      signedPdfUrl: signedData.signedUrl,
      material: { ...safeMaterial, preview_images: [] },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('get-secure-material error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
