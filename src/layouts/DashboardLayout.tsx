import React, { useState } from 'react';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';

const LEGAL_LINKS = [
  { label: 'Terms of Service', path: '/terms' },
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Refund Policy', path: '/refund-policy' },
  { label: 'Content Disclaimer', path: '/content-disclaimer' },
  { label: 'Fair Use', path: '/fair-use' },
  { label: 'Cookie Policy', path: '/cookie-policy' },
];

export interface DashboardLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  currentPath,
  onNavigate,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Navbar
        currentPath={currentPath}
        onNavigate={onNavigate}
        isDashboard={true}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="flex flex-1">
        <Sidebar
          currentPath={currentPath}
          onNavigate={onNavigate}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-7xl flex-1 p-6 lg:p-8">{children}</div>

          {/* Legal policies, reachable from inside the authenticated app rather
              than only from the public marketing footer. */}
          <footer className="border-t border-line-strong px-6 py-5 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-xs text-ink-faint">
                © {new Date().getFullYear()} EduVault
              </span>
              {LEGAL_LINKS.map((link) => (
                <button
                  key={link.path}
                  onClick={() => onNavigate(link.path)}
                  className="text-xs text-ink-muted transition-colors duration-200 hover:text-gold"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};
