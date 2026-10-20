import { supabase } from './supabase';
import { checkDeviceSessionActive } from './deviceService';

/**
 * The platform sells exactly one flagship material at a fixed price.
 * `materials.price` remains the authoritative value charged by the
 * create-payment Edge Function — this constant is for display/fallback only.
 */
export const FLAGSHIP_PRICE_NGN = 1500;

/** Formats NGN amounts as ₦1,500. */
export function formatNaira(amount: number | null | undefined): string {
  return `₦${(amount ?? FLAGSHIP_PRICE_NGN).toLocaleString('en-NG')}`;
}

/**
 * Shape of a row from the public `materials_public` view.
 * Deliberately contains NO `file_path` — that column is never readable by the
 * public client and is only resolved server-side in get-secure-material.
 */
export interface DbMaterial {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  category: string | null;
  estimated_reading_minutes: number | null;
  is_published: boolean;
  price: number;
  preview_images: string[] | null;
  /** Named preview URLs written by the admin console (see migration). */
  preview_page_1_url?: string | null;
  preview_page_2_url?: string | null;
  created_at?: string;
  updated_at?: string;
  /**
   * Only populated when a row is read from the `materials` BASE TABLE — i.e. by
   * the admin console. The public `materials_public` view deliberately omits
   * this column, so it is undefined for anything the storefront can read.
   */
  file_path?: string | null;
}

export interface MaterialWithStatus extends DbMaterial {
  isLocked: boolean;
  progress: number;
  /** Last read page from reading_progress (dashboard resume line). */
  currentPage?: number;
  /** True page count from reading_progress. */
  totalPages?: number;
  /** Current chapter/section label persisted with live progress. */
  lastSection?: string;
}

export interface SecureAccessResult {
  success: boolean;
  signedUrl?: string;
  material?: DbMaterial;
  denialReason?: 'not_authenticated' | 'account_suspended' | 'device_revoked' | 'no_entitlement' | 'entitlement_expired' | 'material_unpublished' | 'pdf_missing' | 'error';
  errorMessage?: string;
}

/** Columns safe to request from the public view. */
const PUBLIC_MATERIAL_COLUMNS =
  'id, title, description, subject, category, estimated_reading_minutes, is_published, price, preview_images';

/**
 * Fetch the single flagship material, plus the caller's entitlement and reading
 * progress when signed in.
 *
 * Reads from `materials_public` — never `materials` — so the protected
 * `file_path` cannot reach the public client.
 */
