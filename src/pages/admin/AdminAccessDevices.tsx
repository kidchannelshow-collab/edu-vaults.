import React, { useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { AdminAccess } from './AdminAccess';
import { AdminDevices } from './AdminDevices';
import { Key, Smartphone } from 'lucide-react';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

/**
 * Access and Devices were two sidebar entries describing one thing: who may
 * read, and from where. They are now one destination with two live tabs —
 * each panel keeps its own realtime subscription, so both stay current while
 * only the selected one is mounted.
 */
export const AdminAccessDevices: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const [tab, setTab] = useState<'entitlements' | 'devices'>('entitlements');

  const tabs = [
    { key: 'entitlements', label: 'Entitlements & Access', icon: Key },
    { key: 'devices', label: 'Device Sessions', icon: Smartphone },
  ] as const;

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">
        <div className="border-b border-line-strong pb-5">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Key className="w-5 h-5 text-gold" /> Access &amp; Devices
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Entitlements, reader stream permissions and active device sessions in one live view.
          </p>
        </div>

        <div role="tablist" className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-line-strong text-ink-muted hover:bg-overlay hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'entitlements' ? (
          <AdminAccess currentPath={currentPath} onNavigate={onNavigate} />
        ) : (
          <AdminDevices currentPath={currentPath} onNavigate={onNavigate} />
        )}
      </div>
    </AdminLayout>
  );
};
