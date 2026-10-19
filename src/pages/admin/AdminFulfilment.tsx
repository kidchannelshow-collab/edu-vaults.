import React, { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout';
import {
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Receipt,
  BookOpen,
  Lock,
  Unlock,
  UserPlus,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { supabase } from '../../lib/supabase';
import {
  approveClaim,
  grantAccessByEmail,
  listAccessGrants,
  listPendingClaims,
  setAccessState,
  AccessGrant,
  PendingClaim,
} from '../../lib/fulfilmentService';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

/**
 * Manual payment fulfilment and book access control.
 *
 * Students transfer ₦1,500 by bank and send the receipt on WhatsApp. An admin
 * confirms it here, activates the book for that account, and the reader opens on
 * the student's next access check (or live, via the realtime entitlement watch).
 */
export const AdminFulfilment: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Manual book access control — independent of the claim queue.
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [materials, setMaterials] = useState<{ id: string; title: string }[]>([]);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantMaterialId, setGrantMaterialId] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);

    const [{ claims: rows, error: err }, { grants: grantRows, error: grantErr }] =
      await Promise.all([listPendingClaims(), listAccessGrants()]);

    if (err) setError(err);
    else setClaims(rows);

    if (grantErr) setError((prev) => prev || grantErr || null);
    else setGrants(grantRows);

    // The public catalogue view is what both admin and student can read.
    const { data: matRows } = await supabase
      .from('materials_public')
      .select('id, title')
      .order('created_at', { ascending: false });

    const mats = (matRows || []) as { id: string; title: string }[];
    setMaterials(mats);
    setGrantMaterialId((current) => current || mats[0]?.id || '');

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A student submitting a claim is the signal this screen waits for.
  useRealtimeRefresh(['access_logs', 'entitlements'], () => load(false));

  const handleApprove = async (claim: PendingClaim) => {
    setApprovingId(claim.id);
    setError(null);

    const res = await approveClaim(claim);

    if (!res.success) {
      setError(res.error || 'Could not grant access.');
    } else {
      setSuccessMessage(
        res.error
          ? res.error
          : `Access granted to ${claim.studentLabel} for "${claim.materialTitle}".`,
      );
      setTimeout(() => setSuccessMessage(null), 6000);
      await load(false);
    }

    setApprovingId(null);
  };

  const handleGrantByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantMaterialId) {
      setError('Select a book first.');
      return;
    }

    setGranting(true);
    setError(null);
    setGrantMessage(null);

    const res = await grantAccessByEmail(grantEmail, grantMaterialId);

    if (!res.success) {
      setError(res.error || 'Could not activate access.');
    } else {
      setGrantMessage(`Book access activated for ${grantEmail.trim()}.`);
      setGrantEmail('');
      setTimeout(() => setGrantMessage(null), 6000);
      await load(false);
    }

    setGranting(false);
  };

  const handleToggleAccess = async (grant: AccessGrant) => {
    const active = grant.status !== 'active';
    setTogglingKey(grant.id);
    setError(null);

    const res = await setAccessState(grant.user_id, grant.material_id, active);

    if (!res.success) {
      setError(res.error || 'Could not change book access.');
    } else {
      setSuccessMessage(
        active
          ? `Access activated for ${grant.studentLabel} — "${grant.materialTitle}".`
          : `Access deactivated for ${grant.studentLabel} — "${grant.materialTitle}".`,
      );
      setTimeout(() => setSuccessMessage(null), 6000);
      await load(false);
    }

    setTogglingKey(null);
  };

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 border-b border-line-strong pb-5 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Receipt className="h-5 w-5 text-gold" />
              Payment Fulfilment
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              Students transfer ₦1,500 to the OPay account, then send their receipt on WhatsApp.
              Confirm the receipt, then activate the book here — this is what unlocks the reader.
              Deactivating revokes access immediately on the student's next access check.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => load()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
        </div>

        {successMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Queue */}
        <div className="overflow-hidden rounded-lg border border-line-strong bg-surface">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading claims…
            </div>
          ) : claims.length === 0 ? (
            <div className="py-20 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-ink-faint" />
              <p className="text-sm text-ink-muted">No payments awaiting confirmation.</p>
              <p className="mt-1 text-xs text-ink-faint">
                Claims appear here the moment a buyer submits their reference.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line-strong bg-surface-deep">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Buyer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Material
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Submitted
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr
                      key={claim.id}
                      className="border-b border-line last:border-0 transition-colors hover:bg-overlay"
                    >
                      <td className="px-4 py-4">
                        <div className="max-w-[14rem] truncate text-sm font-medium text-ink">
                          {claim.studentLabel}
                        </div>
                        {claim.metadata?.note && (
                          <div className="max-w-[14rem] truncate text-xs text-ink-faint">
                            {claim.metadata.note}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-ink-soft">{claim.materialTitle}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="block max-w-[16rem] truncate font-mono text-xs text-ink-muted"
                          title={claim.metadata?.reference || ''}
                        >
                          {claim.metadata?.reference || '—'}
                        </span>
                        <Badge variant="neutral" size="sm">
                          ₦{claim.metadata?.amount ?? 1500}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-xs tabular-nums text-ink-muted">
                        {new Date(claim.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprove(claim)}
                          disabled={approvingId === claim.id}
                          leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        >
                          {approvingId === claim.id ? 'Granting…' : 'Grant access'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-ink-faint">
          Granting access writes an <span className="font-mono">entitlements</span> row for the
          buyer and an approval entry against the claim, so it leaves this queue. Verify the
          transfer in your OPay app first — nothing here checks it for you.
        </p>

        {/* Manual activation by email — for buyers who messaged a receipt instead
            of using the app queue. */}
        <form
          onSubmit={handleGrantByEmail}
          className="space-y-4 rounded-lg border border-line-strong bg-surface p-5"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-gold" />
            <h2 className="text-sm font-semibold text-ink">Activate book access by email</h2>
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Creates an active entitlement for the account, even if they never filed a claim.
          </p>
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              type="email"
              required
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="student@example.com"
              className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint transition-colors focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25"
            />
            <select
              value={grantMaterialId}
              onChange={(e) => setGrantMaterialId(e.target.value)}
              className="rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25"
            >
              {materials.length === 0 && <option value="">No published books</option>}
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              variant="primary"
              isLoading={granting}
              leftIcon={<Unlock className="h-4 w-4" />}
            >
              Activate access
            </Button>
          </div>
          {grantMessage && <p className="text-sm font-medium text-success">{grantMessage}</p>}
        </form>

        {/* Per-user entitlement control — the same switch the student sees as
            the reader opening or the banner staying up. */}
        <section className="overflow-hidden rounded-lg border border-line-strong bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-strong bg-surface-deep px-4 py-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-gold" />
              <h2 className="text-sm font-semibold text-ink">Book access control</h2>
            </div>
            <span className="text-xs text-ink-faint">{grants.length} entitlement records</span>
          </div>

          {grants.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="mx-auto mb-2 h-6 w-6 text-ink-faint" />
              <p className="text-sm text-ink-muted">No book entitlements yet.</p>
              <p className="mt-1 text-xs text-ink-faint">
                Activate one by email above, or grant from a claim in the queue.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line-strong bg-surface-deep">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Student
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Book
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Access
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Granted
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map((grant) => {
                    const isActive = grant.status === 'active';
                    return (
                      <tr
                        key={grant.id}
                        className="border-b border-line last:border-0 transition-colors hover:bg-overlay"
                      >
                        <td className="max-w-[14rem] truncate px-4 py-4 text-sm font-medium text-ink">
                          {grant.studentLabel}
                        </td>
                        <td className="max-w-[16rem] truncate px-4 py-4 text-sm text-ink-soft">
                          {grant.materialTitle}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant={isActive ? 'green' : 'danger'} size="sm">
                            {isActive ? 'Active' : grant.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-xs tabular-nums text-ink-muted">
                          {grant.granted_at ? new Date(grant.granted_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Button
                            variant={isActive ? 'danger' : 'primary'}
                            size="sm"
                            onClick={() => handleToggleAccess(grant)}
                            disabled={togglingKey === grant.id}
                            leftIcon={
                              isActive ? (
                                <Lock className="h-3.5 w-3.5" />
                              ) : (
                                <Unlock className="h-3.5 w-3.5" />
                              )
                            }
                          >
                            {togglingKey === grant.id
                              ? 'Working…'
                              : isActive
                                ? 'Deactivate'
                                : 'Activate'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
};
