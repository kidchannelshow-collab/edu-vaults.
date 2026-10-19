import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
  XCircle,
  Monitor,
  Search
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { revokeDeviceSession, DeviceSessionRecord } from '../../lib/adminService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { LiveIndicator } from '../../components/ui/LiveIndicator';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const AdminDevices: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const [sessions, setSessions] = useState<DeviceSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);

  // Revoke confirmation modal
  const [confirmSession, setConfirmSession] = useState<DeviceSessionRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadSessions = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('device_sessions')
        .select('*', { count: 'exact' });

      if (statusFilter === 'active') {
        query = query.is('revoked_at', null);
      } else if (statusFilter === 'revoked') {
        query = query.not('revoked_at', 'is', null);
      }

      const { data, count, error: fetchErr } = await query
        .order('last_seen_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (fetchErr) {
        setError(fetchErr.message);
      } else {
        const enriched: DeviceSessionRecord[] = [];
        if (data) {
          for (const item of data) {
            let profile = null;
            if (item.user_id) {
              const { data: pData } = await supabase.from('profiles').select('full_name, email').eq('id', item.user_id).maybeSingle();
              profile = pData;
            }

            // Apply search filter if query is provided
            if (searchQuery.trim() && profile) {
              const q = searchQuery.toLowerCase();
              const matchEmail = profile.email?.toLowerCase().includes(q);
              const matchName = profile.full_name?.toLowerCase().includes(q);
              if (!matchEmail && !matchName) {
                continue;
              }
            } else if (searchQuery.trim() && !profile) {
              continue;
            }

            enriched.push({
              ...item,
              profiles: profile,
            });
          }
        }
        setSessions(enriched);
        setTotalCount(count || enriched.length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load device sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [page, statusFilter, searchQuery]);

  // Live device sessions. Previously this closed over the first render's
  // loader, so an incoming change reset pagination and filters.
  const realtimeStatus = useRealtimeRefresh(['device_sessions'], () => loadSessions(false));

  const handleRevokeSession = async () => {
    if (!confirmSession) return;
    setActionLoading(true);
    setActionError(null);

    const { success, error: revErr } = await revokeDeviceSession(confirmSession.id);
    if (!success) {
      setActionError(revErr?.message || 'Failed to revoke device session.');
    } else {
      setConfirmSession(null);
      loadSessions();
    }
    setActionLoading(false);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-strong pb-5 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-gold" /> Device & Session Management
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Monitor active student reader streams and device sessions from `public.device_sessions`.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiveIndicator status={realtimeStatus} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSessions()}
              leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex items-center gap-3 text-danger text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search & Filters */}
        <div className="rounded-lg border border-line-strong bg-surface p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input
              type="text"
              placeholder="Search by user email or name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border border-line-strong bg-surface-deep pl-10 pr-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-medium text-ink-muted">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
            >
              <option value="all">All Sessions</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        </div>

        {/* Sessions Table */}
        <div className="rounded-lg border border-line-strong bg-surface overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-ink-muted">Loading device sessions from Supabase...</div>
          ) : sessions.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Monitor className="w-10 h-10 text-ink-faint mx-auto" />
              <p className="text-sm text-ink-muted">No device sessions found matching your filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-deep border-b border-line-strong">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Device Identifier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Session Created</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Last Seen</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const isRevoked = s.revoked_at !== null && s.revoked_at !== undefined;
                    const deviceDisplay = s.device_identifier ? `Device ending in ${s.device_identifier.slice(-4)}` : 'Unknown Device';
                    return (
                      <tr key={s.id} className="border-b border-line last:border-0 hover:bg-overlay transition-colors">
                        <td className="px-4 py-4">
                          <div className="font-medium text-ink">{s.profiles?.full_name || 'Unnamed Student'}</div>
                          <div className="text-xs text-ink-muted">{s.profiles?.email || s.user_id.substring(0, 8) + '...'}</div>
                        </td>
                        <td className="px-4 py-4 text-xs text-ink-muted tabular-nums">
                          {deviceDisplay}
                        </td>
                        <td className="px-4 py-4 text-ink-muted tabular-nums">
                          {s.created_at ? new Date(s.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-4 py-4 text-ink-muted tabular-nums">
                          {s.last_seen_at || s.last_seen ? new Date(s.last_seen_at || s.last_seen).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${
                            !isRevoked
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-danger/10 text-danger border-danger/30'
                          }`}>
                            {!isRevoked ? <ShieldCheck className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {!isRevoked ? 'Active' : 'Revoked'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {!isRevoked ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setConfirmSession(s)}
                            >
                              Revoke Session
                            </Button>
                          ) : (
                            <span className="text-xs text-ink-faint">Revoked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 bg-surface-deep border-t border-line-strong flex items-center justify-between text-sm text-ink-muted">
            <span>Showing page {page} of {totalPages} ({totalCount} total sessions)</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

      </div>

      {/* Confirmation Modal for Revoking Session */}
      {confirmSession && (
        <Modal
          isOpen={!!confirmSession}
          onClose={() => {
            setConfirmSession(null);
            setActionError(null);
          }}
          title="Revoke Device Session?"
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmSession(null);
                  setActionError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRevokeSession}
                disabled={actionLoading}
              >
                {actionLoading ? 'Revoking...' : 'Confirm Revocation'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-sm text-ink-soft">
            {actionError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
            <p>
              Are you sure you want to revoke this secure reader session? The user will be required to re-authenticate to continue reading.
            </p>
          </div>
        </Modal>
      )}

    </>
  );
};
