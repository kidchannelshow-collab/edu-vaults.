import React from 'react';
import { LegalPage, LegalSection } from '../components/LegalPage';

export interface CookiePolicyProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

const LAST_UPDATED = 'October 14, 2026';

const sections: LegalSection[] = [
  {
    heading: '1. What We Use',
    body: (
      <>
        <p>
          EduVault uses browser storage to keep you signed in and to remember your place in the material.
          We keep this to the minimum needed to run the service.
        </p>
        <p>
          We do not use advertising cookies, we do not run third-party trackers, and we do not sell data
          about your activity to anyone.
        </p>
      </>
    ),
  },
  {
    heading: '2. Strictly Necessary Storage',
    body: (
      <>
        <p>These are required for the platform to function. The service cannot work without them.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-ink">Authentication session</strong> — issued by our authentication
            provider to keep you signed in and to authorise requests to your account.
          </li>
          <li>
            <strong className="text-ink">Device identifier</strong> — a random identifier stored in your
            browser so we can enforce the single active session rule and detect a session being used from
            somewhere it should not be.
          </li>
          <li>
            <strong className="text-ink">Security and entitlement state</strong> — used to confirm your
            access is still valid while you read.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: '3. Functional Storage',
    body: (
      <>
        <p>These remember your own preferences and nothing else:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-ink">Reading preferences</strong> — your chosen reader theme, so the
            document opens the way you left it.
          </li>
          <li>
            <strong className="text-ink">Sign-up form state</strong> — held only for the duration of your
            visit so a mistyped field does not lose your progress.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: '4. Analytics',
    body: (
      <p>
        We do not currently run third-party analytics or advertising scripts. If we introduce privacy-
        respecting measurement in future, this policy will be updated first and the change will be reflected
        in the last-updated date above.
      </p>
    ),
  },
  {
    heading: '5. Managing Storage',
    body: (
      <p>
        You can clear cookies and site storage at any time through your browser settings. Clearing strictly
        necessary storage will sign you out; clearing functional storage will simply reset your reading
        preferences. Blocking strictly necessary storage will prevent the platform from working.
      </p>
    ),
  },
  {
    heading: '6. Changes to This Policy',
    body: (
      <p>
        If our use of storage changes in a way that affects you, we will update this page and revise the
        last-updated date. Continued use of EduVault after an update indicates acceptance of the revised
        policy.
      </p>
    ),
  },
  {
    heading: '7. Contact',
    body: (
      <p>
        Questions about this policy can be sent to our privacy contact at{' '}
        <span className="text-ink font-medium">privacy@eduvault.edu</span>.
      </p>
    ),
  },
];

export const CookiePolicy: React.FC<CookiePolicyProps> = ({ currentPath, onNavigate }) => (
  <LegalPage
    currentPath={currentPath}
    onNavigate={onNavigate}
    title="Cookie Policy"
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