export async function getFlagshipMaterial(
  userId?: string
): Promise<{ material: MaterialWithStatus | null; error: any }> {
  try {
    const { data: material, error: matError } = await supabase
      .from('materials_public')
      .select(PUBLIC_MATERIAL_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (matError) {
      return { material: null, error: matError };
    }

    if (!material) {
      return { material: null, error: null };
    }

    // Optional per-page URL columns. Queried separately and non-fatally: on a
    // deployment where the migration has not been applied the view returns
    // 42703 for these columns, which must not break the storefront.
    let pageUrls: { preview_page_1_url: string | null; preview_page_2_url: string | null } | null =
      null;
    try {
      const { data } = await supabase
        .from('materials_public')
        .select('preview_page_1_url, preview_page_2_url')
        .eq('id', material.id)
        .maybeSingle();
      pageUrls = (data as any) || null;
    } catch {
      pageUrls = null;
    }

    const materialRow: DbMaterial = {
      ...(material as DbMaterial),
      preview_page_1_url: pageUrls?.preview_page_1_url ?? null,
      preview_page_2_url: pageUrls?.preview_page_2_url ?? null,
    };

    // Entitlement + progress are per-user; anonymous visitors are always locked.
    let isLocked = true;
    let progress = 0;
    let currentPage: number | undefined;
    let totalPages: number | undefined;
    let lastSection: string | undefined;

    if (userId) {
      const { data: entitlement } = await supabase
        .from('entitlements')
        .select('status, expires_at')
        .eq('user_id', userId)
        .eq('material_id', material.id)
        .eq('status', 'active')
        .maybeSingle();

      isLocked = !(
        entitlement && (!entitlement.expires_at || new Date(entitlement.expires_at) > new Date())
      );

      // Prefer the live progress table; fall back to reading_progress for
      // deployments where the user_material_progress migration is not applied
      // (a missing table is just a PostgREST error, never a crash).
      const { data: liveProgress } = await supabase
        .from('user_material_progress')
        .select('last_page, total_pages, progress_percent, last_section')
        .eq('user_id', userId)
        .eq('material_id', material.id)
        .maybeSingle();

      if (liveProgress) {
        progress = Number(liveProgress.progress_percent || 0);
        currentPage = Number(liveProgress.last_page || 0) || undefined;
        totalPages = Number(liveProgress.total_pages || 0) || undefined;
        lastSection = typeof liveProgress.last_section === 'string' ? liveProgress.last_section : undefined;
      } else {
        const { data: progressRow } = await supabase
          .from('reading_progress')
          .select('current_page, total_pages, progress_percent')
          .eq('user_id', userId)
          .eq('material_id', material.id)
          .maybeSingle();

        if (progressRow) {
          progress = Number(progressRow.progress_percent || 0);
          currentPage = Number(progressRow.current_page || 0) || undefined;
          totalPages = Number(progressRow.total_pages || 0) || undefined;
        }
      }
    }

    return {
      material: {
        ...materialRow,
        isLocked,
        progress,
        currentPage,
        totalPages,
        lastSection,
      },
      error: null,
    };
  } catch (err) {
    return { material: null, error: err };
  }
}

/**
 * Preview image URLs for the two-page sample. Falls back to an empty array so
 * callers can render an "no preview available" state without null checks.
 */
export function getPreviewImages(material: DbMaterial | null | undefined): string[] {
  if (!material?.preview_images) return [];
  return material.preview_images
    .filter((url) => typeof url === 'string' && url.length > 0)
    .map(resolvePreviewUrl);
}

/**
 * The public bucket holding the two free sample pages.
 *
 * Single source of truth. adminService imports this rather than re-declaring the
 * literal, because two copies of a bucket name is exactly how a "bucket not found"
 * drift begins — and this codebase has already been bitten by silent drift twice.
 */
export const PREVIEW_BUCKET = 'material-previews';

/**
 * Turn whatever is stored in `preview_images` into a usable `<img src>`.
 *
 * The admin upload path stores a FULL public URL. A row seeded by hand, or by
 * an older code path, may instead hold a bare storage path
 * ("previews/<id>/page-1.png") — which renders as a broken relative URL against
 * the current route and shows up as "preview being prepared" rather than an
 * error. Resolve both shapes here so every consumer gets an absolute URL.
 */
export function resolvePreviewUrl(value: string): string {
  if (!value) return '';

  // Already absolute, or an inline/blob URL — pass through untouched.
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  // A full storage URL that lost its protocol.
  if (value.includes(`/${PREVIEW_BUCKET}/`)) {
    return `https://${value.replace(/^\/+/, '')}`;
  }

  const { data } = supabase.storage.from(PREVIEW_BUCKET).getPublicUrl(value.replace(/^\/+/, ''));
  return data.publicUrl;
}

/**
 * Mask email for secure watermarking (e.g. em***@gmail.com)
 */
export function getMaskedEmail(email?: string | null): string {
  if (!email) return 'student@eduvault.secure';
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 2 ? name.substring(0, 2) + '***' : name + '***';
  return `${maskedName}@${domain}`;
}

/**
 * Recover the real reason from a failed `functions.invoke`.
 *
 * supabase-js collapses a non-2xx response into "Edge Function returned a
 * non-2xx status code"; the deciding text lives on `error.context` as a
 * Response. Reading it as text first (JSON second) keeps a plain-text 403 or
 * gateway error visible instead of losing it to a failed `.json()`.
 */
async function describeAccessError(error: any): Promise<string> {
  const context = error?.context;

  if (context && typeof context.text === 'function') {
    try {
      const raw = await context.text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          return parsed?.error || parsed?.message || raw;
        } catch {
          return raw;
        }
      }
    } catch {
      /* body already consumed or unreadable */
    }
  }

  if (typeof context === 'string' && context.trim()) return context;
  return error?.message || 'Access denied';
}

/**
 * Call get-secure-material with a guaranteed-fresh access token.
 *
 * `functions.invoke` relies on whatever session supabase-js currently holds. A
 * token that expired between the last refresh tick and the click produces a 401
 * — which surfaces as "security could not connect" and bounces an entitled
 * reader. This refreshes proactively when the token is close to expiry (or on
 * demand after a failure) and pins the resulting token on the request.
 */
