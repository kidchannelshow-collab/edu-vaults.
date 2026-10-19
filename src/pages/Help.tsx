import React, { useState } from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Search, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface HelpProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const realFAQs: FAQItem[] = [
  {
    id: 'faq_1',
    question: 'How do I access secure educational materials?',
    answer: 'Secure materials are encrypted and delivered through our authenticated PDF reader with built-in digital watermarking and authorization checks.',
    category: 'Access',
  },
  {
    id: 'faq_2',
    question: 'How do course entitlements and unlocking work?',
    answer: 'Material access is managed through your active course entitlements in Supabase. Locked materials require active course enrollment or purchase.',
    category: 'Entitlements',
  },
  {
    id: 'faq_3',
    question: 'How is my reading progress tracked?',
    answer: 'Your reading progress is automatically saved as you navigate through chapters in the secure reader, updating your completion metrics in real time.',
    category: 'Learning',
  },
  {
    id: 'faq_4',
    question: 'How do I update my profile details?',
    answer: 'You can update your full name and review your account email securely from the Account Settings page.',
    category: 'Account',
  },
];

export const Help: React.FC<HelpProps> = ({ currentPath, onNavigate }) => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq_1');

  const filteredFAQs = realFAQs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleHomeClick = () => {
    if (user) {
      onNavigate('/dashboard');
    } else {
      onNavigate('/');
    }
  };

  const content = (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              onNavigate(user ? '/dashboard' : '/');
            }
          }}
        >
          ← Back
        </Button>
        {/* A secondary navigation link stays neutral — gold is reserved for the
            primary CTA and active nav, so it must not be spent here. */}
        <button
          onClick={handleHomeClick}
          className="text-xs font-medium text-ink-muted transition-colors hover:text-ink"
        >
          {user ? 'Go to Dashboard →' : 'Go to Home →'}
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-ink">Help Center & FAQ</h1>
          <p className="text-sm text-ink-muted">Find answers about secure material access, account setup, and Supabase integration.</p>
        </div>
        <div className="max-w-md">
          <Input
            placeholder="Search help articles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">Frequently Asked Questions</h2>
        {filteredFAQs.length === 0 ? (
          <p className="text-sm text-ink-muted py-8">No matching help articles found.</p>
        ) : (
          filteredFAQs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            return (
              <Card key={faq.id} className="transition-colors">
                <button
                  onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                  className="w-full flex items-center justify-between gap-4 rounded-md text-left font-semibold text-ink"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <p className="mt-3 text-sm text-ink-soft border-t border-line-strong pt-3 leading-relaxed">
                    {faq.answer}
                  </p>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );

  if (user) {
    return (
      <DashboardLayout currentPath={currentPath} onNavigate={onNavigate}>
        {content}
      </DashboardLayout>
    );
  }

  return (
    <MainLayout currentPath={currentPath} onNavigate={onNavigate}>
      {content}
    </MainLayout>
  );
};
