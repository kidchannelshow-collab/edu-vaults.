import { supabase } from './supabase';

/**
 * Manual payment fulfilment — the fallback path.
 *
 * Payment now starts through the `create-payment` Edge Function, which returns a
 * dynamic checkout URL. What does NOT exist is the verifier: `verify-payment` and
 * `flutterwave-webhook` both return 404, and deploying them needs Supabase
 * dashboard access. So when a buyer returns from checkout, Material.tsx attempts
 * verification first and falls back to filing a claim here — a human confirms it
 * against Flutterwave and grants access.
 *
 * NO NEW SCHEMA. Everything below uses tables whose policies already permit it:
 *   access_logs   — users INSERT own (submitting a claim), admins SELECT all
 *   entitlements  — admins FOR ALL (granting access)
 *
 * `payments` is deliberately NOT used: users hold SELECT only, so a student could
 * never write their own claim there.
 */

export const CLAIM_SUBMITTED = 'payment_claim_submitted';
export const CLAIM_APPROVED = 'payment_claim_approved';

export interface PaymentClaim {
  id: string;
  user_id: string;
  material_id: string | null;
  created_at: string;
  /** Present on rows read from access_logs; distinguishes claims from approvals. */
  event_type?: string;
  metadata: {
    reference?: string;
    amount?: number;
    note?: string;
    /** Set on an approval row: the id of the claim it resolves. */
    claim_id?: string;
  } | null;
}

/**
 * Student side: record that they have paid, with the reference Flutterwave gave
 * them. Written to `access_logs`, which students may insert into for themselves —
 * `payments` would be refused (SELECT-only policy).
 */
