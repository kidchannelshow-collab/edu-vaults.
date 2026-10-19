import React, { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import {
  FileText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Terminal
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { AccessLogRecord } from '../../lib/adminService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { LiveIndicator } from '../../components/ui/LiveIndicator';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const AdminLogs: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const [logs, setLogs] = useState<AccessLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [totalCount, setTotalCount] = useState(0);

  const loadLogs = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('access_logs')
        .select('*', { count: 'exact' });

      if (eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error: fetchErr } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (fetchErr) {
        setError(fetchErr.message);
      } else {
        const enriched: AccessLogRecord[] = [];
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

        // Apply search on enriched logs
        let filtered = enriched;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          filtered = enriched.filter((l) => {
            const eType = l.event_type.toLowerCase();
            const userName = l.profiles?.full_name?.toLowerCase() || '';
            const userEmail = l.profiles?.email?.toLowerCase() || '';
            const matTitle = l.materials?.title?.toLowerCase() || '';
            return eType.includes(q) || userName.includes(q) || userEmail.includes(q) || matTitle.includes(q);
          });
        }

        setLogs(filtered);
        setTotalCount(count || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load access logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, eventTypeFilter, searchQuery]);

  // Live updates. The previous subscription closed over the first render's
  // `loadLogs`, so any incoming event would reload page 1 with stale filters.
  // The hook keeps the callback fresh, so a refresh preserves the current view.
  const realtimeStatus = useRealtimeRefresh(['access_logs'], () => loadLogs(false));

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-strong pb-5 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold" /> Security Audit Logs
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Review immutable system events, access attempts, and administrative actions from `public.access_logs`.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiveIndicator status={realtimeStatus} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadLogs()}
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
              placeholder="Search by event type, user, or material..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border border-line-strong bg-surface-deep pl-10 pr-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-medium text-ink-muted">Event Type:</span>
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
            >
              <option value="all">All Event Types</option>
              <option value="login">Login</option>
              <option value="read_material">Read Material</option>
              <option value="access_denied">Access Denied</option>
              <option value="profile_update">Profile Update</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div className="rounded-lg border border-line-strong bg-surface overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-ink-muted">Loading audit logs from Supabase...</div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Terminal className="w-10 h-10 text-ink-faint mx-auto" />
              <p className="text-sm text-ink-muted">No recent activity logs found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-deep border-b border-line-strong">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Event Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Material</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Metadata Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-0 hover:bg-overlay transition-colors">
                      <td className="px-4 py-3 text-ink-muted tabular-nums">
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md bg-overlay text-ink-soft border border-line-strong text-xs font-medium">
                          {l.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {l.profiles?.full_name || l.profiles?.email || l.user_id.substring(0, 8) + '...'}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {l.materials?.title || (l.material_id ? l.material_id.substring(0, 8) + '...' : 'N/A')}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted truncate max-w-xs">
                        {l.metadata ? JSON.stringify(l.metadata) : 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 bg-surface-deep border-t border-line-strong flex items-center justify-between text-sm text-ink-muted">
            <span>Showing page {page} of {totalPages} ({totalCount} total logs)</span>
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
    </AdminLayout>
  );
};
