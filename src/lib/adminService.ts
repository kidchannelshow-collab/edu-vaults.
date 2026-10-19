import { supabase } from './supabase';
// The preview bucket name is owned by materialService. This literal used to be
// declared here AND there — two copies of one bucket name is precisely how a
// "bucket not found" drift starts. Imported, not re-declared.
import { PREVIEW_BUCKET } from './materialService';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalMaterials: number;
  publishedMaterials: number;
  activeEntitlements: number;
  activeDeviceSessions: number;
  totalPayments: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
  totalRevenue: number;
}

export interface PaymentRecord {
  id: string;
  user_id: string;
  material_id: string;
  amount: number;
  currency: string;
  tx_ref: string;
  flw_ref: string | null;
  status: 'pending' | 'successful' | 'failed';
  created_at: string;
  paid_at: string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
  materials?: { title: string | null } | null;
}

export interface AccessLogRecord {
  id: string;
  user_id: string;
  material_id: string | null;
  event_type: string;
  metadata: any;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
  materials?: { title: string | null } | null;
}

export interface EntitlementRecord {
  id: string;
  user_id: string;
  material_id: string;
  status: string;
  granted_at: string;
  expires_at: string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
  materials?: { title: string | null } | null;
}

export interface DeviceSessionRecord {
  id: string;
  user_id: string;
  created_at: string;
  last_seen?: string;
  last_seen_at?: string;
  revoked_at: string | null;
  device_identifier?: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

/**
 * Fetch real statistics for the Admin Dashboard
 */
export async function fetchAdminStats(): Promise<{ stats: AdminStats; error: any }> {
  try {
    // 1. Profiles stats
    const { count: totalUsers, error: usersErr } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: activeUsers, error: activeErr } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: suspendedUsers, error: suspendedErr } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'suspended');

    // 2. Materials stats
    const { count: totalMaterials, error: matErr } = await supabase
      .from('materials')
      .select('*', { count: 'exact', head: true });

    const { count: publishedMaterials, error: pubMatErr } = await supabase
      .from('materials')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true);

    // 3. Entitlements stats
    const { count: activeEntitlements, error: entErr } = await supabase
      .from('entitlements')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // 4. Active Streams — live readers, not historical sessions
    //
    // This counts devices heartbeating RIGHT NOW, not every row that was ever
    // created. The old query counted every row with revoked_at IS NULL, which
    // included superseded logins that were never marked revoked — 65 "devices"
    // for 4 users. A live stream is a non-revoked session whose heartbeat
    // (last_seen_at, sent every 3 minutes by AuthContext) landed in the last
    // 15 minutes. The platform enforces one active device per user, so distinct
    // users == live reading streams.
    let activeDeviceSessions = 0;
    try {
      const { data: sessionRows, error: sessErr } = await supabase
        .from('device_sessions')
        .select('id, user_id, revoked_at, is_revoked, last_seen_at');

      if (!sessErr && sessionRows) {
        const LIVE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
        const cutoff = Date.now() - LIVE_WINDOW_MS;
        const activeUserIds = new Set<string>();

        for (const s of sessionRows as Array<{
          user_id: string;
          revoked_at: string | null;
          is_revoked: boolean | null;
          last_seen_at: string | null;
        }>) {
          if (s.revoked_at || s.is_revoked === true) continue;

          const seenAt = s.last_seen_at ? new Date(s.last_seen_at).getTime() : NaN;
          // No usable heartbeat = not streaming. Do not let null/legacy rows
          // inflate the live count.
          if (!Number.isFinite(seenAt) || seenAt < cutoff) continue;

          activeUserIds.add(s.user_id);
        }

        activeDeviceSessions = activeUserIds.size;
      }
    } catch {
      // Table might not exist yet
    }

    // 5. Payments stats
    let totalPayments = 0;
    let successfulPayments = 0;
    let pendingPayments = 0;
    let failedPayments = 0;
    let totalRevenue = 0;
    try {
      const { data: payData } = await supabase.from('payments').select('amount, status');
      if (payData) {
        totalPayments = payData.length;
        for (const p of payData) {
          if (p.status === 'successful') {
            successfulPayments++;
            totalRevenue += Number(p.amount) || 0;
          } else if (p.status === 'pending') {
            pendingPayments++;
          } else if (p.status === 'failed') {
            failedPayments++;
          }
        }
      }
    } catch {
      // Table might not exist yet
    }

    return {
      stats: {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        suspendedUsers: suspendedUsers || 0,
        totalMaterials: totalMaterials || 0,
        publishedMaterials: publishedMaterials || 0,
        activeEntitlements: activeEntitlements || 0,
        activeDeviceSessions,
        totalPayments,
        successfulPayments,
        pendingPayments,
        failedPayments,
        totalRevenue,
      },
      error: null,
    };
  } catch (err) {
    return {
      stats: {
        totalUsers: 0,
        activeUsers: 0,
        suspendedUsers: 0,
        totalMaterials: 0,
        publishedMaterials: 0,
        activeEntitlements: 0,
        activeDeviceSessions: 0,
        totalPayments: 0,
        successfulPayments: 0,
        pendingPayments: 0,
        failedPayments: 0,
        totalRevenue: 0,
      },
      error: err,
    };
  }
}

