import React, { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import {
  ShieldCheck,
  FileText,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { getSecureMaterialAccess, getMaskedEmail } from '../../lib/materialService';
import { SecurePdfReader } from '../../components/SecurePdfReader';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface MaterialRow {
  id: string;
  title: string;
  file_path: string | null;
  is_published: boolean;
}

/**
 * Admin-only secure reader.
 *
 * This exists because the Edge Function already lets admins through: it skips the
 * entitlement check for `profiles.role = 'admin'` (get-secure-material:107-108).
 * So an admin can mint a real signed URL for any published material without a
 * purchase, without test mode, and without weakening a single policy — which makes
 * this the honest way to audit what is actually in the bucket.
 *
 * The signed URL lasts 60 seconds, so the canvas offers an explicit re-mint.
 */
export const AdminReader: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const { user } = useAuth();
  const { profile } = useProfile();

  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<MaterialRow | null>(null);

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminName =
    profile?.full_name || user?.user_metadata?.full_name || 'Administrator';
  const adminEmailMasked = getMaskedEmail(user?.email || profile?.email);

  // Admins hold SELECT on the base table through the "Admins can manage materials"
  // policy, so this can read file_path — the column the storefront never receives.
  useEffect(() => {
    (async () => {
      setListLoading(true);
      setListError(null);
      const { data, error: err } = await supabase
        .from('materials')
        .select('id, title, file_path, is_published')
        .order('created_at', { ascending: false });

      if (err) setListError(err.message);
      else setMaterials((data as MaterialRow[]) || []);
      setListLoading(false);
    })();
  }, []);

  const load = async (id: string) => {
    setSelectedId(id);
    setSignedUrl(null);
    setError(null);

    if (!id) {
      setSelected(null);
      return;
    }

    const row = materials.find((m) => m.id === id) || null;
    setSelected(row);

    // Fail loudly rather than showing an empty canvas: a NULL file_path is a data
    // problem, and the Edge Function would only report "PDF document not found".
    if (row && !row.file_path) {
      setError(
        'This material has no PDF attached — file_path is NULL, so there is nothing to sign. Upload one from Materials first.',
      );
      return;
    }

    setLoading(true);

    // Sign directly as an admin. The bucket policy grants admins FOR ALL on
    // `educational-materials` (migration_converge_security.sql:78-80), and FOR ALL
    // includes SELECT — which is all createSignedUrl requires. So the client can
    // mint its own URL without the Edge Function, and ask for a longer TTL than
    // the 60 seconds the Edge Function issues.
    let url: string | null = null;
    let failure: string | null = null;

    if (row?.file_path) {
      const { data, error: signErr } = await supabase.storage
        .from('educational-materials')
        .createSignedUrl(row.file_path, 300);

      if (signErr || !data?.signedUrl) {
        failure = signErr?.message || 'createSignedUrl returned no URL.';
      } else {
        url = data.signedUrl;
      }
    }

    // Fall back to the Edge Function, which signs with the service_role key and so
    // bypasses storage RLS entirely. If the admin bucket policy is ever missing,
    // this path still works where direct signing would not.
    if (!url) {
      const res = await getSecureMaterialAccess(id);
      if (res.success && res.signedUrl) {
        url = res.signedUrl;
      } else {
        failure =
          res.errorMessage ||
          failure ||
          `No signed URL was issued (${res.denialReason || 'unknown reason'}).`;
      }
    }

    setLoading(false);

    if (!url) {
      setError(failure || 'Could not obtain a signed URL for this material.');
      return;
    }

    setSignedUrl(url);

    // Direct signing skips the Edge Function's own audit write, so record the
    // equivalent event here — otherwise admin previews would vanish from the
    // access log. Non-blocking: a logging failure must not stop the view.
    (async () => {
      try {
        await supabase.rpc('log_security_event', {
          p_event_type: 'admin_preview_signed',
          p_material_id: id,
          p_metadata: { ttl_seconds: 300, via: 'direct_storage' },
        });
      } catch {
        /* non-blocking */
      }
    })();
  };

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-line-strong pb-5">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <ShieldCheck className="h-5 w-5 text-gold" />
            Secure Reader
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            Opens the exact file held in the private bucket, signed server-side. Admin accounts
            bypass the entitlement check, so this needs no purchase and no test-mode flag.
          </p>
        </div>

        {/* Material selector */}
        <div className="rounded-lg border border-line-strong bg-surface p-4">
          <label htmlFor="admin-reader-material" className="mb-2 block text-sm font-medium text-ink">
            Material
          </label>

          {listLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading materials…
            </div>
          ) : listError ? (
            <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Could not load materials: {listError}</span>
            </div>
          ) : materials.length === 0 ? (
            <p className="py-2 text-sm text-ink-muted">
              No materials exist yet. Create one under Materials.
            </p>
          ) : (
            <select
              id="admin-reader-material"
              value={selectedId}
              onChange={(e) => load(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25"
            >
              <option value="">Select a material…</option>
              {materials.map((m) => {
                const suffix = !m.file_path
                  ? ' — no PDF'
                  : m.is_published
                    ? ''
                    : ' — draft (unpublished)';
                return (
                  <option key={m.id} value={m.id}>
                    {m.title}
                    {suffix}
                  </option>
                );
              })}
            </select>
          )}

          {/* Audit detail — the point of this screen is seeing what is really stored */}
          {selected && (
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line-strong pt-4 text-xs sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="font-medium text-ink-faint">Status</dt>
                <dd className={selected.is_published ? 'text-success' : 'text-ink-muted'}>
                  {selected.is_published ? 'Published' : 'Draft — unpublished'}
                </dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="font-medium text-ink-faint">Storage path</dt>
                <dd className="truncate font-mono text-ink-muted" title={selected.file_path || ''}>
                  {selected.file_path || '—'}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Signing state */}
        {loading && (
          <div className="flex items-center gap-3 rounded-lg border border-line-strong bg-surface-deep p-4 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Requesting a signed URL from the Edge Function…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <strong className="block font-semibold">No document could be opened</strong>
              <span className="text-danger/90">{error}</span>
            </div>
          </div>
        )}

        {/* The document */}
        {!loading && signedUrl && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-muted">
                Signed URL expires 5 minutes after issue — re-mint if the frame goes blank.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => load(selectedId)}
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Re-mint URL
              </Button>
            </div>

            <div className="relative">
              <SecurePdfReader url={signedUrl} materialId={selectedId} title={selected?.title} />

              {/* Watermark — z-10 and pointer-events-none, so it sits over the
                  canvas without blocking the pagination controls. */}
              <div className="pointer-events-none absolute inset-0 z-10 flex select-none flex-col items-center justify-center space-y-16 opacity-[0.04] [transform:rotate(-25deg)]">
                <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
                  ADMIN AUDIT • {adminName.toUpperCase()}
                </div>
                <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
                  {adminEmailMasked.toUpperCase()} • EDUVAULT SECURE STREAM
                </div>
                <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
                  ADMIN AUDIT • {adminName.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !signedUrl && (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface-deep py-16 text-center">
            <FileText className="mx-auto mb-2 h-6 w-6 text-ink-faint" />
            <p className="text-sm text-ink-muted">
              Pick a material above to open its real PDF.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
