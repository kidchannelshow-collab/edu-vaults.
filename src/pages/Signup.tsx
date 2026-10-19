import React, { useState } from 'react';
import { AuthLayout } from '../layouts/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Mail, Lock, User as UserIcon, ArrowRight, Eye, EyeOff, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface SignupProps {
  onNavigate: (path: string) => void;
}

export const Signup: React.FC<SignupProps> = ({ onNavigate }) => {
  const [fullName, setFullName] = useState(() => sessionStorage.getItem('signup_fullname') || '');
  const [email, setEmail] = useState(() => sessionStorage.getItem('signup_email') || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState(false);
  const { signUp } = useAuth();

  React.useEffect(() => {
    sessionStorage.setItem('signup_fullname', fullName);
  }, [fullName]);

  React.useEffect(() => {
    sessionStorage.setItem('signup_email', email);
  }, [email]);

  // Password strength — palette-restricted to red (weak) / green (strong).
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-overlay-strong' };
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 1) return { score: 25, label: 'Weak', color: 'bg-danger' };
    if (score === 2) return { score: 50, label: 'Fair', color: 'bg-danger' };
    if (score === 3) return { score: 75, label: 'Good', color: 'bg-gold' };
    return { score: 100, label: 'Strong', color: 'bg-gold-strong' };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setErrorMessage('You must agree to the Terms & Conditions and Privacy Policy.');
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(email, password, fullName);
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message || 'Error creating account.');
    } else {
      sessionStorage.removeItem('signup_fullname');
      sessionStorage.removeItem('signup_email');
      setSuccessMessage(true);
    }
  };

  if (successMessage) {
    return (
      <AuthLayout
        currentPath="/signup"
        onNavigate={onNavigate}
        title="Account created"
        subtitle="Your student profile has been registered."
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-success/30 bg-success/10 text-success">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-ink">
              Welcome to EduVault, {fullName}
            </h3>
            <p className="text-sm leading-relaxed text-ink-muted">
              Your account is ready. Open your dashboard to preview the material, or continue to checkout
              when you are ready to unlock it.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => onNavigate('/dashboard')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Go to dashboard
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => onNavigate('/login')}
            >
              Sign in
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      currentPath="/signup"
      onNavigate={onNavigate}
      title="Create your account"
      subtitle="Start accessing secure educational resources today"
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
            label="Full name"
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            leftIcon={<UserIcon className="w-4 h-4" />}
            autoComplete="name"
            required
          />

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
                autoComplete="new-password"
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

            {password && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">Password strength</span>
                  <span className="font-medium text-ink">{strength.label}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay-strong">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <Input
              label="Confirm password"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-9 text-ink-faint transition-colors hover:text-ink"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              id="terms"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-line-strong text-gold focus:ring-gold/25"
              required
            />
            <label htmlFor="terms" className="select-none text-sm leading-relaxed text-ink-muted">
              I agree to the{' '}
              <button
                type="button"
                onClick={() => onNavigate('/terms')}
                className="font-medium text-info hover:text-ink hover:underline"
              >
                Terms of Service
              </button>
              ,{' '}
              <button
                type="button"
                onClick={() => onNavigate('/privacy')}
                className="font-medium text-info hover:text-ink hover:underline"
              >
                Privacy Policy
              </button>{' '}
              and{' '}
              <button
                type="button"
                onClick={() => onNavigate('/fair-use')}
                className="font-medium text-info hover:text-ink hover:underline"
              >
                Fair Use Policy
              </button>
              .
            </label>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Create account
          </Button>
        </form>

        <div className="flex items-center gap-2 border-t border-line-strong pt-5 text-xs text-ink-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gold" />
          <span>Your details are encrypted and never shared.</span>
        </div>

        <p className="text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="font-medium text-info hover:text-ink hover:underline"
          >
            Log in
          </button>
        </p>
      </div>
    </AuthLayout>
  );
};