/**
 * Fetch real payment records for Admin Payments
 */
export async function fetchPayments(limit = 10, offset = 0, statusFilter = 'all', searchQuery = ''): Promise<{ payments: PaymentRecord[]; count: number; error: any }> {
  try {
    let query = supabase
      .from('payments')
      .select('*', { count: 'exact' });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, count, error: fetchErr } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchErr) {
      return { payments: [], count: 0, error: fetchErr };
    }

    const payments: PaymentRecord[] = [];
    if (data) {
      for (const item of data) {
        let profile = null;
        let material = null;
        if (item.user_id) {
          const { data: pData } = await supabase.from('profiles').select('full_name, email').eq('id', item.user_id).maybeSingle();
          profile = pData;
        }
        if (item.material_id) {
          const { data: mData } = await supabase.from('materials_public').select('title').eq('id', item.material_id).maybeSingle();
          material = mData;
        }
        payments.push({
          ...item,
          profiles: profile,
          materials: material,
        });
      }
    }

    let filtered = payments;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = payments.filter((p) => {
        const txRef = p.tx_ref?.toLowerCase() || '';
        const flwRef = p.flw_ref?.toLowerCase() || '';
        const userName = p.profiles?.full_name?.toLowerCase() || '';
        const userEmail = p.profiles?.email?.toLowerCase() || '';
        const matTitle = p.materials?.title?.toLowerCase() || '';
        return txRef.includes(q) || flwRef.includes(q) || userName.includes(q) || userEmail.includes(q) || matTitle.includes(q);
      });
    }

    return { payments: filtered, count: count || 0, error: null };
  } catch (err) {
    return { payments: [], count: 0, error: err };
  }
}

/**
 * Fetch recent access logs for the Admin Dashboard
 */
export async function fetchRecentLogs(limit = 10): Promise<{ logs: AccessLogRecord[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('access_logs')
      .select('id, user_id, material_id, event_type, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { logs: [], error };
    }

    // Enrich with profiles and materials if possible
    const logs: AccessLogRecord[] = [];
    if (data) {
      for (const item of data) {
        let profile = null;
        let material = null;
        if (item.user_id) {
          const { data: pData } = await supabase.from('profiles').select('full_name, email').eq('id', item.user_id).maybeSingle();
          profile = pData;
        }
        if (item.material_id) {
          const { data: mData } = await supabase.from('materials_public').select('title').eq('id', item.material_id).maybeSingle();
          material = mData;
        }
        logs.push({
          ...item,
          profiles: profile,
          materials: material,
        });
      }
    }

    return { logs, error: null };
  } catch (err) {
    return { logs: [], error: err };
  }
}

/**
 * Update user profile status (suspend / reactivate)
 */
