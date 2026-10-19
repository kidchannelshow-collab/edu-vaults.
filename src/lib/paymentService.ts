import { supabase } from './supabase';

/**
 * supabase-js reports a failed `functions.invoke` in two very different ways, and
 * both currently collapse into one unhelpful string:
 *
 *   FunctionsFetchError — the request never completed. CORS, DNS, offline, or the
 *     gateway rejecting the call BEFORE the function runs. The classic trap: with
 *     the default verify_jwt the platform answers a stale/missing session with a
 *     401 that carries no CORS headers, so the browser reports it as a transport
 *     failure even though the function is perfectly healthy.
 *
 *   FunctionsHttpError — the function ran and returned a non-2xx. The body, which
 *     holds the actual reason (e.g. {"error":"Payment gateway configuration
 *     error"}), sits on `error.context` — and the generic message discards it.
 *
 * This separates the two and recovers the body, so the UI shows the real cause
 * instead of sending everyone hunting for a network problem.
 */
async function describeFunctionError(error: any): Promise<string> {
  const name = error?.name || 'Error';
  const message = error?.message || 'Edge function call failed';
  const context = error?.context;
  const status = context?.status ?? error?.status;

  // Read the body as RAW TEXT first, then try to parse it.
  //
  // Calling `.json()` straight away consumes the stream, so a non-JSON body — an
  // HTML 502 from the gateway, a bare "Unauthorized" — leaves nothing to display.
  // That is precisely the case where the raw body is the entire diagnosis.
  let rawText: string | null = null;
  let parsed: any = null;

  if (context && typeof context.text === 'function') {
    try {
      rawText = await context.text();
      if (rawText) {
        try {
          parsed = JSON.parse(rawText);
        } catch {
          /* not JSON — the raw text is the whole story */
        }
      }
    } catch {
      /* body already consumed by supabase-js, or unreadable */
    }
  } else if (typeof context === 'string' && context.trim()) {
    rawText = context;
  }

  const detail = parsed?.error || parsed?.message || rawText || null;

  // One object with everything needed, straight into the F12 console:
  //   name     -> FunctionsFetchError (never arrived) vs FunctionsHttpError
  //   status   -> the HTTP code the function actually returned
  //   context  -> the raw Response, if you want to inspect it yourself
  //   rawText  -> the untouched body
  //   parsed   -> the same body as JSON, when it happens to be JSON
  console.error('[edge function] invocation failed', {
    name,
    message,
    status,
    context,
    rawText,
    parsed,
    error,
  });

  if (name === 'FunctionsFetchError') {
    return (
      `Could not reach the payment service (${message}). ` +
      `This is a transport failure, not a payment error — usually a dropped session ` +
      `or a CORS/preflight rejection. Try signing out and back in.`
    );
  }

  if (!detail && !status) return message;
  return `${detail || message}${status ? ` (HTTP ${status})` : ''}`;
}

export async function createPayment(
  materialId: string,
): Promise<{ success: boolean; url?: string; tx_ref?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { material_id: materialId },
    });

    if (error) {
      return { success: false, error: await describeFunctionError(error) };
    }

    // NOTE: the function returns `url` and this reads `url`. Renaming one side
    // without the other silently yields `undefined` here and a redirect to a URL
    // spelled "undefined" in Material.tsx — they move together.
    if (!data || !data.success) {
      return { success: false, error: data?.error || 'Failed to initialize payment' };
    }

    return { success: true, url: data.url, tx_ref: data.tx_ref };
  } catch (err: any) {
    console.error('[createPayment] threw before a response', err);
    return { success: false, error: err?.message || 'Network error during payment initialization' };
  }
}

/**
 * Start a payment and hand the browser to Flutterwave's checkout.
 *
 * Takes the MATERIAL id, not an amount: `create-payment` reads the price from the
 * materials row server-side and rejects a request without `material_id`. Sending
 * `{ amount }` fails with "Missing material_id".
 *
 * The URL key is read defensively. The repo's function returns `url`, but the
 * DEPLOYED build may still be the earlier one that returned `payment_url` — and a
 * rename that only exists in source is how you get redirected to "undefined".
 */
export const initiatePayment = async (materialId: string): Promise<void> => {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { material_id: materialId },
  });

  if (error) {
    throw new Error(await describeFunctionError(error));
  }

  const url: string | undefined = data?.url || data?.payment_url;
  if (!url) {
    throw new Error(data?.error || 'Payment initialization failed');
  }

  window.location.href = url;
};

export async function verifyPayment(
  txRef?: string,
  transactionId?: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-payment', {
      body: { tx_ref: txRef, transaction_id: transactionId },
    });

    if (error) {
      return { success: false, error: await describeFunctionError(error) };
    }

    if (!data || !data.success) {
      return { success: false, error: data?.error || 'Payment verification failed' };
    }

    return { success: true, message: data.message };
  } catch (err: any) {
    console.error('[verifyPayment] threw before a response', err);
    return { success: false, error: err?.message || 'Network error during payment verification' };
  }
}
