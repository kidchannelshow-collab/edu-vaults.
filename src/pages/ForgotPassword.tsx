import React, { useState } from 'react';
import { AuthLayout } from '../layouts/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface ForgotPasswordProps {
  onNavigate: (path: string) => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    const { error } = await resetPassword(email);
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message || 'Error sending password reset email.');
    } else {
      setIsSubmitted(true);
    }
  };

  return (
    <AuthLayout
      currentPath="/forgot-password"
      onNavigate={onNavigate}
      title="Reset your password"
      subtitle="Enter your email and we'll send you recovery instructions"
    >
      {isSubmitted ? (
        <div className="space-y-4 text-center py-4">
          <div className="w-12 h-12 rounded-lg border border-success/30 bg-success/10 text-success flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-ink">Check your inbox</h3>
          <p className="text-sm text-ink-muted">
            We have sent password recovery instructions to <span className="font-medium text-ink">{email}</span>.
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('/login')} className="w-full" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Back to Sign In
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMessage && (
            <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-danger" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}
          <Input
            label="Email Address"
            type="email"
            placeholder="student@edvance.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="w-4 h-4" />}
            required
          />
          <div>
            <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
              Send Reset Instructions
            </Button>
          </div>
          <div className="text-center">
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to Sign In
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};
