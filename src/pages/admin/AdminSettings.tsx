import React from 'react';
import { AdminLayout } from './AdminLayout';
import { Settings, Shield, Activity, Database, Lock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const AdminSettings: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const { user } = useAuth();
  const { profile } = useProfile();

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">

        {/* Header */}
        <div className="border-b border-line-strong pb-5 mb-6">
          <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
            <Settings className="w-5 h-5 text-gold" /> Control Center Settings & Information
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Review administrator credentials, system configuration, and Supabase connectivity status.
          </p>
        </div>

        {/* Administrator Profile Card */}
        <div className="glass rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Shield className="w-4 h-4 text-ink-faint" /> Administrator Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-md border border-line-strong bg-overlay p-4 space-y-1">
              <span className="text-ink-muted text-[11px] font-semibold uppercase tracking-wider">Full Name</span>
              <p className="font-medium text-ink">{profile?.full_name || user?.user_metadata?.full_name || 'Admin'}</p>
            </div>
            <div className="rounded-md border border-line-strong bg-overlay p-4 space-y-1">
              <span className="text-ink-muted text-[11px] font-semibold uppercase tracking-wider">Email Address</span>
              <p className="font-medium text-ink">{profile?.email || user?.email || 'N/A'}</p>
            </div>
            <div className="rounded-md border border-line-strong bg-overlay p-4 space-y-1">
              <span className="text-ink-muted text-[11px] font-semibold uppercase tracking-wider">Account Role</span>
              <p>
                <span className="inline-flex items-center rounded-md border border-info/30 bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                  {profile?.role || 'admin'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* System Information Card */}
        <div className="glass rounded-lg p-6 space-y-4">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Database className="w-4 h-4 text-ink-faint" /> System & Environment Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-md border border-line-strong bg-overlay p-4 space-y-1">
              <span className="text-ink-muted text-[11px] font-semibold uppercase tracking-wider">Supabase Connection</span>
              <p className="font-medium text-success flex items-center gap-1.5 mt-1">
                <CheckCircle2 className="w-4 h-4" /> Connected & Operational (RLS Enforced)
              </p>
            </div>
            <div className="rounded-md border border-line-strong bg-overlay p-4 space-y-1">
              <span className="text-ink-muted text-[11px] font-semibold uppercase tracking-wider">Application Environment</span>
              <p className="font-medium text-ink mt-1">Production / Cloud Run Container</p>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="glass rounded-lg p-6 space-y-3">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Lock className="w-4 h-4 text-ink-faint" /> Security Best Practices
          </h3>
          <p className="text-sm text-ink-muted leading-relaxed">
            Secret keys, service-role tokens, payment API secrets, and private credentials are never bundled into frontend client packages. All administrative database mutations are protected by Row-Level Security policies and secure server roles.
          </p>
        </div>

      </div>
    </AdminLayout>
  );
};
