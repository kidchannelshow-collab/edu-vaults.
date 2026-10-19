import React, { useState } from 'react';
import { AuthLayout } from '../layouts/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getProfile } from '../lib/profileService';

export interface LoginProps {
  onNavigate: (path: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState(() => sessionStorage.getItem('login_email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { signIn, signOut } = useAuth();

  React.useEffect(() => {
    sessionStorage.setItem('login_email', email);
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setIsLoading(false);
      setErrorMessage(error.message || 'Invalid email or password.');
      return;
    }

    sessionStorage.removeItem('login_email');

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      setIsLoading(false);
      setErrorMessage('Authentication succeeded, but user session could not be retrieved.');
      return;
    }

    const { profile: prof, error: profError } = await getProfile(
      user.id,
      user.email,
      user.user_metadata?.full_name
    );

    if (profError || !prof) {
      setErrorMessage('Authentication succeeded, but failed to load user profile from database. Please contact administration.');
      setIsLoading(false);
      return;
    }

    if (prof.status === 'suspended') {
      setErrorMessage('Your account is currently suspended. Please contact EduVault administration.');
      await signOut();
      setIsLoading(false);
      return;
    }

    // Role-based redirect
    const redirectDecision =
      prof.role?.toLowerCase().trim() === 'admin' && (prof.status as string) !== 'suspended'
        ? '/admin'
        : '/dashboard';

    setIsLoading(false);
    onNavigate(redirectDecision);
  };

  return (
    <AuthLayout
      currentPath="/login"
      onNavigate={onNavigate}
      title="Welcome back"
      subtitle="Sign in to access your secure educational materials"
    >
      <div className="space-y-5">
        {errorMessage && (
          <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger/10 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span className="text-sm text-danger">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            autoComplete="email"
            required
          />

          <div className="space-y-2">
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-9 text-ink-faint transition-colors hover:text-ink"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-line-strong text-gold focus:ring-gold/25"
                />
                <label htmlFor="remember" className="cursor-pointer select-none text-sm text-ink-muted">
                  Remember me
                </label>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/forgot-password')}
                className="text-sm font-medium text-info hover:text-ink hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Log in
          </Button>
        </form>

        <p className="text-center text-xs leading-relaxed text-ink-muted">
          By signing in, you agree to our{' '}
          <button
            type="button"
            onClick={() => onNavigate('/terms')}
            className="font-medium text-info hover:text-ink hover:underline"
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <button
            type="button"
            onClick={() => onNavigate('/privacy')}
            className="font-medium text-info hover:text-ink hover:underline"
          >
            Privacy Policy
          </button>
          .
        </p>

        <div className="flex items-center gap-2 border-t border-line-strong pt-5 text-xs text-ink-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gold" />
          <span>Encrypted session with single-device authorization.</span>
        </div>

        <p className="text-center text-sm text-ink-muted">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={() => onNavigate('/signup')}
            className="font-medium text-info hover:text-ink hover:underline"
          >
            Create one
          </button>
        </p>
      </div>
    </AuthLayout>
  );
};