export async function updateUserStatus(userId: string, newStatus: 'active' | 'suspended'): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', userId);

    if (error) {
      return { success: false, error };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Update material publication status
 */
export async function updateMaterialPublishStatus(materialId: string, isPublished: boolean): Promise<{ success: boolean; error: any }> {
  try {
    // If publishing, verify material has a valid file_path
    if (isPublished) {
      const { data: mat, error: fetchErr } = await supabase
        .from('materials')
        .select('file_path, title')
        .eq('id', materialId)
        .single();

      if (fetchErr || !mat) {
        return { success: false, error: { message: 'Material not found.' } };
      }

      if (!mat.file_path || mat.file_path.trim() === '') {
        return { success: false, error: { message: 'Upload a PDF before publishing this material.' } };
      }
    }

    // `.select()` is load-bearing: an UPDATE that matches no rows (RLS denies
    // it, or the id is gone) returns NO error from PostgREST. Without this the
    // caller reports success while nothing changed.
    const { data: updated, error } = await supabase
      .from('materials')
      .update({ is_published: isPublished })
      .eq('id', materialId)
      .select('id');

    if (error) {
      return { success: false, error };
    }

    if (!updated || updated.length === 0) {
      return { success: false, error: { message: 'No material was updated — it may have been deleted.' } };
    }

    // Log audit event
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('access_logs').insert({
        user_id: user.id,
        material_id: materialId,
        event_type: isPublished ? 'material_published' : 'material_unpublished',
        metadata: { is_published: isPublished },
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Create a new material
 */
export async function createMaterial(data: {
  title: string;
  description?: string;
  subject?: string;
  category?: string;
  estimated_reading_minutes?: number;
  is_published?: boolean;
  price?: number;
  file?: File | null;
  /** Optional free two-page preview images shown before purchase. */
  /** Positionally indexed: [0] = Page 1, [1] = Page 2. null = slot left empty. */
  previewFiles?: (File | null)[];
}): Promise<{ data: any; success: boolean; error: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, success: false, error: { message: 'Unauthorized session.' } };
    }

    // Check admin role
    const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
      return { data: null, success: false, error: { message: 'Forbidden: Admin access required.' } };
    }

    // Default to the flagship price rather than 0. The table carries
    // `materials_flagship_price_check CHECK (price = 1500)` alongside
    // `price integer NOT NULL DEFAULT 0`, so a 0 default does not store — it
    // raises an opaque constraint violation instead.
    const FLAGSHIP_PRICE = 1500;
    const priceVal =
      data.price !== undefined && data.price !== null ? Number(data.price) : FLAGSHIP_PRICE;
    if (isNaN(priceVal) || priceVal < 0) {
      return { data: null, success: false, error: { message: 'Price must be a valid non-negative number.' } };
    }

    if (data.file) {
      const file = data.file;
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return { data: null, success: false, error: { message: 'Invalid file type. Only PDF files are allowed.' } };
      }
      const MAX_SIZE = 50 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        return { data: null, success: false, error: { message: 'PDF is too large. Maximum file size is 50 MB.' } };
      }
    }

    const insertPayload = {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      subject: data.subject?.trim() || null,
      category: data.category?.trim() || null,
      file_path: null,
      estimated_reading_minutes: data.estimated_reading_minutes ? Number(data.estimated_reading_minutes) : null,
      is_published: !!data.is_published,
      price: priceVal,
    };

    const { data: newMat, error: insertErr } = await supabase
      .from('materials')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr || !newMat) {
      return { data: null, success: false, error: insertErr || { message: 'Failed to insert material record.' } };
    }

    let storagePath: string | null = null;
    if (data.file) {
      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.pdf`;
      storagePath = `materials/${newMat.id}/${uniqueFileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('educational-materials')
        .upload(storagePath, data.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadErr) {
        // Rollback material creation
        await supabase.from('materials').delete().eq('id', newMat.id);
        return { data: null, success: false, error: uploadErr };
      }

      // Same zero-row hazard as uploadMaterialPdf: without `.select()` a blocked
      // UPDATE reports success and the material is created with a NULL
      // file_path while its PDF sits orphaned in storage.
      const { data: pathRows, error: updatePathErr } = await supabase
        .from('materials')
        .update({ file_path: storagePath })
        .eq('id', newMat.id)
        .select('id');

      if (updatePathErr || !pathRows || pathRows.length === 0) {
        await supabase.storage.from('educational-materials').remove([storagePath]);
        await supabase.from('materials').delete().eq('id', newMat.id);
        return {
          data: null,
          success: false,
          error: updatePathErr || {
            message: 'The PDF uploaded but the new material record could not be linked to it.',
          },
        };
      }
      newMat.file_path = storagePath;
    }

    // Optional free two-page preview images (public bucket, non-fatal if it fails).
    let previewCount = 0;
    if (data.previewFiles && data.previewFiles.some(Boolean)) {
      const previewRes = await uploadPreviewImages(newMat.id, data.previewFiles);
      if (previewRes.success) {
        previewCount = previewRes.urls?.length || 0;
        newMat.preview_images = previewRes.urls;
      } else {
        console.error('Preview image upload failed:', previewRes.error);
      }
    }

    // Log audit event
    await supabase.from('access_logs').insert({
      user_id: user.id,
      material_id: newMat.id,
      event_type: 'material_created',
      metadata: { title: newMat.title, is_published: newMat.is_published, price: newMat.price, has_pdf: !!data.file, preview_count: previewCount },
    });

    return { data: newMat, success: true, error: null };
  } catch (err) {
    return { data: null, success: false, error: err };
  }
}

