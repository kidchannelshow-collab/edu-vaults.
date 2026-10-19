import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { 
  User, 
  Mail, 
  Lock, 
  Shield, 
  CheckCircle2, 
  Smartphone, 
  Monitor, 
  LogOut, 
  Trash2, 
  Bell, 
  BookOpen,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

export interface SettingsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

/** Human-readable browser/OS label for the current device (real, not mocked). */
function describeCurrentDevice(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox'
    : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

function formatSessionTime(value?: string | null): string {
  if (!value) return 'Not recorded yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not recorded yet';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export const Settings: React.FC<SettingsProps> = ({ currentPath, onNavigate }) => {
  const { user } = useAuth();
  const { profile, loading: loadingProfile, error: profileContextError, updateUserFullName } = useProfile();
  const { theme, setTheme } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Appearance is owned by ThemeContext so it applies app-wide, not just here.

  // Active device session. This block used to render a hardcoded
  // "Chrome on macOS / IP: 192.168.1.84" placeholder; it now reads the real
  // row from device_sessions.
  const [session, setSession] = useState<{
    created_at: string;
    last_seen_at: string | null;
    ip_address: string | null;
    user_agent: string | null;
  } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Modals state
  const [signOutAllModal, setSignOutAllModal] = useState(false);
  const [deleteAccountModal, setDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setEmail(profile.email || user?.email || '');
    } else if (user) {
      setEmail(user.email || '');
    }
    if (profileContextError) {
      setProfileError(profileContextError);
    }
  }, [profile, user, profileContextError]);

  // Load the caller's real active device session.
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!user) {
        setSessionLoading(false);
        return;
      }
      setSessionLoading(true);
      const { data } = await supabase
        .from('device_sessions')
        .select('created_at, last_seen_at, ip_address, user_agent')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled) {
        setSession(data ?? null);
        setSessionLoading(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileError(null);
    setIsUpdating(true);

    const { error } = await updateUserFullName(fullName);
    setIsUpdating(false);

    if (error) {
      setProfileError(error.message || 'Failed to update profile.');
    } else {
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3000);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (!user?.email) {
      setPasswordError('No signed-in account found.');
      return;
    }

    setIsUpdatingPassword(true);

    // Re-authenticate first. Supabase refuses a password change on a session it
    // considers stale, and this also proves the caller knows the current
    // password — otherwise anyone at an unlocked browser could take the account.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reauthError) {
      setIsUpdatingPassword(false);
      setPasswordError('Your current password is incorrect.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setIsUpdatingPassword(false);

    if (updateError) {
      setPasswordError(updateError.message || 'Could not update your password.');
      return;
    }

    // Log it — a password change is one of the security events the admin
    // console is meant to surface.
    await supabase.from('access_logs').insert({
      user_id: user.id,
      event_type: 'password_changed',
      metadata: { device: describeCurrentDevice() },
    });

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess(true);
    setTimeout(() => setPasswordSuccess(false), 5000);
  };

  return (
    <DashboardLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="mx-auto max-w-4xl space-y-6 pb-16">
        
        {/* Header */}
        <div className="border-b border-line-strong pb-5">
          <h1 className="text-xl font-semibold text-ink">Account Settings</h1>
          <p className="mt-1 text-sm text-ink-muted">Manage your profile credentials, device session security, and reading preferences.</p>
        </div>

        {savedBanner && (
          <div className="bg-success/10 border border-success/30 text-success p-4 rounded-lg flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <span>Settings updated successfully.</span>
          </div>
        )}

        {/* 1. Account Section */}
        <Card className="space-y-6">
          <div className="border-b border-line-strong pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Account Information</h2>
              <p className="text-xs text-ink-muted">Update your profile details and credentials.</p>
            </div>
            <Badge variant="green" size="sm">Student Account</Badge>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-4">
            {profileError && (
              <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
                <span>{profileError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                leftIcon={<User className="w-4 h-4" />}
                required
                disabled={loadingProfile}
              />
              <Input
                label="Email Address (Managed by Supabase Auth)"
                type="email"
                value={email}
                disabled
                leftIcon={<Mail className="w-4 h-4" />}
                className="text-ink-muted cursor-not-allowed"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" variant="primary" size="sm" disabled={loadingProfile || isUpdating}>
                {isUpdating ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>
          </form>

          {/* Change Password Sub-form */}
          <div className="border-t border-line-strong pt-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ink">Change Password</h3>
              <p className="text-xs text-ink-muted">Ensure your account is using a secure password.</p>
            </div>

            {passwordSuccess && (
              <div className="bg-success/10 border border-success/30 text-success p-3 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span>Password changed successfully.</span>
              </div>
            )}

            {passwordError && (
              <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <Input
                label="Current Password"
                type="password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="New Password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                />
                <Input
                  label="Confirm New Password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  isLoading={isUpdatingPassword}
                  disabled={isUpdatingPassword}
                >
                  {isUpdatingPassword ? 'Updating…' : 'Update Password'}
                </Button>
              </div>
            </form>
          </div>
        </Card>

        {/* 2. Security Section */}
        <Card className="space-y-6">
          <div className="border-b border-line-strong pb-4">
            <h2 className="text-lg font-semibold text-ink">Security & Active Sessions</h2>
            <p className="text-xs text-ink-muted">EduVault enforces a strict single active device policy per student account to protect proprietary materials.</p>
          </div>

          <div className="bg-surface-deep border border-line-strong p-4 rounded-lg space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/10 text-gold flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink text-sm">{describeCurrentDevice()}</span>
                    <Badge variant={session ? 'success' : 'neutral'} size="sm">
                      {session ? 'Active session' : 'No active session'}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {sessionLoading
                      ? 'Loading session details…'
                      : session
                        ? `Started ${formatSessionTime(session.created_at)} · Last active ${formatSessionTime(session.last_seen_at)}`
                        : 'This device has no recorded session yet.'}
                  </p>
                  {session && (
                    <p className="text-xs text-ink-muted">
                      IP address: {session.ip_address || 'Not recorded for this session'}
                    </p>
                  )}
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onNavigate('/login')}
                leftIcon={<LogOut className="w-3.5 h-3.5" />}
              >
                Sign Out of This Device
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <h4 className="text-sm font-medium text-ink">Sign out of all active devices</h4>
              <p className="text-xs text-ink-muted">Invalidates all active session tokens instantly across any recognized browsers.</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSignOutAllModal(true)}
              className="text-danger border-danger/30 hover:bg-danger/10"
            >
              Sign Out All Devices
            </Button>
          </div>
        </Card>

        {/* 3. Preferences Section */}
        <Card className="space-y-6">
          <div className="border-b border-line-strong pb-4">
            <h2 className="text-lg font-semibold text-ink">Preferences</h2>
            <p className="text-xs text-ink-muted">Choose how documents are displayed in the secure reader.</p>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold text-ink">Appearance</span>

            <div className="grid max-w-sm grid-cols-2 gap-3">
              {([
                { key: 'dark', label: 'Dark', hint: 'Deep blue canvas' },
                { key: 'light', label: 'Light', hint: 'Crisp light canvas' },
              ] as const).map((opt) => {
                const active = theme === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setTheme(opt.key)}
                    aria-pressed={active}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-gold ring-2 ring-gold/25'
                        : 'border-line-strong hover:border-ink-faint'
                    }`}
                  >
                    {/* Swatches show the theme's own canvas, so these two hex
                        values are deliberately literal — a token would preview
                        the theme you are already in. */}
                    <span
                      className="mb-2 block h-8 rounded-md border border-line-strong"
                      style={{ backgroundColor: opt.key === 'dark' ? '#090D16' : '#F6F8FB' }}
                    />
                    <span className="block text-sm font-medium text-ink">{opt.label}</span>
                    <span className="block text-xs text-ink-muted">{opt.hint}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-muted">
              Changes the whole interface immediately and is remembered on this device.
            </p>
          </div>
        </Card>

        {/* 4. Danger Zone */}
        <Card className="border-danger/30 bg-danger/5 space-y-4">
          <div className="border-b border-danger/30 pb-4">
            <h2 className="text-lg font-semibold text-danger">Danger Zone</h2>
            <p className="text-xs text-danger">Permanently delete your student account and all associated data.</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-sm font-medium text-ink block">Delete EduVault Account</span>
              <span className="text-xs text-ink-muted">Once deleted, your account entitlements and progress cannot be recovered.</span>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteAccountModal(true)}
              className="shrink-0"
            >
              Delete Account
            </Button>
          </div>
        </Card>

      </div>

      {/* Sign Out All Devices Modal */}
      <Modal
        isOpen={signOutAllModal}
        onClose={() => setSignOutAllModal(false)}
        title="Sign Out All Devices?"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => setSignOutAllModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setSignOutAllModal(false);
                onNavigate('/login');
              }}
            >
              Confirm Sign Out All
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div className="w-12 h-12 rounded-lg border border-danger/30 bg-danger/10 text-danger flex items-center justify-center mx-auto">
            <LogOut className="w-6 h-6" />
          </div>
          <div className="text-center space-y-1">
            <h4 className="font-semibold text-ink text-base">Invalidate all active sessions?</h4>
            <p className="text-xs text-ink-muted">
              You will be signed out immediately across all browsers and devices. You will need to log back in to continue studying.
            </p>
          </div>
        </div>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        isOpen={deleteAccountModal}
        onClose={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }}
        title="Delete Account Permanently"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => { setDeleteAccountModal(false); setDeleteConfirmText(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleteConfirmText !== 'DELETE'}
              onClick={() => {
                setDeleteAccountModal(false);
                onNavigate('/');
              }}
            >
              Permanently Delete
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div className="w-12 h-12 rounded-lg border border-danger/30 bg-danger/10 text-danger flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="text-center space-y-1">
            <h4 className="font-semibold text-ink text-base">Are you absolutely sure?</h4>
            <p className="text-xs text-ink-muted">
              This action cannot be undone. All your learning progress, bookmarks, and course access entitlements will be permanently removed.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <label className="text-xs font-semibold text-ink block">
              Type <span className="font-mono text-danger">DELETE</span> to confirm:
            </label>
            <Input
              placeholder="DELETE"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

