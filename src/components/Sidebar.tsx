import React from 'react';
import { LayoutDashboard, BookOpen, Settings, ShieldCheck, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';

export interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  isOpen,
  onClose,
}) => {
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const isAdmin = profile?.role === 'admin';

  // "Material" is one destination now — the landing and the reader are the same
  // route, so there is no separate "Secure Reader" entry.
  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Material', path: '/material', icon: BookOpen },
    { label: 'Account Settings', path: '/settings', icon: Settings },
    { label: 'Help & Support', path: '/help', icon: HelpCircle },
  ];

  const legalItems = [
    { label: 'Terms of Service', path: '/terms' },
    { label: 'Privacy Policy', path: '/privacy' },
    { label: 'Refund Policy', path: '/refund-policy' },
    { label: 'Content Disclaimer', path: '/content-disclaimer' },
    { label: 'Fair Use', path: '/fair-use' },
    { label: 'Cookie Policy', path: '/cookie-policy' },
  ];

  const go = (path: string) => {
    onNavigate(path);
    onClose();
  };

  // Active item is marked with the gold brand accent.
  const itemClass = (isActive: boolean) =>
    `flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
      isActive
        ? 'bg-gold/10 text-gold'
        : 'text-ink-muted hover:bg-overlay hover:text-ink'
    }`;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-surface-deep/80 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-line-strong bg-surface transition-transform duration-200 ease-in-out lg:static lg:inset-auto lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Main Menu
            </p>
            {navItems.map((item) => {
              const isActive = currentPath === item.path;
              const Icon = item.icon;
              return (
                <button key={item.path} onClick={() => go(item.path)} className={itemClass(isActive)}>
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-gold' : 'text-ink-faint'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {isAdmin && (
              <div className="mt-4 border-t border-line-strong pt-4">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                  Administration
                </p>
                <button
                  onClick={() => go('/admin')}
                  className={itemClass(currentPath.startsWith('/admin'))}
                >
                  <ShieldCheck
                    className={`h-4 w-4 shrink-0 ${
                      currentPath.startsWith('/admin') ? 'text-gold' : 'text-ink-faint'
                    }`}
                  />
                  <span>Admin Console</span>
                </button>
              </div>
            )}

            {/* Legal policies, reachable from inside the authenticated app —
                not only from the public marketing footer. */}
            <div className="mt-4 border-t border-line-strong pt-4">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Legal
              </p>
              {legalItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  className="flex w-full items-center rounded-md px-3 py-1.5 text-xs text-ink-muted transition-colors duration-200 hover:bg-overlay hover:text-ink"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="border-t border-line-strong p-3">
            <button
              onClick={async () => {
                await signOut();
                onNavigate('/login');
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-danger transition-colors duration-200 hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
