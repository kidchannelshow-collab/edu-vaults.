import React, { useState, useEffect } from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Reveal } from '../components/ui/Reveal';
import {
  ShieldCheck,
  Clock,
  Target,
  CreditCard,
  FileText,
  Lock,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  Sparkles,
  TrendingUp,
  Layers,
} from 'lucide-react';
import {
  getFlagshipMaterial,
  getPreviewImages,
  formatNaira,
  PREVIEW_BUCKET,
  MaterialWithStatus,
} from '../lib/materialService';
import { supabase } from '../lib/supabase';
import { PreviewPdfPages } from '../components/PreviewPdfPages';
import {
  FALLBACK_MATERIAL_DESCRIPTION,
  FALLBACK_MATERIAL_TITLE,
} from '../lib/materialDefaults';

export interface HomeProps {
  onNavigate: (path: string) => void;
}

const SECTION = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const [flagship, setFlagship] = useState<MaterialWithStatus | null>(null);
  const [loadingFlagship, setLoadingFlagship] = useState(true);
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq_acc_1');

  useEffect(() => {
    async function loadFlagship() {
      setLoadingFlagship(true);
      const { material } = await getFlagshipMaterial();
      setFlagship(material);
      setLoadingFlagship(false);
    }
    loadFlagship();
  }, []);

  const previewImages = getPreviewImages(flagship);
  // Admin-uploaded named preview URL first, then the array, then page 2.
  const pageOnePreview =
    flagship?.preview_page_1_url ||
    previewImages[0] ||
    flagship?.preview_page_2_url ||
    previewImages[1] ||
    null;
  const price = formatNaira(flagship?.price);
  const materialTitle = flagship?.title || FALLBACK_MATERIAL_TITLE;

  // Transformation outcomes — what the student gains, not what they buy.
  const outcomes = [
    {
      icon: TrendingUp,
      title: 'Walk in prepared',
      description:
        'Every topic structured around what examiners actually test, so nothing catches you off guard.',
    },
    {
      icon: Clock,
      title: 'Cut your revision time',
      description:
        'Dense, high-signal material that respects your time. No padding, no filler chapters.',
    },
    {
      icon: Layers,
      title: 'Understand, don’t memorise',
      description:
        'Worked problems and clear reasoning build real comprehension that holds up under pressure.',
    },
    {
      icon: Target,
      title: 'Track your mastery',
      description:
        'Progress saved automatically, so you always know exactly where you left off.',
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Create your free account',
      description: 'Takes under a minute. No card required to look around.',
      icon: Sparkles,
    },
    {
      step: '02',
      title: 'Read the first two pages',
      description: 'Inspect the real material yourself before you decide anything.',
      icon: Eye,
    },
    {
      step: '03',
      title: 'Unlock and start studying',
      description: 'Full access opens instantly in the secure reader.',
      icon: FileText,
    },
  ];

  const homeFaqs = [
    {
      id: 'faq_acc_1',
      question: 'Can I see the material before paying?',
      answer:
        'Yes. The first two pages are free to read on this site, with no account required. You can judge the quality, depth and writing style for yourself before spending anything.',
    },
    {
      id: 'faq_aft_3',
      question: 'What happens after I unlock it?',
      answer:
        'Access is granted the moment your payment is confirmed. You are taken straight to your dashboard, where the full guide opens in the secure reader.',
    },
    {
      id: 'faq_where_4',
      question: 'Where can I study?',
      answer:
        'Anywhere. The reader runs in your browser on desktop, tablet or mobile, and your progress follows you between them.',
    },
    {
      id: 'faq_dev_5',
      question: 'How many devices can I use?',
      answer:
        'One active reading session at a time. Signing in on a new device can end the session on the previous one, which keeps your access yours alone.',
    },
  ];

  return (
    <MainLayout currentPath="/" onNavigate={onNavigate}>
      <div className="pb-24">

        {/* ---------- Hero: transformation, never price ---------- */}
        <section className="relative overflow-hidden border-b border-line-strong">
          {/* Restrained ambient glow — subtle, single, non-decorative. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[-12rem] h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-gold/10 blur-[120px]"
          />
          <div className={`${SECTION} relative grid grid-cols-1 items-center gap-14 py-24 lg:grid-cols-12`}>
            <div className="space-y-7 lg:col-span-7">
              <Reveal>
                <Badge variant="gold" size="md">
                  <Sparkles className="h-3.5 w-3.5" />
                  Built for top-tier academic performance
                </Badge>
              </Reveal>

              <Reveal delay={0.06}>
                <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
                  Ace your exams with <span className="text-gold">absolute confidence</span>.
                </h1>
              </Reveal>

              <Reveal delay={0.12}>
                <p className="max-w-xl text-lg leading-relaxed text-ink-muted">
                  A complete, exam-focused study guide engineered for students who intend to finish
                  first. Structured revision, worked problems and clear reasoning — everything you
                  need to walk into the hall prepared.
                </p>
              </Reveal>

              <Reveal delay={0.18}>
                <div className="flex flex-col items-stretch gap-3 pt-2 sm:flex-row sm:items-center">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => onNavigate('/signup')}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Get Started
                  </Button>
                  <Button variant="secondary" size="lg" onClick={() => onNavigate('/login')}>
                    Login
                  </Button>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                  {['No card to preview', 'Study on any device', 'Yours for life'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-ink-muted">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* Preview teaser card */}
            <div className="lg:col-span-5">
              <Reveal delay={0.12}>
                <Card className="space-y-5 p-5">
                  <div className="flex items-center justify-between">
                    <Badge variant="gold" size="sm">Free preview</Badge>
                    <span className="text-xs text-ink-faint">First 2 pages</span>
                  </div>

                  {loadingFlagship ? (
                    <div className="flex flex-col items-center gap-3 py-16">
                      <Loader2 className="h-5 w-5 animate-spin text-gold" />
                      <p className="text-xs text-ink-muted">Loading preview…</p>
                    </div>
                  ) : previewImages.length > 0 || pageOnePreview ? (
                    // Admin-uploaded preview image, full-bleed with hover zoom.
                    <button
                      type="button"
                      onClick={() => onNavigate('/material')}
                      className="group block w-full space-y-4"
                    >
                      <span className="block overflow-hidden rounded-lg border border-line-strong bg-surface-deep">
                        <img
                          src={pageOnePreview || previewImages[0]}
                          alt={`${materialTitle} — preview page 1`}
                          loading="eager"
                          decoding="async"
                          className="h-auto w-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                        />
                        <span className="block border-t border-line-strong px-3 py-2 text-xs font-medium text-ink-muted">
                          Page 1 · Free preview
                        </span>
                      </span>
                    </button>
                  ) : flagship?.id ? (
                    // No uploaded preview images: render a public 2-page sample
                    // PDF on the fly. The protected paid document is never used.
                    <PreviewPdfPages
                      url={
                        supabase.storage
                          .from(PREVIEW_BUCKET)
                          .getPublicUrl(`previews/${flagship.id}/sample.pdf`).data.publicUrl
                      }
                    />
                  ) : (
                    <div className="rounded-lg border border-line-strong bg-surface-deep py-16 text-center">
                      <Eye className="mx-auto mb-2 h-5 w-5 text-ink-faint" />
                      <p className="text-xs text-ink-muted">Preview coming soon</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-ink">{materialTitle}</h3>
                    <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
                      {flagship?.description || FALLBACK_MATERIAL_DESCRIPTION}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => onNavigate('/material')}
                    rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    Open the material
                  </Button>
                </Card>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------- Outcomes ---------- */}
        <section className={`${SECTION} py-24`}>
          <Reveal>
            <div className="mx-auto mb-14 max-w-2xl space-y-3 text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Study less. Understand more. Score higher.
              </h2>
              <p className="text-lg text-ink-muted">
                EduVault is built around one question: what actually moves your grade?
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {outcomes.map((outcome, idx) => {
              const Icon = outcome.icon;
              return (
                <Reveal key={outcome.title} delay={idx * 0.06}>
                  <Card className="h-full space-y-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-gold/30 bg-gold/10">
                      <Icon className="h-5 w-5 text-gold" />
                    </div>
                    <h3 className="text-base font-semibold text-ink">{outcome.title}</h3>
                    <p className="text-sm leading-relaxed text-ink-muted">{outcome.description}</p>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-line-strong bg-canvas-soft">
          <div className={`${SECTION} py-24`}>
            <Reveal>
              <div className="mx-auto mb-14 max-w-2xl space-y-3 text-center">
                <Badge variant="info" size="sm">Three steps</Badge>
                <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  From curious to studying in a minute
                </h2>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {steps.map((st, idx) => {
                const Icon = st.icon;
                return (
                  <Reveal key={st.step} delay={idx * 0.08}>
                    <Card className="h-full space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong bg-overlay">
                          <Icon className="h-5 w-5 text-gold" />
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-ink-faint">
                          {st.step}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-ink">{st.title}</h3>
                      <p className="text-sm leading-relaxed text-ink-muted">{st.description}</p>
                    </Card>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- Security ---------- */}
        <section className={`${SECTION} py-24`}>
          <Reveal>
            <Card padding="lg" className="mx-auto max-w-3xl space-y-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-success/30 bg-success/10">
                <ShieldCheck className="h-6 w-6 text-success" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Protected, and yours alone
              </h2>
              <p className="text-ink-muted">
                Access is enforced server-side and delivered through short-lived signed links. Your
                copy is watermarked to your account, so the material you paid for stays yours.
              </p>
            </Card>
          </Reveal>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className={`${SECTION} scroll-mt-20`}>
          <div className="mx-auto max-w-3xl space-y-8">
            <Reveal>
              <div className="space-y-3 text-center">
                <Badge variant="neutral" size="sm">Questions</Badge>
                <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                  Frequently asked
                </h2>
              </div>
            </Reveal>

            <div className="space-y-3">
              {homeFaqs.map((faq, idx) => {
                const isOpen = openFaqId === faq.id;
                return (
                  <Reveal key={faq.id} delay={idx * 0.04}>
                    <Card padding="none">
                      <button
                        onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                      >
                        <span className="text-sm font-medium text-ink">{faq.question}</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <p className="border-t border-line-strong px-6 py-4 text-sm leading-relaxed text-ink-muted">
                          {faq.answer}
                        </p>
                      )}
                    </Card>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- Final high-intent CTA: price lives here, and only here ---------- */}
        <section className={`${SECTION} pt-24`}>
          <Reveal>
            <div className="relative overflow-hidden rounded-xl border border-gold/30 bg-surface-deep px-8 py-16 text-center sm:px-14">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[-8rem] h-[20rem] w-[36rem] -translate-x-1/2 rounded-full bg-gold/10 blur-[100px]"
              />
              <div className="relative space-y-6">
                <Badge variant="gold" size="md">
                  <CreditCard className="h-3.5 w-3.5" />
                  One-time payment · lifetime access
                </Badge>
                <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
                  Unlock your academic potential for as low as{' '}
                  <span className="text-gold">{price}</span>
                </h2>
                <p className="mx-auto max-w-xl text-ink-muted">
                  One payment. Every page, every worked problem, yours for life. No subscription, no
                  renewals, no surprises.
                </p>
                <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => onNavigate('/material')}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Unlock full access
                  </Button>
                  <Button variant="ghost" size="lg" onClick={() => onNavigate('/login')}>
                    I already have an account
                  </Button>
                </div>
                <p className="flex items-center justify-center gap-2 pt-2 text-xs text-ink-faint">
                  <Lock className="h-3.5 w-3.5" />
                  Secure checkout · access granted instantly on confirmation
                </p>
              </div>
            </div>
          </Reveal>
        </section>

      </div>
    </MainLayout>
  );
};