export async function submitPaymentClaim(
  materialId: string,
  reference: string,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = reference.trim();
  if (!trimmed) return { success: false, error: 'Enter the payment reference Flutterwave gave you.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Please sign in first.' };

  const { error } = await supabase.from('access_logs').insert({
    user_id: user.id,
    material_id: materialId,
    event_type: CLAIM_SUBMITTED,
    metadata: {
      reference: trimmed,
      note: note?.trim() || null,
      amount: 1500,
      submitted_at: new Date().toISOString(),
    },
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Student side: has a human approved my claim for this material yet? */
export async function hasApprovedClaim(materialId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // The entitlement is the real answer — approvals only exist to explain it.
  const { data } = await supabase
    .from('entitlements')
    .select('id')
    .eq('user_id', user.id)
    .eq('material_id', materialId)
    .eq('status', 'active')
    .maybeSingle();

  return Boolean(data);
}

/**
 * Student side: does this user have a claim waiting on confirmation for this
 * material? Used to pin the "send your receipt" banner.
 *
 * Reading their own approval rows is not possible — approvals are written by the
 * ADMIN (user_id = admin), and users may only select their own logs. That's fine:
 * an approval produces an entitlement, and the banner is hidden whenever the user
 * actually has access.
 */
export async function hasPendingClaim(materialId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('access_logs')
    .select('id')
    .eq('user_id', user.id)
    .eq('material_id', materialId)
    .eq('event_type', CLAIM_SUBMITTED)
    .limit(1);

  return Boolean(data && data.length > 0);
}

/**
 * Admin: grant access to any account by email, even one that never filed a claim
 * (the buyer who paid by transfer and messaged you instead of using the app).
 *
 * There is NO `is_active` column on `entitlements` — the column is `status`, with
 * a CHECK constraint allowing only 'active' | 'expired' | 'revoked'. Writing
 * `is_active` would fail; granting sets 'active'.
 */
export async function grantAccessByEmail(
  email: string,
  materialId: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = email.trim();
  if (!trimmed) return { success: false, error: 'Enter the student’s email.' };

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .ilike('email', trimmed)
    .maybeSingle();

  if (profErr) return { success: false, error: profErr.message };
  if (!profile) return { success: false, error: `No account found for ${trimmed}.` };

  const { error } = await supabase.from('entitlements').upsert(
    {
      user_id: profile.id,
      material_id: materialId,
      status: 'active',
      granted_at: new Date().toISOString(),
      expires_at: null,
    },
    { onConflict: 'user_id,material_id' },
  );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Admin: activate or deactivate an existing grant.
 *
 * Deactivation sets status 'revoked'. That takes effect immediately and on the
 * SERVER: get-secure-material looks for `.eq('status','active')`, so the next
 * access check refuses and the reader locks — no client cooperation needed.
 */
export async function setEntitlementStatus(
  entitlementId: string,
  active: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('entitlements')
    .update({ status: active ? 'active' : 'revoked' })
    .eq('id', entitlementId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Admin: activate or deactivate book access for a user + material, creating the
 * entitlement if it does not exist yet.
 *
 * `entitlements` has NO `is_active` column — the schema uses `status` with a
 * CHECK of 'active' | 'expired' | 'revoked'. Activation upserts 'active' (so an
 * admin can switch a book on from the user list without a prior claim);
 * deactivation writes 'revoked', which the get-secure-material Edge Function
 * honours on its next access check, so the reader locks without any client
 * cooperation.
 */
export async function setAccessState(
  userId: string,
  materialId: string,
  active: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (active) {
    const { error } = await supabase.from('entitlements').upsert(
      {
        user_id: userId,
        material_id: materialId,
        status: 'active',
        granted_at: new Date().toISOString(),
        expires_at: null,
      },
      { onConflict: 'user_id,material_id' },
    );

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // `.select()` so a zero-row UPDATE is detectable: PostgREST reports no error
  // when RLS or a missing row means nothing was written.
  const { data, error } = await supabase
    .from('entitlements')
    .update({ status: 'revoked' })
    .eq('user_id', userId)
    .eq('material_id', materialId)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) {
    return { success: false, error: 'No entitlement exists for this user and book.' };
  }
  return { success: true };
}

export interface AccessGrant {
  id: string;
  user_id: string;
  material_id: string;
  status: string;
  granted_at: string | null;
  studentLabel: string;
  materialTitle: string;
}

/** Admin: every entitlement, newest first, with labels for display. */
export async function listAccessGrants(): Promise<{ grants: AccessGrant[]; error?: string }> {
  const { data, error } = await supabase
    .from('entitlements')
    .select('id, user_id, material_id, status, granted_at')
    .order('granted_at', { ascending: false })
    .limit(200);

  if (error) return { grants: [], error: error.message };

  const rows = (data || []) as Omit<AccessGrant, 'studentLabel' | 'materialTitle'>[];
  if (rows.length === 0) return { grants: [] };

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const materialIds = [...new Set(rows.map((r) => r.material_id))];

  const [{ data: profiles }, { data: materials }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').in('id', userIds),
    supabase.from('materials').select('id, title').in('id', materialIds),
  ]);

  const nameById = new Map((profiles || []).map((p: any) => [p.id, p.full_name || p.email || p.id]));
  const titleById = new Map((materials || []).map((m: any) => [m.id, m.title]));

  return {
    grants: rows.map((r) => ({
      ...r,
      studentLabel: nameById.get(r.user_id) || r.user_id,
      materialTitle: titleById.get(r.material_id) || 'Unknown material',
    })),
  };
}

export interface PendingClaim extends PaymentClaim {
  studentLabel: string;
  materialTitle: string;
}

/**
 * Admin side: every claim with no matching approval.
 *
 * "Resolved" is derived, not stored: an approval row names the claim it settles
 * via metadata.claim_id. Appending beats updating here — access_logs has no admin
 * UPDATE policy, and an append-only trail is the right shape for an audit table
 * anyway.
 */
export async function listPendingClaims(): Promise<{ claims: PendingClaim[]; error?: string }> {
  const { data, error } = await supabase
    .from('access_logs')
    .select('id, user_id, material_id, created_at, metadata, event_type')
    .in('event_type', [CLAIM_SUBMITTED, CLAIM_APPROVED])
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return { claims: [], error: error.message };

  const rows = (data || []) as PaymentClaim[];
  const resolved = new Set(
    rows
      .filter((r) => r.event_type === CLAIM_APPROVED)
      .map((r) => r.metadata?.claim_id)
      .filter(Boolean) as string[],
  );

  const pending = rows.filter(
    (r) => r.event_type === CLAIM_SUBMITTED && !resolved.has(r.id),
  );
  if (pending.length === 0) return { claims: [] };

  // access_logs.user_id references auth.users, which PostgREST cannot join to
  // profiles — so resolve the labels in two extra reads rather than one join.
  const userIds = [...new Set(pending.map((c) => c.user_id))];
  const materialIds = [...new Set(pending.map((c) => c.material_id).filter(Boolean))] as string[];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  const { data: materials } = await supabase
    .from('materials')
    .select('id, title')
    .in('id', materialIds);

  const nameById = new Map((profiles || []).map((p: any) => [p.id, p.full_name || p.email || p.id]));
  const titleById = new Map((materials || []).map((m: any) => [m.id, m.title]));

  return {
    claims: pending.map((c) => ({
      ...c,
      studentLabel: nameById.get(c.user_id) || c.user_id,
      materialTitle: c.material_id ? titleById.get(c.material_id) || 'Unknown material' : '—',
    })),
  };
}

/**
 * Admin side: grant access. Writes the entitlement (what actually unlocks the
 * reader) and an approval row naming the claim, so it drops off the pending list.
 */
export async function approveClaim(claim: PendingClaim): Promise<{ success: boolean; error?: string }> {
  if (!claim.material_id) {
    return { success: false, error: 'This claim has no material attached.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in.' };

  // Upsert, so approving twice is harmless rather than a duplicate-key error.
  const { error: entErr } = await supabase.from('entitlements').upsert(
    {
      user_id: claim.user_id,
      material_id: claim.material_id,
      status: 'active',
      granted_at: new Date().toISOString(),
      expires_at: null,
    },
    { onConflict: 'user_id,material_id' },
  );

  if (entErr) return { success: false, error: entErr.message };

  // Written as the ADMIN (user_id = self) because the insert policy requires
  // auth.uid() = user_id — an admin cannot forge a row on the student's behalf,
  // which is exactly the property you want in an audit table.
  const { error: logErr } = await supabase.from('access_logs').insert({
    user_id: user.id,
    material_id: claim.material_id,
    event_type: CLAIM_APPROVED,
    metadata: {
      claim_id: claim.id,
      student_id: claim.user_id,
      approved_by: user.id,
      reference: claim.metadata?.reference || null,
    },
  });

  if (logErr) {
    // The entitlement is already granted, so access works. Report the audit gap
    // rather than pretending the whole action failed.
    return { success: true, error: `Access granted, but the audit entry failed: ${logErr.message}` };
  }

  return { success: true };
}
