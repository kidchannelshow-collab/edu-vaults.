import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, verif-hash',
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

    // 1. Verify Flutterwave Webhook Hash / Secret
    const signature = req.headers.get('verif-hash');
    const webhookSecret = Deno.env.get('FLW_WEBHOOK_SECRET') || Deno.env.get('FLW_SECRET_KEY');

    if (signature && webhookSecret && signature !== webhookSecret) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Unauthorized webhook signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const event = payload.event;
    const data = payload.data;

    if (!data || !data.tx_ref) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const txRef = data.tx_ref;
    const flwTransactionId = data.id?.toString();
    const flwStatus = data.status; // 'successful', 'failed', etc.
    const flwAmount = data.amount;
    const flwCurrency = data.currency;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const flwSecretKey = Deno.env.get('FLW_SECRET_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey || !flwSecretKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 2. Fetch pending payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('tx_ref', txRef)
      .maybeSingle();

    if (paymentError || !payment) {
      console.error('Payment record not found for tx_ref:', txRef);
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Idempotency check: if already successful, acknowledge and return
    if (payment.status === 'successful') {
      return new Response(JSON.stringify({ status: 'already_processed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Verify transaction with Flutterwave API directly
    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${flwTransactionId}/verify`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || verifyData.status !== 'success' || verifyData.data.status !== 'successful') {
      // Mark payment failed if verified as failed
      await supabaseAdmin
        .from('payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', payment.id);

      return new Response(JSON.stringify({ status: 'payment_failed_or_unverified' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verifiedTx = verifyData.data;

    // 5. Strict Security Validations
    if (
      verifiedTx.tx_ref !== payment.tx_ref ||
      Number(verifiedTx.amount) !== Number(payment.amount) ||
      verifiedTx.currency !== payment.currency ||
      verifiedTx.currency !== 'NGN'
    ) {
      console.error('Payment verification data mismatch', { verified: verifiedTx, expected: payment });
      return new Response(JSON.stringify({ error: 'Verification mismatch' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Update payment to successful
    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'successful',
        flutterwave_transaction_id: flwTransactionId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (updateError) {
      console.error('Failed to update payment status:', updateError);
      return new Response(JSON.stringify({ error: 'Database error updating payment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Create entitlement safely (respecting unique constraint)
    const { error: entitlementError } = await supabaseAdmin
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

    if (entitlementError) {
      console.error('Failed to grant entitlement:', entitlementError);
      return new Response(JSON.stringify({ error: 'Failed to create entitlement' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 8. Log access event
    await supabaseAdmin
      .from('access_logs')
      .insert({
        user_id: payment.user_id,
        material_id: payment.material_id,
        event_type: 'entitlement_granted_via_webhook',
        metadata: { tx_ref: txRef, amount: payment.amount, flw_id: flwTransactionId }
      });

    return new Response(JSON.stringify({ success: true, status: 'processed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