/**
 * Update an existing material's metadata
 */
export async function updateMaterial(
  materialId: string,
  data: {
    title: string;
    description?: string;
    subject?: string;
    category?: string;
    estimated_reading_minutes?: number;
  }
): Promise<{ success: boolean; error: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: { message: 'Unauthorized session.' } };
    }

    const updatePayload = {
      title: data.title.trim(),
      description: data.description?.trim() || null,
      subject: data.subject?.trim() || null,
      category: data.category?.trim() || null,
      estimated_reading_minutes: data.estimated_reading_minutes !== undefined && data.estimated_reading_minutes !== null ? Number(data.estimated_reading_minutes) : null,
    };

    // `.select()` so a zero-row UPDATE (RLS denied / row gone) is detectable
    // instead of silently reporting success.
    const { data: updatedRows, error: updateErr } = await supabase
      .from('materials')
      .update(updatePayload)
      .eq('id', materialId)
      .select('id');

    if (updateErr) {
      return { success: false, error: updateErr };
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { success: false, error: { message: 'No material was updated — it may have been deleted.' } };
    }

    // Log audit event
    await supabase.from('access_logs').insert({
      user_id: user.id,
      material_id: materialId,
      event_type: 'material_updated',
      metadata: { updated_fields: Object.keys(updatePayload) },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/** Re-exported so existing importers keep working. Owned by materialService. */
export { PREVIEW_BUCKET };

/**
 * Upload the free two-page preview images for a material (admin only).
 *
 * Previews live in the PUBLIC 'material-previews' bucket and are intentionally
 * world-readable — they are the marketing sample. The protected PDF stays in the
 * private 'educational-materials' bucket and is never mirrored here.
 *
 * Replaces the material's existing preview set.
 */
export async function uploadPreviewImages(
  materialId: string,
  files: (File | null)[]
): Promise<{ success: boolean; urls?: string[]; error: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: { message: 'Unauthorized session.' } };
    }

    const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
      return { success: false, error: { message: 'Forbidden: Admin access required.' } };
    }

    // `files` is positionally indexed: index 0 is Page 1, index 1 is Page 2, and
    // an unset slot is null. It must never be compacted — see the note below.
    if (files.length > 2) {
      return { success: false, error: { message: 'A maximum of 2 preview pages is allowed.' } };
    }

    if (files.every((f) => !f)) {
      return { success: true, urls: [], error: null };
    }

    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB per preview image

    for (const f of files) {
      if (!f) continue;
      if (!ALLOWED_TYPES.includes(f.type)) {
        return { success: false, error: { message: `Invalid preview type for ${f.name}. Use PNG, JPEG, or WebP.` } };
      }
      if (f.size > MAX_SIZE) {
        return { success: false, error: { message: `Preview ${f.name} exceeds the 5 MB limit.` } };
      }
    }

    // Drop the previous preview set so replacements don't orphan objects.
    const { data: existing } = await supabase
      .from('materials')
      .select('preview_images')
      .eq('id', materialId)
      .single();

    const previous: string[] = existing?.preview_images || [];
    const previousPaths = previous
      .map((url) => url.split(`/${PREVIEW_BUCKET}/`)[1])
      .filter(Boolean);
    if (previousPaths.length > 0) {
      await supabase.storage.from(PREVIEW_BUCKET).remove(previousPaths);
    }

    // Indexed, not pushed: pushing would compact the array and slide Page 2 into
    // index 0 when Page 1 was left empty.
    const urls: string[] = new Array(files.length).fill('');
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      // Path convention mirrors the private bucket: previews/{material_id}/...
      const path = `previews/${materialId}/page-${i + 1}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(PREVIEW_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: true });

      if (uploadErr) {
        return { success: false, error: uploadErr };
      }

      const { data: pub } = supabase.storage.from(PREVIEW_BUCKET).getPublicUrl(path);
      urls[i] = pub.publicUrl;
    }

    // Trim only TRAILING empties so interior positions survive.
    while (urls.length > 0 && !urls[urls.length - 1]) {
      urls.pop();
    }

    const { data: savedRows, error: updateErr } = await supabase
      .from('materials')
      .update({ preview_images: urls })
      .eq('id', materialId)
      .select('id');

    if (!updateErr && (!savedRows || savedRows.length === 0)) {
      return { success: false, error: { message: 'Preview images could not be saved to this material.' } };
    }

    if (updateErr) {
      return { success: false, error: updateErr };
    }

    // Mirror the ordered array into the named columns (best-effort).
    await supabase
      .from('materials')
      .update({
        preview_page_1_url: urls[0] || null,
        preview_page_2_url: urls[1] || null,
      })
      .eq('id', materialId);

    await supabase.from('access_logs').insert({
      user_id: user.id,
      material_id: materialId,
      event_type: 'preview_images_updated',
      metadata: { count: urls.length },
    });

    return { success: true, urls, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Set ONE preview slot (page 1 or page 2) without disturbing the other.
 *
 * Pass `file = null` to clear the slot. Kept separate from
 * uploadPreviewImages so the admin UI can offer two independent pickers —
 * replacing page 2 must not silently drop page 1.
 */
export async function setPreviewSlot(
  materialId: string,
  slot: 1 | 2,
  file: File | null
): Promise<{ success: boolean; urls?: string[]; error: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: { message: 'Unauthorized session.' } };
    }

    const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
      return { success: false, error: { message: 'Forbidden: Admin access required.' } };
    }

    if (file) {
      const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
      const MAX_SIZE = 5 * 1024 * 1024;
      if (!ALLOWED_TYPES.includes(file.type)) {
        return { success: false, error: { message: 'Preview images must be PNG, JPEG, or WebP.' } };
      }
      if (file.size > MAX_SIZE) {
        return { success: false, error: { message: 'Preview image exceeds the 5 MB limit.' } };
      }
    }

    // Read the current pair so the untouched slot survives.
    const { data: existing, error: readErr } = await supabase
      .from('materials')
      .select('preview_images')
      .eq('id', materialId)
      .maybeSingle();

    if (readErr) {
      return { success: false, error: readErr };
    }

    const current: string[] = existing?.preview_images || [];
    const next: string[] = [current[0] ?? '', current[1] ?? ''];

    // Remove whatever previously occupied this slot so we do not orphan it.
    const oldUrl = next[slot - 1];
    if (oldUrl) {
      const oldPath = oldUrl.split(`/${PREVIEW_BUCKET}/`)[1];
      if (oldPath) {
        await supabase.storage.from(PREVIEW_BUCKET).remove([oldPath]);
      }
    }

    next[slot - 1] = '';

    if (file) {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `previews/${materialId}/page-${slot}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(PREVIEW_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: true });

      if (uploadErr) {
        return { success: false, error: uploadErr };
      }

      const { data: pub } = supabase.storage.from(PREVIEW_BUCKET).getPublicUrl(path);
      next[slot - 1] = pub.publicUrl;
    }

    // Preserve array POSITIONS: index 0 is always Page 1, index 1 always Page 2.
    //
    // This previously used `.filter(Boolean)`, which compacted the array: with
    // slot 1 empty, ['', url2] collapsed to [url2], so page 2's image was
    // written at index 0 and rendered in Slot 1's box. Only TRAILING empties are
    // trimmed — an interior gap must keep its index.
    const finalUrls = [...next];
    while (finalUrls.length > 0 && !finalUrls[finalUrls.length - 1]) {
      finalUrls.pop();
    }

    const { error: updateErr } = await supabase
      .from('materials')
      .update({ preview_images: finalUrls })
      .eq('id', materialId);

    if (updateErr) {
      return { success: false, error: updateErr };
    }

    // Named per-page URL columns (best-effort: older deployments may not have
    // the migration applied, and that must not fail the upload).
    const legacyColumn = slot === 1 ? 'preview_page_1_url' : 'preview_page_2_url';
    await supabase
      .from('materials')
      .update({ [legacyColumn]: finalUrls[slot - 1] || null })
      .eq('id', materialId);

    await supabase.from('access_logs').insert({
      user_id: user.id,
      material_id: materialId,
      event_type: 'preview_images_updated',
      metadata: { slot, action: file ? 'set' : 'cleared', count: finalUrls.length },
    });

    return { success: true, urls: finalUrls, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Upload or replace PDF for a material in the private 'educational-materials' storage bucket
 */
export async function uploadMaterialPdf(materialId: string, file: File, isReplacement = false): Promise<{ success: boolean; filePath?: string; error: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: { message: 'Unauthorized session.' } };
    }

    // Check admin role
    const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
      return { success: false, error: { message: 'Forbidden: Admin access required.' } };
    }

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return { success: false, error: { message: 'Invalid file type. Only PDF files are allowed.' } };
    }

    // Validate max size 50 MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return { success: false, error: { message: 'PDF is too large. Maximum file size is 50 MB.' } };
    }

    // Verify material exists
    const { data: mat, error: matErr } = await supabase.from('materials').select('id').eq('id', materialId).single();
    if (matErr || !mat) {
      return { success: false, error: { message: 'Material not found.' } };
    }

    // Generate controlled path structure: materials/{material_id}/{unique_filename}.pdf
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.pdf`;
    const storagePath = `materials/${materialId}/${uniqueFileName}`;

    // Upload to private bucket 'educational-materials'
    const { error: uploadErr } = await supabase.storage
      .from('educational-materials')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadErr) {
      return { success: false, error: uploadErr };
    }

    // Update materials table file_path.
    //
    // `.select()` is essential: the file has ALREADY been uploaded to storage by
    // this point, so if this UPDATE silently affects zero rows (RLS), the
    // function used to report success while `file_path` stayed NULL — the file
    // existed but every read still said "PDF: Not uploaded", permanently.
    const { data: pathRows, error: updateErr } = await supabase
      .from('materials')
      .update({ file_path: storagePath })
      .eq('id', materialId)
      .select('id');

    if (updateErr) {
      // Roll the orphaned object back so storage does not accumulate files that
      // no material row points at.
      await supabase.storage.from('educational-materials').remove([storagePath]);
      return { success: false, error: updateErr };
    }

    if (!pathRows || pathRows.length === 0) {
      await supabase.storage.from('educational-materials').remove([storagePath]);
      return {
        success: false,
        error: {
          message:
            'The PDF uploaded but the material record could not be updated (0 rows). The admin RLS policy blocked the write — apply src/db/migration_fix_pipeline.sql.',
        },
      };
    }

    // Audit log
    await supabase.from('access_logs').insert({
      user_id: user.id,
      material_id: materialId,
      event_type: isReplacement ? 'pdf_replaced' : 'pdf_uploaded',
      metadata: { filename: file.name, size_bytes: file.size, path: storagePath },
    });

    return { success: true, filePath: storagePath, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Revoke device session
 */
export async function revokeDeviceSession(sessionId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Fetch session details for audit log
    const { data: sess } = await supabase.from('device_sessions').select('user_id, device_identifier').eq('id', sessionId).maybeSingle();

    const { error } = await supabase
      .from('device_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) {
      return { success: false, error };
    }

    if (sess) {
      await supabase.from('access_logs').insert({
        user_id: sess.user_id,
        event_type: 'device_session_revoked',
        metadata: { admin_id: user?.id, session_id: sessionId, device_identifier: sess.device_identifier },
      });
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Securely delete a material and its associated PDF from storage.
 * If the material has associated records (payments, entitlements, reading_progress), prevents permanent deletion and instructs admin to unpublish instead.
 */
export async function deleteMaterial(materialId: string): Promise<{ success: boolean; message: string; error: any }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, message: 'Unauthorized session.', error: { message: 'Unauthorized' } };
    }

    // Check admin role & active status
    const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
      return { success: false, message: 'Forbidden: Admin access required.', error: { message: 'Forbidden' } };
    }

    // Select ONLY columns guaranteed to exist.
    //
    // This used to also request `preview_images`. On a deployment where that
    // column had not been migrated yet, PostgREST answered 400 (42703), the
    // error was swallowed, and a material that plainly existed was reported as
    // "Material not found." — the row was fine, the query was not.
    const { data: material, error: matErr } = await supabase
      .from('materials')
      .select('id, title, file_path, is_published')
      .eq('id', materialId)
      .maybeSingle();

    if (matErr || !material) {
      return {
        success: false,
        message: matErr?.message || 'Material not found.',
        error: matErr,
      };
    }

    // Check if there are associated records in payments, entitlements, or reading_progress
    const [paymentRes, entitlementRes, progressRes] = await Promise.all([
      supabase.from('payments').select('*', { count: 'exact', head: true }).eq('material_id', materialId),
      supabase.from('entitlements').select('*', { count: 'exact', head: true }).eq('material_id', materialId),
      supabase.from('reading_progress').select('*', { count: 'exact', head: true }).eq('material_id', materialId),
    ]);

    const hasAssociatedRecords =
      (paymentRes.count || 0) > 0 ||
      (entitlementRes.count || 0) > 0 ||
      (progressRes.count || 0) > 0;

    if (hasAssociatedRecords) {
      return {
        success: false,
        message: 'This material has associated records and cannot be permanently deleted. Unpublish it instead.',
        error: { message: 'Associated records exist' },
      };
    }

    // If no dependent records exist, safely delete the PDF and any preview images
    if (material.file_path) {
      await supabase.storage
        .from('educational-materials')
        .remove([material.file_path]);
    }

    // Preview cleanup is best-effort and must never block the delete: if the
    // column is absent on this deployment there is simply nothing to remove.
    try {
      const { data: previewRow } = await supabase
        .from('materials')
        .select('preview_images')
        .eq('id', materialId)
        .maybeSingle();

      const previewUrls: string[] = previewRow?.preview_images || [];
      const previewPaths = previewUrls
        .map((url) => url.split(`/${PREVIEW_BUCKET}/`)[1])
        .filter(Boolean);
      if (previewPaths.length > 0) {
        await supabase.storage.from(PREVIEW_BUCKET).remove(previewPaths);
      }
    } catch {
      // Column not present on this deployment — nothing to clean up.
    }

    // Preferred path: the SECURITY DEFINER RPC.
    //
    // A direct `.delete()` is subject to the "Admins can manage materials" RLS
    // policy. When that policy's EXISTS check on profiles does not resolve, the
    // statement affects ZERO rows and PostgREST reports NO error — so a blocked
    // delete is indistinguishable from a real one. The RPC does the delete with
    // definer rights and verifies the caller is an active admin itself.
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('admin_delete_material', {
      p_material_id: materialId,
    });

    if (!rpcErr) {
      const deletedCount = Number((rpcResult as { deleted?: number } | null)?.deleted ?? 0);

      if (deletedCount === 0) {
        return {
          success: false,
          message: 'The material could not be removed — it may already have been deleted.',
          error: { message: 'Zero rows deleted' },
        };
      }

      // The RPC writes its own audit row, so skip the client-side one.
      return { success: true, message: 'Material deleted successfully.', error: null };
    }

    // PGRST202 / 42883 = function not found, i.e. the migration has not been
    // applied on this deployment. Fall back to the direct delete so the feature
    // still works, degraded, rather than failing outright.
    const rpcUnavailable = rpcErr.code === 'PGRST202' || rpcErr.code === '42883';

    if (!rpcUnavailable) {
      return { success: false, message: rpcErr.message || 'Failed to delete material.', error: rpcErr };
    }

    // `.select()` is what proves the row actually went: a DELETE matching
    // nothing returns no error, which previously let the UI report success
    // while the row survived (the "phantom material" symptom).
    const { data: deletedRows, error: deleteErr } = await supabase
      .from('materials')
      .delete()
      .eq('id', materialId)
      .select('id');

    if (deleteErr) {
      return { success: false, message: deleteErr.message || 'Failed to delete material record.', error: deleteErr };
    }

    if (!deletedRows || deletedRows.length === 0) {
      return {
        success: false,
        message:
          'The database refused the delete (0 rows affected). Apply src/db/migration_fix_pipeline.sql — it adds the admin_delete_material function that performs this delete reliably.',
        error: { message: 'Zero rows deleted' },
      };
    }

    await supabase.from('access_logs').insert({
      user_id: user.id,
      event_type: 'material_deleted',
      metadata: { material_id: materialId, title: material.title },
    });

    return { success: true, message: 'Material deleted successfully.', error: null };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to delete material.', error: err };
  }
}
