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

    // 1. Authenticate user from request header
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
    const flwSecretKey = Deno.env.get('FLW_SECRET_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey || !flwSecretKey) {
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

    // 2. Parse request body (tx_ref or transaction_id)
    const body = await req.json().catch(() => ({}));
    const { tx_ref, transaction_id } = body;

    if (!tx_ref && !transaction_id) {
      return new Response(JSON.stringify({ error: 'Missing tx_ref or transaction_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 3. Find payment record and strictly verify ownership
    let query = supabaseAdmin.from('payments').select('*');
    if (tx_ref) {
      query = query.eq('tx_ref', tx_ref);
    } else {
      query = query.eq('flutterwave_transaction_id', transaction_id.toString());
    }

    const { data: payment, error: paymentError } = await query.maybeSingle();

    if (paymentError || !payment) {
      return new Response(JSON.stringify({ error: 'Payment record not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CRITICAL USER OWNERSHIP CHECK
    if (payment.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized access to payment record' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If already successful, return success immediately (Idempotent)
    if (payment.status === 'successful') {
      return new Response(JSON.stringify({
        success: true,
        status: 'successful',
        material_id: payment.material_id,
        message: 'Payment already verified and entitlement active',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Query Flutterwave API to verify transaction
    // If we have transaction_id, verify directly. Otherwise query transactions by tx_ref.
    let flwVerifyUrl = '';
    if (transaction_id) {
      flwVerifyUrl = `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`;
    } else {
      flwVerifyUrl = `https://api.flutterwave.com/v3/transactions?tx_ref=${tx_ref}&status=successful`;
    }

    const flwRes = await fetch(flwVerifyUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const flwData = await flwRes.json();

    if (!flwRes.ok || flwData.status !== 'success') {
      await supabaseAdmin
        .from('payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', payment.id);

      return new Response(JSON.stringify({ error: 'Payment verification failed at gateway' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let verifiedTx = null;
    if (transaction_id) {
      verifiedTx = flwData.data;
    } else {
      const txs = flwData.data;
      if (Array.isArray(txs) && txs.length > 0) {
        verifiedTx = txs.find((t: any) => t.tx_ref === tx_ref && t.status === 'successful');
      }
    }

    if (!verifiedTx || verifiedTx.status !== 'successful') {
      return new Response(JSON.stringify({ error: 'Transaction not successful or not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Strict Currency, Amount, and Reference validations
    if (
      verifiedTx.tx_ref !== payment.tx_ref ||
      Number(verifiedTx.amount) !== Number(payment.amount) ||
      verifiedTx.currency !== payment.currency ||
      verifiedTx.currency !== 'NGN'
    ) {
      return new Response(JSON.stringify({ error: 'Transaction validation check failed (amount/currency/ref mismatch)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const flwTxId = verifiedTx.id.toString();

    // 6. Update payment to successful
    const { error: updateErr } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'successful',
        flutterwave_transaction_id: flwTxId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: 'Failed to update payment status in database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Create entitlement safely
    const { error: entError } = await supabaseAdmin
      .from('entitlements')
      .upsert({
        user_id: payment.user_id,
        material_id: payment.material_id,
        status: 'active',
        granted_at: new Date().toISOString(),
        expires_at: null,
      }, {
        onConflict: 'user_id,material_id',
      });

    if (entError) {
      return new Response(JSON.stringify({ error: 'Failed to create entitlement record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 8. Log access
    await supabaseAdmin
      .from('access_logs')
      .insert({
        user_id: payment.user_id,
        material_id: payment.material_id,
        event_type: 'entitlement_granted_via_verification',
        metadata: { tx_ref, amount: payment.amount, flw_id: flwTxId }
      });

    return new Response(JSON.stringify({
      success: true,
      status: 'successful',
      material_id: payment.material_id,
      message: 'Payment verified and entitlement successfully granted',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Verify payment error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
