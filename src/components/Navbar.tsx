import React, { useState } from 'react';
import { BookOpen, Menu, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Dropdown } from './ui/Dropdown';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';

export interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isDashboard?: boolean;
  onToggleSidebar?: () => void;
}

/** Two-letter initials for the avatar fallback (no stock photos). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  onNavigate,
  isDashboard = false,
  onToggleSidebar,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { profile } = useProfile();

  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';

  const handleNav = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  const scrollToSection = (id: string) => {
    if (currentPath !== '/') {
      onNavigate('/');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  // Active nav uses the gold brand marker.
  const navLinkClass = (isActive: boolean) =>
    `text-sm font-medium transition-colors duration-200 ${
      isActive ? 'text-gold' : 'text-ink-muted hover:text-ink'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line-strong bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          {isDashboard && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              aria-label="Toggle navigation"
              className="rounded-md p-2 text-ink-muted transition-colors duration-200 hover:bg-overlay hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <div
            onClick={() => handleNav(isDashboard ? '/dashboard' : '/')}
            className="flex cursor-pointer items-center gap-2.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold text-on-gold">
              <BookOpen className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-ink">EduVault</span>
          </div>
        </div>

        {!isDashboard && (
          <nav className="hidden items-center gap-8 md:flex">
            <button onClick={() => handleNav('/')} className={navLinkClass(currentPath === '/')}>
              Home
            </button>
            <button
              onClick={() => handleNav('/material')}
              className={navLinkClass(currentPath.startsWith('/material') || currentPath.startsWith('/reader') || currentPath.startsWith('/materials'))}
            >
              Material
            </button>
            <button onClick={() => scrollToSection('how-it-works')} className={navLinkClass(false)}>
              How It Works
            </button>
            <button onClick={() => scrollToSection('faq')} className={navLinkClass(false)}>
              FAQ
            </button>
          </nav>
        )}

        <div className="flex items-center gap-3">
          {isDashboard ? (
            <Dropdown
              align="right"
              trigger={
                <div className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 transition-colors duration-200 hover:bg-overlay">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-overlay text-xs font-semibold text-ink-soft">
                    {initialsOf(displayName)}
                  </div>
                  <span className="hidden text-sm font-medium text-ink-soft sm:inline">
                    {displayName}
                  </span>
                </div>
              }
              items={[
                { label: 'Dashboard', value: 'dashboard', onClick: () => handleNav('/dashboard') },
                { label: 'Settings', value: 'settings', onClick: () => handleNav('/settings') },
                {
                  label: 'Sign out',
                  value: 'logout',
                  onClick: async () => {
                    await signOut();
                    handleNav('/login');
                  },
                },
              ]}
            />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="ghost" size="sm" onClick={() => handleNav('/login')}>
                Log in
              </Button>
              <Button variant="primary" size="sm" onClick={() => handleNav('/signup')}>
                Get Started
              </Button>
            </div>
          )}

          {!isDashboard && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              className="rounded-md p-2 text-ink-muted hover:bg-overlay md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {mobileMenuOpen && !isDashboard && (
        <div className="space-y-1 border-t border-line-strong bg-canvas/95 px-4 py-4 backdrop-blur-md md:hidden">
          {[
            { label: 'Home', action: () => handleNav('/') },
            { label: 'Material', action: () => handleNav('/material') },
            { label: 'How It Works', action: () => scrollToSection('how-it-works') },
            { label: 'FAQ', action: () => scrollToSection('faq') },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-ink-muted transition-colors duration-200 hover:bg-overlay hover:text-ink"
            >
              {item.label}
            </button>
          ))}
          <div className="flex flex-col gap-2 border-t border-line-strong pt-4">
            <Button variant="secondary" size="sm" onClick={() => handleNav('/login')} className="w-full">
              Log in
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleNav('/signup')} className="w-full">
              Get Started
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
