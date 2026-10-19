import React, { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import {
  Users,
  Search,
  Filter,
  Shield,
  UserCheck,
  UserX,
  AlertTriangle,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  Lock,
  X
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { supabase } from '../../lib/supabase';
import { updateUserStatus } from '../../lib/adminService';
import { useAuth } from '../../context/AuthContext';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export interface ProfileRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
}

export const AdminUsers: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);

  // Selected User for Detail Modal
  const [selectedUser, setSelectedUser] = useState<ProfileRecord | null>(null);
  const [userStats, setUserStats] = useState<{ entitlements: number; progress: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Confirmation Modal for Suspend/Reactivate
  const [confirmUser, setConfirmUser] = useState<ProfileRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' });

      if (searchQuery.trim()) {
        query = query.or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      }
      if (roleFilter !== 'all') {
        query = query.eq('role', roleFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error: fetchErr } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (fetchErr) {
        // Fallback if role/status columns don't exist yet
        const basicQuery = supabase.from('profiles').select('*', { count: 'exact' });
        const { data: bData, count: bCount } = await basicQuery.range(from, to);
        if (bData) {
          const fallbackUsers = bData.map((u: any) => ({
            ...u,
            role: u.role || 'user',
            status: u.status || 'active',
          }));
          setUsers(fallbackUsers);
          setTotalCount(bCount || 0);
        } else {
          setError(fetchErr.message);
        }
      } else {
        setUsers((data || []).map((u: any) => ({
          ...u,
          role: u.role || 'user',
          status: u.status || 'active',
        })));
        setTotalCount(count || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [page, roleFilter, statusFilter, searchQuery]);

  // Realtime subscription for profiles
  useEffect(() => {
    const channel = supabase
      .channel('admin-users-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          loadUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load user details & stats when selected
  const handleOpenDetails = async (profile: ProfileRecord) => {
    setSelectedUser(profile);
    setStatsLoading(true);
    try {
      const [entRes, progRes] = await Promise.all([
        supabase.from('entitlements').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('reading_progress').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
      ]);
      setUserStats({
        entitlements: entRes.count || 0,
        progress: progRes.count || 0,
      });
    } catch {
      setUserStats({ entitlements: 0, progress: 0 });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleStatusChangeAction = async () => {
    if (!confirmUser) return;

    // Prevent self-suspension
    if (currentUser && confirmUser.id === currentUser.id && confirmUser.status === 'active') {
      setActionError('You cannot suspend your own administrator account.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    const newStatus = confirmUser.status === 'active' ? 'suspended' : 'active';
    const { success, error: updateErr } = await updateUserStatus(confirmUser.id, newStatus);

    if (!success) {
      setActionError(updateErr?.message || 'Failed to update user status.');
    } else {
      setConfirmUser(null);
      loadUsers();
    }
    setActionLoading(false);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-strong pb-5 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" /> User & Role Management
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Manage real Supabase user profiles, account status (`active` / `suspended`), and roles (`user` / `admin`).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadUsers}
            leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex items-center gap-3 text-danger text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Filters & Search Toolbar */}
        <div className="rounded-lg border border-line-strong bg-surface p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input
              type="text"
              placeholder="Search by full name or email..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border border-line-strong bg-surface-deep pl-10 pr-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink-muted">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              >
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
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
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </div>

        {/* Users Table / List */}
        <div className="rounded-lg border border-line-strong bg-surface overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-ink-muted">Loading user records from Supabase...</div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Users className="w-10 h-10 text-ink-faint mx-auto" />
              <p className="text-sm text-ink-muted">No users found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-deep border-b border-line-strong">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Full Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Created</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isAdmin = u.role === 'admin';
                    const isSuspended = u.status === 'suspended';
                    return (
                      <tr key={u.id} className="border-b border-line last:border-0 hover:bg-overlay transition-colors">
                        <td className="px-4 py-4 font-medium text-ink">
                          {/* flex lives on a wrapper, not the <td> — display:flex on a cell
                              takes it out of the table layout algorithm and breaks column
                              alignment with the header row. */}
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-overlay flex items-center justify-center text-ink-soft font-semibold text-xs uppercase">
                              {(u.full_name || u.email || 'U')[0]}
                            </div>
                            <span className="truncate max-w-[160px]">{u.full_name || 'Unnamed Student'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-ink-muted">{u.email || 'No email provided'}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${
                            isAdmin
                              ? 'bg-info/10 text-info border-info/30'
                              : 'bg-overlay text-ink-soft border-line-strong'
                          }`}>
                            {isAdmin && <Shield className="w-3 h-3" />}
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${
                            isSuspended
                              ? 'bg-danger/10 text-danger border-danger/30'
                              : 'bg-success/10 text-success border-success/30'
                          }`}>
                            {isSuspended ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-ink-muted tabular-nums">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 text-right space-x-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenDetails(u)}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            title="View User Details"
                          >
                            Details
                          </Button>
                          <Button
                            variant={isSuspended ? 'primary' : 'danger'}
                            size="sm"
                            onClick={() => setConfirmUser(u)}
                          >
                            {isSuspended ? 'Reactivate' : 'Suspend'}
                          </Button>
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
            <span>Showing page {page} of {totalPages} ({totalCount} total users)</span>
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

      {/* User Details Modal */}
      {selectedUser && (
        <Modal
          isOpen={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          title="User Profile & Access Summary"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedUser(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-6 py-2 text-sm text-ink-soft">
            <div className="rounded-lg border border-line-strong bg-surface-deep p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Profile Information</span>
                <span className={`px-2 py-0.5 rounded-md border text-xs font-medium ${
                  selectedUser.role === 'admin' ? 'bg-info/10 text-info border-info/30' : 'bg-overlay text-ink-soft border-line-strong'
                }`}>
                  {selectedUser.role}
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <p><strong className="text-ink-muted">Full Name:</strong> {selectedUser.full_name || 'N/A'}</p>
                <p><strong className="text-ink-muted">Email:</strong> {selectedUser.email || 'N/A'}</p>
                <p><strong className="text-ink-muted">Account Status:</strong> <span className={selectedUser.status === 'suspended' ? 'text-danger font-semibold' : 'text-success font-semibold'}>{selectedUser.status}</span></p>
                <p><strong className="text-ink-muted">Created At:</strong> {new Date(selectedUser.created_at).toLocaleString()}</p>
                <p><strong className="text-ink-muted">Last Updated:</strong> {new Date(selectedUser.updated_at).toLocaleString()}</p>
              </div>
            </div>

            <div className="rounded-lg border border-line-strong bg-surface-deep p-4 space-y-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted block">Access & Activity Summary</span>
              {statsLoading ? (
                <div className="text-sm text-ink-muted py-2">Loading access statistics...</div>
              ) : (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-md border border-line-strong bg-overlay p-3">
                    <span className="text-ink-muted block text-[11px] font-semibold uppercase tracking-wider">Active Entitlements</span>
                    <span className="text-lg font-semibold text-ink tabular-nums">{userStats?.entitlements ?? 0}</span>
                  </div>
                  <div className="rounded-md border border-line-strong bg-overlay p-3">
                    <span className="text-ink-muted block text-[11px] font-semibold uppercase tracking-wider">Reading Progress Records</span>
                    <span className="text-lg font-semibold text-ink tabular-nums">{userStats?.progress ?? 0}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info flex items-start gap-2">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-info" />
              <span>Authentication passwords, secrets, and sensitive auth credentials are securely managed by Supabase Auth and never exposed to the frontend.</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for Suspend/Reactivate */}
      {confirmUser && (
        <Modal
          isOpen={!!confirmUser}
          onClose={() => {
            setConfirmUser(null);
            setActionError(null);
          }}
          title={confirmUser.status === 'active' ? 'Suspend Account?' : 'Reactivate Account?'}
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmUser(null);
                  setActionError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={confirmUser.status === 'active' ? 'danger' : 'primary'}
                size="sm"
                onClick={handleStatusChangeAction}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : confirmUser.status === 'active' ? 'Confirm Suspension' : 'Confirm Reactivation'}
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
              Are you sure you want to {confirmUser.status === 'active' ? 'suspend' : 'reactivate'} the account for <strong className="text-ink">{confirmUser.full_name || confirmUser.email}</strong>?
            </p>
            {confirmUser.status === 'active' && (
              <p className="text-ink-muted">
                Suspending this account will prevent the user from accessing protected application functionality and reading streams.
              </p>
            )}
          </div>
        </Modal>
      )}

    </AdminLayout>
  );
};
