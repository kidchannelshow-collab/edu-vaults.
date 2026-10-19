import React from 'react';
import { LegalPage, LegalSection } from '../components/LegalPage';

export interface ContentDisclaimerProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

const LAST_UPDATED = 'October 14, 2026';

const sections: LegalSection[] = [
  {
    heading: '1. Educational Purpose Only',
    body: (
      <p>
        All material published on EduVault is provided for general educational and revision purposes only.
        It is intended to support your own study and preparation. It is not a substitute for attending
        lectures, following your institution&apos;s official syllabus, or seeking guidance from your
        lecturers and tutors.
      </p>
    ),
  },
  {
    heading: '2. No Guarantee of Results',
    body: (
      <>
        <p>
          EduVault is built to help serious students prepare well, and we believe good material makes a real
          difference. However, we make no guarantee, promise or representation that using this material will
          result in any particular grade, mark, score, pass, distinction or outcome in any examination or
          assessment.
        </p>
        <p>
          Your results depend on many factors outside our control, including your own effort, the specific
          questions set, your institution&apos;s marking standards, and the time you are able to commit.
        </p>
      </>
    ),
  },
  {
    heading: '3. Accuracy and Currency',
    body: (
      <>
        <p>
          We take care to make our material accurate and up to date at the time of writing. Curricula,
          syllabuses, examination formats and accepted practice do change over time, and different
          institutions may teach or mark the same topic differently.
        </p>
        <p>
          You should always treat your institution&apos;s own course materials and your lecturer&apos;s
          guidance as authoritative, and use EduVault as a supplement to them.
        </p>
      </>
    ),
  },
  {
    heading: '4. Not Professional Advice',
    body: (
      <p>
        Nothing on EduVault constitutes legal, medical, financial, engineering or other professional advice.
        Any worked example, case study or applied problem is illustrative teaching material only and must
        not be relied upon as professional guidance in a real-world setting.
      </p>
    ),
  },
  {
    heading: '5. Third-Party Content and References',
    body: (
      <p>
        Our material may reference third-party works, standards, textbooks or publicly available sources.
        Such references are provided for context and attribution. EduVault does not claim ownership of any
        third-party work, and any trademarks or names referenced remain the property of their respective
        owners.
      </p>
    ),
  },
  {
    heading: '6. Limitation of Reliance',
    body: (
      <p>
        To the fullest extent permitted by law, EduVault and its authors accept no liability for any loss,
        damage, or disadvantage arising from reliance on the content of our material, including any academic
        or examination outcome. Your use of the material is at your own discretion and risk.
      </p>
    ),
  },
  {
    heading: '7. Reporting an Error',
    body: (
      <p>
        If you believe you have found an error, an outdated statement, or material that infringes your
        rights, please contact us with the page and a description of the issue. We review all reports and
        correct confirmed errors in subsequent revisions.
      </p>
    ),
  },
];

export const ContentDisclaimer: React.FC<ContentDisclaimerProps> = ({ currentPath, onNavigate }) => (
  <LegalPage
    currentPath={currentPath}
    onNavigate={onNavigate}
    title="Content Disclaimer"
    lastUpdated={LAST_UPDATED}
    notice={
      <>
        <strong>Notice:</strong> This disclaimer is provided as a standard informational template and does
        not constitute formal jurisdiction-specific legal advice. Please have it reviewed before relying on
        it commercially.
      </>
    }
    sections={sections}
  />
);
