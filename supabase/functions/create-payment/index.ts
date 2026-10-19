import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // GET is listed for completeness only — the function answers 405 to anything
  // that isn't POST, so no GET path exists to allow.
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Validate request method
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Initialize Supabase client
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
    const userEmail = user.email || 'student@eduvault.app';

    // 4. Parse request body (receive ONLY material_id)
    const body = await req.json().catch(() => ({}));
    const { material_id } = body;

    if (!material_id) {
      return new Response(JSON.stringify({ error: 'Missing material_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 5. Look up material in public.materials
    const { data: material, error: matError } = await supabaseAdmin
      .from('materials')
      .select('id, title, price, is_published')
      .eq('id', material_id)
      .maybeSingle();

    if (matError || !material) {
      return new Response(JSON.stringify({ error: 'Material not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!material.is_published) {
      return new Response(JSON.stringify({ error: 'Material is not published' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const price = material.price;
    if (!price || price <= 0) {
      return new Response(JSON.stringify({ error: 'Material price is not configured or is invalid' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Generate cryptographically secure unique tx_ref
    const txRef = `eduvault_${Date.now()}_${crypto.randomUUID()}`;

    // 7. Create pending payment in public.payments
    const { error: paymentInsertError } = await supabaseAdmin
      .from('payments')
      .insert({
        user_id: userId,
        material_id: material.id,
        tx_ref: txRef,
        amount: price,
        currency: 'NGN',
        status: 'pending',
        metadata: { material_title: material.title }
      });

    if (paymentInsertError) {
      console.error('Failed to create pending payment:', paymentInsertError);
      return new Response(JSON.stringify({ error: 'Failed to initialize payment record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 8. Call Flutterwave payment initialization API
    const flwSecretKey = Deno.env.get('FLW_SECRET_KEY');
    if (!flwSecretKey) {
      return new Response(JSON.stringify({ error: 'Payment gateway configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const origin = req.headers.get('origin') || 'https://ais-dev-3xomirrco7ilofepoq5xpz-582976144087.europe-west2.run.app';
    // Flutterwave appends ?status=...&tx_ref=... when it returns the buyer here.
    // `/material` is the canonical route (/materials is aliased to it in App.tsx),
    // and verified=true states our intent; the client keys off tx_ref.
    const redirectUrl = `${origin}/material?verified=true`;

    const flwPayload = {
      tx_ref: txRef,
      amount: price,
      currency: 'NGN',
      redirect_url: redirectUrl,
      customer: {
        email: userEmail,
        name: user.user_metadata?.full_name || userEmail.split('@')[0],
      },
      customizations: {
        title: 'EduVault Secure Material',
        description: `Purchase access to: ${material.title}`,
        logo: `${origin}/assets/icon.png`,
      },
    };

    // Log the outgoing payload so a rejection can be matched against what we sent.
    // The secret key lives in the Authorization header, not in this object, so
    // nothing sensitive is written here.
    console.log('[flutterwave] initialising payment', {
      endpoint: 'https://api.flutterwave.com/v3/payments',
      payload: flwPayload,
    });

    const flwResponse = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flwPayload),
    });

    // Read the body as RAW TEXT, then parse it. Calling `.json()` consumes the
    // stream, and Flutterwave does not always answer in JSON — their gateway can
    // return an HTML error page, which would otherwise leave nothing to report.
    const rawText = await flwResponse.text();
    console.log('[flutterwave] raw response', {
      status: flwResponse.status,
      ok: flwResponse.ok,
      rawText,
    });

    let flwData: any = null;
    try {
      flwData = rawText ? JSON.parse(rawText) : null;
    } catch {
      /* non-JSON body — rawText is the whole story */
    }

    if (!flwResponse.ok || flwData?.status !== 'success') {
      // Surface Flutterwave's own words: `message` carries the human reason
      // ("Invalid authorization key", "Amount is less than minimum", …). The raw
      // body is kept for anything the parse could not reach.
      const reason =
        flwData?.message ||
        (rawText ? rawText.slice(0, 300) : `Flutterwave returned HTTP ${flwResponse.status}`);

      console.error('[flutterwave] payment initialisation rejected', {
        status: flwResponse.status,
        reason,
        data: flwData,
        rawText,
      });

      await supabaseAdmin
        .from('payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('tx_ref', txRef);

      return new Response(
        JSON.stringify({
          error: reason,
          details: flwData ?? null,
          raw: rawText ? rawText.slice(0, 500) : null,
          http_status: flwResponse.status,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const paymentUrl = flwData.data.link;

    return new Response(JSON.stringify({
      success: true,
      url: paymentUrl,
      tx_ref: txRef,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
