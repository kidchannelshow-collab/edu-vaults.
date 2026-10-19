import React from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ShieldAlert, BookOpen } from 'lucide-react';

export interface TermsProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Terms: React.FC<TermsProps> = ({ currentPath, onNavigate }) => {
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
            <BookOpen className="w-4 h-4" aria-hidden="true" /> EduVault Legal & Compliance
          </div>
          <h1 className="text-2xl font-semibold text-ink">Terms of Service</h1>
          <p className="text-sm text-ink-muted">Last updated: August 28, 2026</p>
          <div className="bg-danger/10 border border-danger/30 p-4 rounded-lg text-sm text-danger">
            <strong>Notice:</strong> These terms of service are provided as standard informational placeholders for the EduVault educational platform and do not constitute formal jurisdiction-specific legal advice.
          </div>
        </div>

        <Card className="space-y-8 text-sm text-ink-soft leading-relaxed">
          
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-ink">1. Acceptance of Terms</h2>
            <p>
              By accessing and using the EduVault educational platform, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, you must not access or use our secure reading materials and services.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">2. Account Registration & Security</h2>
            <p>
              To access course materials, you must register for a verified student account. You agree to provide accurate, current information and maintain the strict confidentiality of your password. You are solely responsible for all activities that occur under your account.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">3. Educational Materials & Intellectual Property</h2>
            <p>
              All textbooks, reading notes, video lectures, and assessments available on EduVault are protected by copyright and intellectual property laws. All rights remain strictly with EduVault and respective curriculum authors.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">4. Payment and Access Entitlements</h2>
            <p>
              Purchasing access to course materials grants you a limited, non-exclusive, non-transferable license to view the materials via the secure EduVault reader. Access entitlements are tied directly to your active student account.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">5. Personal & Non-Transferable Access</h2>
            <p>
              Your student account is strictly personal. You may not lend, transfer, sell, or assign your account credentials or access entitlements to any third party.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">6. Prohibited Sharing & Redistribution</h2>
            <p>
              To safeguard academic integrity, downloading, copying, screen recording, screenshot redistribution, or sharing secure reading materials on public forums or file-sharing networks is strictly prohibited and constitutes a material breach of these terms.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">7. Account and Device Restrictions</h2>
            <p>
              EduVault enforces a strict <strong>single active device per student account</strong> policy. Simultaneous logins from multiple devices or browsers will result in session invalidation to prevent unauthorized license sharing.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">8. Suspension and Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account immediately without prior notice if you violate these terms, engage in prohibited sharing, or compromise platform security.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">9. Refund Policy Placeholder</h2>
            <p>
              Due to the digital nature of secure educational content and instant access to proprietary course materials, purchases are generally non-refundable once viewed or decrypted. Refund requests for accidental duplicate purchases must be submitted within 48 hours to support.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">10. Limitation of Liability</h2>
            <p>
              EduVault and its instructors shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform or inability to access course materials due to technical maintenance or network outages.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-line-strong">
            <h2 className="text-lg font-semibold text-ink">11. Contact Information</h2>
            <p>
              For any questions regarding these Terms of Service, please contact our administrative team at <span className="text-ink font-medium">legal@edvault.edu</span>.
            </p>
          </section>

        </Card>
      </div>
    </MainLayout>
  );
};

