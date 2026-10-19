import React from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Shield, Lock } from 'lucide-react';

export interface PrivacyProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Privacy: React.FC<PrivacyProps> = ({ currentPath, onNavigate }) => {
  return (
    <MainLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                onNavigate('/');
              }
            }}
          >
            ← Back
          </Button>
        </div>

        {/* Header */}
        <div className="space-y-3 border-b border-line-strong pb-6">
          <div className="flex items-center gap-2 text-gold font-medium text-xs">
            <Shield className="w-4 h-4" aria-hidden="true" /> EduVault Legal & Compliance
          </div>
          <h1 className="text-2xl font-semibold text-ink">Privacy Policy</h1>
          <p className="text-sm text-ink-muted">Last updated: August 28, 2026</p>
          <div className="bg-danger/10 border border-danger/30 p-4 rounded-lg text-sm text-danger">
            <strong>Notice:</strong> This privacy policy is provided as a standard informational template for Edvance Academy / EduVault educational platform and does not constitute formal jurisdiction-specific legal advice.
          </div>
        </div>

        <Card className="space-y-8 text-sm text-ink-soft leading-relaxed">
          
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-ink">1. Information We Collect</h2>
            <p>
              EduVault collects information to provide secure educational resources, verify student enrollment, and protect course materials against unauthorized redistribution. The categories of information we collect include:
            </p>
          </section>

          <section className="space-y-3 pl-4 border-l-2 border-line-strong">
            <h3 className="text-base font-semibold text-ink">Account Information</h3>
            <p>
              When you register for an EduVault student account, we collect your full name, email address, institutional affiliation (if applicable), and secure authentication credentials.
            </p>
          </section>

          <section className="space-y-3 pl-4 border-l-2 border-line-strong">
            <h3 className="text-base font-semibold text-ink">Payment-Related Information</h3>
            <p>
              For paid course materials and subscriptions, payment transactions are processed securely through certified third-party payment gateways (such as Stripe). EduVault does not store complete credit card numbers on our servers; we receive tokenized transaction confirmation and billing metadata.
            </p>
          </section>

          <section className="space-y-3 pl-4 border-l-2 border-line-strong">
            <h3 className="text-base font-semibold text-ink">Educational Activity</h3>
            <p>
              We record your reading progress, course completion percentages, bookmarks, and quiz results to synchronize your study dashboard across authorized sessions.
            </p>
          </section>

          <section className="space-y-3 pl-4 border-l-2 border-line-strong">
            <h3 className="text-base font-semibold text-ink">Device and Session Information</h3>
            <p>
              To enforce our secure single-device access policy, we log active device types, browser fingerprints, login timestamps, and IP addresses when you access our secure reader.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">2. How Information Is Used</h2>
            <p>
              We utilize collected information strictly to operate, maintain, and secure the EduVault platform. This includes authenticating user sessions, delivering tokenized document streams, providing student support, and sending essential security notifications.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">3. Data Retention</h2>
            <p>
              Student account records, educational progress, and activity logs are retained for as long as your account remains active or as needed to provide educational services. You may request account deletion at any time through your account settings.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">4. Security & DRM Protection</h2>
            <p>
              EduVault employs robust encryption protocols, JWT token authentication, Row Level Security (RLS), and dynamic digital watermarking to protect user data and copyrighted curriculum materials against unauthorized exfiltration.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">5. Third-Party Services</h2>
            <p>
              We integrate select third-party infrastructure for authentication (e.g., Supabase), payment processing, and secure cloud hosting. These providers adhere to strict data privacy commitments and process information solely on our behalf.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">6. User Rights</h2>
            <p>
              Students maintain the right to access, correct, or request deletion of their personal information. You can update your profile details directly within the account settings menu or contact our privacy team for assistance.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">7. Contact Us</h2>
            <p>
              If you have any questions or concerns regarding this Privacy Policy or our data practices, please contact our privacy compliance officer at <span className="text-ink font-medium">privacy@edvault.edu</span>.
            </p>
          </section>

        </Card>
      </div>
    </MainLayout>
  );
};

