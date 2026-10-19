import React from 'react';
import { LegalPage, LegalSection } from '../components/LegalPage';

export interface RefundPolicyProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

const LAST_UPDATED = 'October 14, 2026';

const sections: LegalSection[] = [
  {
    heading: '1. Our Approach to Refunds',
    body: (
      <p>
        EduVault sells digital study material delivered instantly through an in-app secure reader. Because
        the material is made available to you in full the moment payment is confirmed, we ask that you use
        the free preview before purchasing. We aim to be fair and straightforward where something has
        genuinely gone wrong.
      </p>
    ),
  },
  {
    heading: '2. Try Before You Buy',
    body: (
      <>
        <p>
          The first two pages of the material are available free of charge to every visitor, without an
          account and without payment. This preview is the real material, not a sample mockup.
        </p>
        <p>
          We strongly encourage you to read those two pages before purchasing so you can judge the depth,
          structure and writing style for yourself. A purchase made after reviewing the preview is treated
          as an informed purchase.
        </p>
      </>
    ),
  },
  {
    heading: '3. When We Will Refund',
    body: (
      <>
        <p>We will issue a full refund where:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>You were charged more than once for the same material due to a technical fault.</li>
          <li>
            You paid but access was never granted to your account, and our support team could not resolve
            the issue within 72 hours of you reporting it.
          </li>
          <li>
            The material delivered is materially different from what was described on the material page.
          </li>
          <li>You were charged without your authorisation.</li>
        </ul>
      </>
    ),
  },
  {
    heading: '4. When We Cannot Refund',
    body: (
      <>
        <p>Because access is delivered instantly and in full, we are generally unable to refund where:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>You changed your mind after unlocking the material.</li>
          <li>You purchased the material and did not use it, or used only part of it.</li>
          <li>
            You were unable to study for reasons within your control, such as a lost device, an unreliable
            internet connection, or an examination schedule that changed.
          </li>
          <li>
            Your access was suspended because you breached our Terms of Service or Fair Use Policy — for
            example by attempting to copy, share or redistribute the material.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: '5. How to Request a Refund',
    body: (
      <>
        <p>
          Contact our support team within <strong className="text-ink">14 days</strong> of the payment date,
          quoting the email address on your account and your transaction reference.
        </p>
        <p>
          We will acknowledge your request within 3 working days and aim to reach a decision within 7 working
          days. Where a refund is approved, it is returned to the original payment method. Processing time
          after approval is determined by your bank or card issuer and is typically 5 to 10 working days.
        </p>
      </>
    ),
  },
  {
    heading: '6. Cancellation',
    body: (
      <p>
        EduVault material is sold as a one-time payment, not a subscription. There is no recurring charge
        and therefore nothing to cancel. No further payment will be taken from your account after your
        initial purchase, and we hold no stored card details.
      </p>
    ),
  },
  {
    heading: '7. Your Statutory Rights',
    body: (
      <p>
        Nothing in this policy is intended to limit any right you may have under applicable consumer
        protection law in your jurisdiction. Where such law grants you rights broader than this policy,
        those rights prevail.
      </p>
    ),
  },
];

export const RefundPolicy: React.FC<RefundPolicyProps> = ({ currentPath, onNavigate }) => (
  <LegalPage
    currentPath={currentPath}
    onNavigate={onNavigate}
    title="Refund & Cancellation Policy"
    lastUpdated={LAST_UPDATED}
    notice={
      <>
        <strong>Notice:</strong> This policy is provided as a standard informational template and does not
        constitute formal jurisdiction-specific legal advice. Please have it reviewed before relying on it
        commercially.
      </>
    }
    sections={sections}
  />
);
