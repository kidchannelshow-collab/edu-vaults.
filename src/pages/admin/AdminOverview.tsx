import React, { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import {
  ShieldCheck,
  Users,
  BookOpen,
  Key,
  Activity,
  AlertCircle,
  RefreshCw,
  Smartphone,
  UserCheck,
  UserX,
  FileText,
  CreditCard
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { fetchAdminStats, fetchRecentLogs, AdminStats, AccessLogRecord } from '../../lib/adminService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { LiveIndicator } from '../../components/ui/LiveIndicator';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const AdminOverview: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AccessLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `showSpinner` is false for background refreshes, so an incoming event
  // updates the numbers in place instead of blanking the page to a skeleton.
  const loadAdminData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    const [statsRes, logsRes] = await Promise.all([
      fetchAdminStats(),
      fetchRecentLogs(8),
    ]);

    if (statsRes.error && logsRes.error) {
      setError('Unable to fetch admin statistics and activity logs from Supabase.');
    } else {
      setStats(statsRes.stats);
      setRecentLogs(logsRes.logs);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Live updates. The previous subscription filtered on `schema: 'public'` with
  // no table, which Postgres Changes cannot deliver events for — it never fired.
  const realtimeStatus = useRealtimeRefresh(
    ['access_logs', 'profiles', 'device_sessions', 'entitlements', 'payments'],
    () => loadAdminData(false)
  );

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-strong pb-5 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Admin Control Center</h1>
            <p className="text-sm text-ink-muted mt-1">
              Secure enterprise management portal for EduVault database, entitlements, payments, and security audits.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <LiveIndicator status={realtimeStatus} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAdminData()}
              leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            >
              Refresh Data
            </Button>
            <div className="hidden sm:flex items-center gap-2 rounded-md bg-success/10 border border-success/30 text-success px-3 py-1.5 text-xs font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>RLS Enforced</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex items-center gap-3 text-danger text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats Grid */}
        {loading && !stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="glass rounded-lg p-5 space-y-3 animate-pulse">
                <div className="h-4 bg-overlay rounded w-1/2"></div>
                <div className="h-8 bg-overlay rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Total Revenue</span>
                <CreditCard className="w-4 h-4 text-gold" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">₦{(stats?.totalRevenue ?? 0).toLocaleString()}</h3>
              <p className="text-[11px] text-ink-muted">{stats?.successfulPayments ?? 0} successful payments</p>
            </div>

            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Total Users</span>
                <Users className="w-4 h-4 text-gold" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">{stats?.totalUsers ?? 0}</h3>
              <p className="text-[11px] text-ink-muted">{stats?.activeUsers ?? 0} active operational</p>
            </div>

            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Published Materials</span>
                <BookOpen className="w-4 h-4 text-gold" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">{stats?.publishedMaterials ?? 0}</h3>
              <p className="text-[11px] text-ink-muted">Out of {stats?.totalMaterials ?? 0} total materials</p>
            </div>

            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Active Entitlements</span>
                <Key className="w-4 h-4 text-gold" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">{stats?.activeEntitlements ?? 0}</h3>
              <p className="text-[11px] text-ink-muted">Readers who own the book</p>
            </div>

            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Active Streams</span>
                <Smartphone className="w-4 h-4 text-gold" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">{stats?.activeDeviceSessions ?? 0}</h3>
              <p className="text-[11px] text-ink-muted">Live readers — heartbeat in last 15 min</p>
            </div>

            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Pending Payments</span>
                <CreditCard className="w-4 h-4 text-gold" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">{stats?.pendingPayments ?? 0}</h3>
              <p className="text-[11px] text-ink-muted">Awaiting Flutterwave webhook</p>
            </div>

            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Suspended Accounts</span>
                <UserX className="w-4 h-4 text-danger" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">{stats?.suspendedUsers ?? 0}</h3>
              <p className="text-[11px] text-ink-muted">Restricted security profiles</p>
            </div>

            <div className="glass rounded-lg p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">Database Status</span>
                <Activity className="w-4 h-4 text-gold" />
              </div>
              <h3 className="text-2xl font-semibold text-ink tabular-nums">Online</h3>
              <p className="text-[11px] text-ink-muted">Connected to Supabase PostgreSQL</p>
            </div>
          </div>
        )}

        {/* Recent Activity Section */}
        <div className="rounded-lg border border-line-strong bg-surface p-6 space-y-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line-strong pb-4">
            <h3 className="text-base font-semibold text-ink flex items-center gap-2">
              <FileText className="w-5 h-5 text-ink-faint" /> Recent Security &amp; Access Activity
              <LiveIndicator status={realtimeStatus} />
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('/admin/logs')}
            >
              View All Logs
            </Button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-ink-muted">Loading activity logs...</div>
          ) : recentLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-muted">No recent activity.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-deep border-b border-line-strong">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Event Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Material</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log) => (
                    <tr key={log.id} className="border-b border-line last:border-0 hover:bg-overlay transition-colors">
                      <td className="px-4 py-3 text-ink-muted tabular-nums">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md bg-overlay text-ink-soft text-xs font-medium border border-line-strong">
                          {log.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {log.profiles?.full_name || log.profiles?.email || log.user_id?.substring(0, 8) + '...'}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {log.materials?.title || log.material_id?.substring(0, 8) || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
};
