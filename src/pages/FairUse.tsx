import React from 'react';
import { LegalPage, LegalSection } from '../components/LegalPage';

export interface FairUseProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

const LAST_UPDATED = 'October 14, 2026';

const sections: LegalSection[] = [
  {
    heading: '1. What You Are Granted',
    body: (
      <>
        <p>
          When you unlock an EduVault material, you are granted a personal, non-exclusive,
          non-transferable, revocable licence to read and study that material for your own education.
        </p>
        <p>
          You are buying access for yourself. You are not buying the material itself, and ownership of the
          content, its text, structure, diagrams and presentation remains with EduVault and its authors.
        </p>
      </>
    ),
  },
  {
    heading: '2. What You May Do',
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Read and study the material as often as you like, for as long as your access remains active.</li>
        <li>Take your own handwritten or typed notes for personal study.</li>
        <li>Quote brief extracts in your own academic work, with proper attribution to EduVault.</li>
        <li>Study across your own devices, subject to the single active session rule below.</li>
      </ul>
    ),
  },
  {
    heading: '3. What You May Not Do',
    body: (
      <>
        <p>The following are strictly prohibited and may result in immediate suspension without refund:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Copying, downloading, screen-capturing, photographing, scanning or otherwise reproducing the
            material, in whole or in part.
          </li>
          <li>
            Sharing, sending, uploading, posting or otherwise distributing the material or your account
            credentials to any other person.
          </li>
          <li>
            Reselling, sub-licensing, renting or commercially exploiting the material in any form.
          </li>
          <li>
            Removing, obscuring or attempting to defeat any watermark, access control, or security measure.
          </li>
          <li>
            Using automated tools to scrape, bulk-extract or systematically harvest the material or its
            contents.
          </li>
          <li>
            Using the material to train, fine-tune or otherwise develop any machine learning or generative
            model.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: '4. Single Active Session',
    body: (
      <p>
        Each account may hold one active reading session at a time. Signing in on a new device may end the
        session on the previous device. This exists to keep your access yours alone, and to make sharing an
        account impractical.
      </p>
    ),
  },
  {
    heading: '5. Watermarking and Monitoring',
    body: (
      <p>
        Material delivered through the secure reader carries a dynamic watermark identifying the licensed
        account. We also record security events, including detected attempts to capture or print protected
        content. This lets us identify the source of any leaked material.
      </p>
    ),
  },
  {
    heading: '6. Consequences of Breach',
    body: (
      <>
        <p>
          Where we detect a breach of this policy we may, depending on severity: issue a warning, suspend
          the session, suspend or terminate the account, and permanently withdraw access to the material.
        </p>
        <p>
          Suspension for breach of this policy does not give rise to a refund, and we reserve the right to
          pursue any available legal remedy for material that has been redistributed.
        </p>
      </>
    ),
  },
  {
    heading: '7. Reporting Infringement',
    body: (
      <p>
        If you become aware of EduVault material being shared or sold without authorisation, please report it
        to us. Reports are treated confidentially.
      </p>
    ),
  },
];

export const FairUse: React.FC<FairUseProps> = ({ currentPath, onNavigate }) => (
  <LegalPage
    currentPath={currentPath}
    onNavigate={onNavigate}
    title="Fair Use Policy"
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
