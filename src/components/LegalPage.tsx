import React from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Shield } from 'lucide-react';

export interface LegalSection {
  heading: string;
  /** Plain paragraphs, or a nested list — rendered inside the section body. */
  body: React.ReactNode;
}

export interface LegalPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  title: string;
  lastUpdated: string;
  /** Rendered above the numbered sections, inside the card. */
  intro?: React.ReactNode;
  sections: LegalSection[];
  /** Red compliance notice shown in the header. Warnings are red in this system. */
  notice?: React.ReactNode;
}

/**
 * Shared chrome for the policy pages so all six documents stay visually
 * identical. Privacy and Terms predate this component and still carry their
 * own copy of the markup; migrate them here when they are next edited.
 */
export const LegalPage: React.FC<LegalPageProps> = ({
  currentPath,
  onNavigate,
  title,
  lastUpdated,
  intro,
  sections,
  notice,
}) => {
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

        <div className="space-y-3 border-b border-line-strong pb-6">
          <div className="flex items-center gap-2 text-gold font-medium text-xs">
            <Shield className="w-4 h-4" aria-hidden="true" /> EduVault Legal &amp; Compliance
          </div>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          <p className="text-sm text-ink-muted">Last updated: {lastUpdated}</p>
          {notice && (
            <div className="bg-danger/10 border border-danger/30 p-4 rounded-lg text-sm text-danger">
              {notice}
            </div>
          )}
        </div>

        <Card className="space-y-8 text-sm text-ink-soft leading-relaxed">
          {intro && <div className="space-y-3">{intro}</div>}

          {sections.map((section, index) => (
            <section
              key={section.heading}
              className={
                index === 0 && !intro
                  ? 'space-y-3'
                  : 'space-y-3 pt-4 border-t border-line-strong'
              }
            >
              <h2 className="text-lg font-semibold text-ink">{section.heading}</h2>
              {section.body}
            </section>
          ))}
        </Card>
      </div>
    </MainLayout>
  );
};
