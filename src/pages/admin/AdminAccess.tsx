import React, { useState, useEffect } from 'react';
import {
  Key,
  Search,
  ShieldCheck,
  Clock,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { EntitlementRecord } from '../../lib/adminService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { LiveIndicator } from '../../components/ui/LiveIndicator';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const AdminAccess: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const [entitlements, setEntitlements] = useState<EntitlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);

  const loadEntitlements = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('entitlements')
        .select('*', { count: 'exact' });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error: fetchErr } = await query
        .order('granted_at', { ascending: false })
        .range(from, to);

      if (fetchErr) {
        setError(fetchErr.message);
      } else {
        // Enrich with profiles and materials
        const enriched: EntitlementRecord[] = [];
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
            enriched.push({
              ...item,
              profiles: profile,
              materials: material,
            });
          }
        }

        // Apply search filter on enriched data if searchQuery is provided
        let filtered = enriched;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          filtered = enriched.filter((e) => {
            const userName = e.profiles?.full_name?.toLowerCase() || '';
            const userEmail = e.profiles?.email?.toLowerCase() || '';
            const matTitle = e.materials?.title?.toLowerCase() || '';
            return userName.includes(q) || userEmail.includes(q) || matTitle.includes(q);
          });
        }

        setEntitlements(filtered);
        setTotalCount(count || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load entitlements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntitlements();
  }, [page, statusFilter, searchQuery]);

  // Live entitlement + reader-session state. Watching device_sessions as well
  // means an active reader stream appears and clears without a manual reload.
  const realtimeStatus = useRealtimeRefresh(
    ['entitlements', 'device_sessions'],
    () => loadEntitlements(false)
  );

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-strong pb-5 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
              <Key className="w-5 h-5 text-gold" /> Access & Entitlements Control
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Manage course enrollment entitlements and cryptographic reader stream permissions from `public.entitlements`.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiveIndicator status={realtimeStatus} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadEntitlements()}
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
              placeholder="Search by user name, email, or material title..."
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
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        </div>

        {/* Entitlements Table */}
        <div className="rounded-lg border border-line-strong bg-surface overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-ink-muted">Loading entitlements from Supabase...</div>
          ) : entitlements.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Key className="w-10 h-10 text-ink-faint mx-auto" />
              <p className="text-sm text-ink-muted">No entitlement records found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-deep border-b border-line-strong">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Material Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Granted Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Expiration Date</th>
                  </tr>
                </thead>
                <tbody>
                  {entitlements.map((e) => {
                    const isActive = e.status === 'active';
                    return (
                      <tr key={e.id} className="border-b border-line last:border-0 hover:bg-overlay transition-colors">
                        <td className="px-4 py-4">
                          <div className="font-medium text-ink">{e.profiles?.full_name || 'Unnamed Student'}</div>
                          <div className="text-xs text-ink-muted">{e.profiles?.email || e.user_id.substring(0, 8) + '...'}</div>
                        </td>
                        <td className="px-4 py-4 font-medium text-ink-soft">
                          {e.materials?.title || e.material_id.substring(0, 8) + '...'}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${
                            isActive
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-danger/10 text-danger border-danger/30'
                          }`}>
                            {isActive ? <ShieldCheck className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-ink-muted tabular-nums">
                          {new Date(e.granted_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-ink-muted tabular-nums">
                          {e.expires_at ? new Date(e.expires_at).toLocaleString() : 'Never (Permanent)'}
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
            <span>Showing page {page} of {totalPages} ({totalCount} total entitlements)</span>
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
    </>
  );
};