async function invokeSecureMaterial(materialId: string, forceRefresh = false) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let token = session?.access_token;
  const expiresSoon =
    typeof session?.expires_at === 'number'
      ? session.expires_at * 1000 - Date.now() < 120_000
      : true;

  if (forceRefresh || !token || expiresSoon) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? token;
  }

  return supabase.functions.invoke('get-secure-material', {
    body: { material_id: materialId },
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
}

/**
 * Last-resort signed URL minted directly against Storage.
 *
 * Used ONLY when the get-secure-material Edge Function is missing or
 * unreachable AND the caller's entitlement was just verified. It is not a
 * paywall bypass: the `educational-materials` bucket's SELECT policy only
 * matches an object whose path contains the caller's own active entitlement's
 * material_id (see migration_storage_entitled_access.sql). A non-entitled user
 * can call this all day and Storage still refuses to list or sign.
 */
async function mintDirectSignedUrl(materialId: string): Promise<string | null> {
  try {
    const bucket = supabase.storage.from('educational-materials');
    const folder = `materials/${materialId}`;

    const { data: files, error } = await bucket.list(folder, { limit: 20 });
    if (error || !files) return null;

    const pdf = files.find((f) => (f.name || '').toLowerCase().endsWith('.pdf'));
    if (!pdf) return null;

    const { data, error: signErr } = await bucket.createSignedUrl(
      `${folder}/${pdf.name}`,
      3600,
    );
    if (signErr || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Centralized secure material access function performing the complete authorization chain:
 * Authenticated user -> Active profile -> Authorized device session -> Published material -> Active entitlement -> PDF exists -> Signed URL
 *
 * The signed URL is minted server-side by the get-secure-material Edge Function.
 * The client never learns `file_path` and never touches the private bucket directly.
 */
export async function getSecureMaterialAccess(materialId: string): Promise<SecureAccessResult> {
  // Helper to log denial
  async function logDenial(reason: string, userId?: string) {
    try {
      if (userId) {
        await supabase.rpc('log_security_event', {
          p_event_type: 'secure_pdf_access_denied',
          p_material_id: materialId,
          p_metadata: { reason },
        });
      }
    } catch {
      // Non-blocking logging
    }
  }

  try {
    // 1. Verify authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      await logDenial('not_authenticated');
      return { success: false, denialReason: 'not_authenticated', errorMessage: 'Please log in to continue.' };
    }

    // 2. Verify authorized device session locally before calling edge function
    const deviceCheck = await checkDeviceSessionActive();
    if (!deviceCheck.active) {
      await logDenial('device_revoked', user.id);
      return { success: false, denialReason: 'device_revoked', errorMessage: 'Your session is no longer authorized on this device.' };
    }

    // 3. Invoke secure server-side Edge Function for authorization & signed URL generation.
    //    One retry with a force-refreshed token covers expired-session 401s and
    //    transient network drops without ever showing the paywall to an owner.
    let { data, error } = await invokeSecureMaterial(materialId);

    if (error || !data?.success) {
      const status = (error as any)?.context?.status ?? (error as any)?.status;
      const transportFailure =
        (error as any)?.name === 'FunctionsFetchError' || status === undefined;

      if (status === 401 || status === 403 || transportFailure) {
        const retry = await invokeSecureMaterial(materialId, true);
        data = retry.data;
        error = retry.error;
      }
    }

    if (error || !data || !data.success) {
      const errReason = (
        (data && data.success === false && data.error) ||
        (error ? await describeAccessError(error) : '') ||
        'Access denied'
      ).toString();
      const lower = errReason.toLowerCase();

      let entitlementActive = false;
      const { data: ent } = await supabase
        .from('entitlements')
        .select('status, expires_at')
        .eq('user_id', user.id)
        .eq('material_id', materialId)
        .maybeSingle();

      entitlementActive =
        ent?.status === 'active' &&
        (!ent.expires_at || new Date(ent.expires_at) > new Date());

      // FALLBACK before declaring failure: an entitled owner must never be
      // locked out because the Edge Function is not deployed or is unreachable.
      // Storage RLS performs the same entitlement check server-side.
      if (entitlementActive) {
        const fallbackUrl = await mintDirectSignedUrl(materialId);

        if (fallbackUrl) {
          const { data: meta } = await supabase
            .from('materials_public')
            .select(PUBLIC_MATERIAL_COLUMNS)
            .eq('id', materialId)
            .maybeSingle();

          return {
            success: true,
            signedUrl: fallbackUrl,
            material: (meta as DbMaterial) || ({
              id: materialId,
              title: '',
              description: null,
              subject: null,
              category: null,
              estimated_reading_minutes: null,
              is_published: true,
              price: FLAGSHIP_PRICE_NGN,
              preview_images: [],
            } as DbMaterial),
          };
        }
      }

      let denialReason: SecureAccessResult['denialReason'] = 'no_entitlement';
      if (lower.includes('suspended')) denialReason = 'account_suspended';
      else if (lower.includes('unpublished')) denialReason = 'material_unpublished';
      else if (lower.includes('expired')) denialReason = 'entitlement_expired';
      else if (
        lower.includes('no active entitlement') ||
        lower.includes('not entitled') ||
        lower.includes('no entitlement')
      )
        denialReason = 'no_entitlement';
      else if (entitlementActive) denialReason = 'error';
      // Anything else for a NON-entitled user stays 'no_entitlement': that is
      // the correct paywall state, and checkout is the next step.

      await logDenial(denialReason, user.id);

      return {
        success: false,
        denialReason,
        errorMessage:
          denialReason === 'error' && entitlementActive
            ? 'Your book access is active, but the secure reader could not be connected. Please try again in a moment.'
            : errReason,
      };
    }

    return {
      success: true,
      // Accept both response key names: older deployed builds returned
      // `signedPdfUrl`, and a key rename on one side alone is exactly how a
      // reader ends up with an undefined URL.
      signedUrl: data.signedUrl || data.signedPdfUrl,
      material: data.material as DbMaterial,
    };
  } catch (err: any) {
    return { success: false, denialReason: 'error', errorMessage: err.message || 'Secure access authorization failed.' };
  }
}
