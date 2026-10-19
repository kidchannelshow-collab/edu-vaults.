import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { AdminForbidden } from './AdminForbidden';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  BookOpen,
  CreditCard,
  Key,
  FileText,
  Receipt,
  Settings,
  LogOut,
  ArrowLeft,
  Loader2,
  Menu,
  X,
} from 'lucide-react';

interface AdminLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

const ADMIN_NAV = [
  { label: 'Overview',  path: '/admin',           icon: LayoutDashboard },
  { label: 'Materials', path: '/admin/materials', icon: BookOpen },
  { label: 'Secure Reader', path: '/admin/reader', icon: ShieldCheck },
  { label: 'Fulfilment', path: '/admin/fulfilment', icon: Receipt },
  { label: 'Payments',  path: '/admin/payments',  icon: CreditCard },
  { label: 'Users',     path: '/admin/users',     icon: Users },
  { label: 'Access & Devices', path: '/admin/access-devices', icon: Key },
  { label: 'Audit Logs',path: '/admin/logs',      icon: FileText },
  { label: 'Settings',  path: '/admin/settings',  icon: Settings },
];

/**
 * Admin console shell: a permanently fixed left sidebar with the content
 * area scrolling independently on the right. On small screens the sidebar
 * becomes a slide-over so the content keeps the full width.
 */
export const AdminLayout: React.FC<AdminLayoutProps> = ({ currentPath, onNavigate, children }) => {
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
        <p className="text-sm text-ink-muted">Verifying administrator credentials...</p>
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin' && profile?.status === 'active';

  if (!user || !isAdmin) {
    return <AdminForbidden onNavigate={onNavigate} />;
  }

  const handleNavigate = (path: string) => {
    setMobileNavOpen(false);
    onNavigate(path);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line-strong px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gold text-on-gold">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink">Admin Console</div>
          <div className="text-[11px] text-ink-muted">EduVault</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          Management
        </p>
        <ul className="space-y-0.5">
          {ADMIN_NAV.map((item) => {
            const isActive = currentPath === item.path;
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <button
                  onClick={() => handleNavigate(item.path)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gold/10 text-gold'
                      : 'text-ink-soft hover:bg-overlay-strong hover:text-ink'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-gold' : 'text-ink-faint'}`} />
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="shrink-0 space-y-0.5 border-t border-line-strong p-3">
        <button
          onClick={() => handleNavigate('/dashboard')}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-overlay-strong hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4 text-ink-faint" />
          <span>Exit to App</span>
        </button>
        <button
          onClick={async () => {
            await signOut();
            onNavigate('/login');
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Fixed desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line-strong bg-surface lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile slide-over */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-surface-deep/50"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 w-64 border-r border-line-strong bg-surface">
            <button
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 rounded-md p-1 text-ink-faint hover:bg-overlay-strong hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="lg:pl-64">
        {/* Mobile top bar — only visible below lg, where the sidebar collapses */}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line-strong bg-surface px-4 lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-2 text-ink-soft hover:bg-overlay-strong"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-ink">Admin Console</span>
        </div>

        <main className="mx-auto max-w-7xl p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
