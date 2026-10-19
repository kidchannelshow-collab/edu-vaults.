import React, { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { MainLayout } from '../layouts/MainLayout';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import {
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  ArrowRight,
  Lock,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  FileText,
  Copy,
  Check,
  MessageCircle,
  Landmark,
  Search,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { supabase } from '../lib/supabase';
import { getReadingProgress, saveReadingProgress } from '../lib/progressService';
import {
  DbMaterial,
  getSecureMaterialAccess,
  getMaskedEmail,
  getFlagshipMaterial,
  getPreviewImages,
  PREVIEW_BUCKET,
  formatNaira,
  MaterialWithStatus,
} from '../lib/materialService';
import { checkDeviceSessionActive, revokeCurrentDeviceSession } from '../lib/deviceService';
// The Flutterwave Edge Functions (create-payment / verify-payment) stay in the
// codebase but are deliberately NOT invoked here. Checkout is now a manual bank
// transfer confirmed by an admin, so there is no automated payment trigger.
import { hasPendingClaim, submitPaymentClaim } from '../lib/fulfilmentService';
import { SecurePdfReader } from '../components/SecurePdfReader';
import { PreviewPdfPages } from '../components/PreviewPdfPages';
import {
  FALLBACK_MATERIAL_DESCRIPTION,
  FALLBACK_MATERIAL_TITLE,
} from '../lib/materialDefaults';

export interface MaterialProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

/**
 * TEST MODE — when true, the Unlock button opens the protected reader canvas
 * without a paid entitlement, so the reader chrome and the screenshot DRM can be
 * exercised without buying.
 *
 * CURRENTLY OFF. While true, any signed-in user reaches the reading canvas for
 * free — and the canvas can only ever show its empty state, because the Edge
 * Function still refuses to mint a signed URL without an entitlement. Turn it on
 * for local work only, and never on a deployed build. To see the real PDF, sign
 * in as an admin (the Edge Function bypasses the entitlement check for admins)
 * or grant a test account an entitlement.
 */
export const TEST_UNLOCK_READER = false;

/** LocalStorage key for a material's last-read page. Shared with SecurePdfReader. */
const progressKey = (materialId: string) => `eduvault_progress_${materialId}`;

/**
 * Instant local resume. The DB copy (reading_progress) is durable but needs a
 * round-trip; this is what lets the reader open on the right page immediately.
 * Wrapped in try/catch because storage throws in private mode and when site data
 * is blocked — a missing local copy must never break the reader.
 */
function readLocalProgress(materialId: string): number | null {
  try {
    const raw = localStorage.getItem(progressKey(materialId));
    if (!raw) return null;
    // Current format is { page, progressPct, totalPages }; legacy entries were a
    // bare number. Both are accepted.
    try {
      const parsed = JSON.parse(raw);
      const n = Number(parsed?.page ?? parsed);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  } catch {
    return null;
  }
}

function writeLocalProgress(materialId: string, page: number, totalPages: number): void {
  try {
    const progressPct =
      totalPages > 0 ? Math.min(100, Math.max(0, Math.round((page / totalPages) * 100))) : 0;
    localStorage.setItem(
      progressKey(materialId),
      JSON.stringify({ page, progressPct, totalPages }),
    );
  } catch {
    /* storage unavailable — the DB copy is the durable one */
  }
}

/**
 * Local mirror of the "I have made the transfer" flag.
 *
 * The access_logs row is the durable record an admin acts on; this local flag
 * keeps the banner pinned even if that insert was blocked (RLS, offline) or the
 * user is between sessions. It is cleared once an entitlement is active.
 */
const pendingTransferKey = (materialId: string) => `edu_pending_transfer_${materialId}`;

function readLocalPendingTransfer(materialId: string): boolean {
  try {
    return localStorage.getItem(pendingTransferKey(materialId)) === '1';
  } catch {
    return false;
  }
}

function writeLocalPendingTransfer(materialId: string): void {
  try {
    localStorage.setItem(pendingTransferKey(materialId), '1');
  } catch {
    /* storage unavailable — the DB claim still stands */
  }
}

function clearLocalPendingTransfer(materialId: string): void {
  try {
    localStorage.removeItem(pendingTransferKey(materialId));
  } catch {
    /* nothing to clear */
  }
}

/** Persistent per-material bookmark pages, shared with the reader toolbar. */
const bookmarksKey = (materialId: string) => `edu_reader_bookmarks_${materialId}`;

function readBookmarks(materialId: string): number[] {
  try {
    const raw = localStorage.getItem(bookmarksKey(materialId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

function writeBookmarks(materialId: string, pages: number[]): void {
  try {
    localStorage.setItem(bookmarksKey(materialId), JSON.stringify(pages));
  } catch {
    /* storage unavailable */
  }
}

/**
 * The single "Material" surface.
 *
 * Deliberately one component with two states rather than two routes:
 *   - not entitled -> the landing: two-page preview, then the ₦1,500 gate
 *   - entitled     -> the protected in-app reader, same URL, no navigation
 *
 * Guests get the public chrome (MainLayout); signed-in users get the dashboard
 * chrome, so the same page serves the storefront and the reader.
 */
export const Material: React.FC<MaterialProps> = ({ currentPath, onNavigate }) => {
  const { user } = useAuth();
  const { profile } = useProfile();

  const pathParts = currentPath.split('/');
  const materialIdFromUrl = pathParts.length > 2 && pathParts[2] ? pathParts[2] : null;

  // The reader is a separate route so an entitled student lands on the sample
  // preview first and mounts the canvas only when they click "Read Material".
  const wantsReader = currentPath.replace(/\/+$/, '').endsWith('/read');

  const userName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Authorized Student';
  const userEmailMasked = getMaskedEmail(user?.email || profile?.email);

  const [material, setMaterial] = useState<DbMaterial | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // The real page count, reported by SecurePdfReader from the document itself.
  // Starts at 1 — never a fabricated total.
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bookmarkedPages, setBookmarkedPages] = useState<number[]>([]);
  const [readerState, setReaderState] = useState<'loading' | 'entitled' | 'active' | 'denied' | 'error'>('loading');
  const [denialReason, setDenialReason] = useState<string>('not_authenticated');
  const [denialMessage, setDenialMessage] = useState<string>('Please log in to continue.');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readerTheme, setReaderTheme] = useState<'light' | 'sepia' | 'dark'>('dark');
  const [resumedNotice, setResumedNotice] = useState<boolean>(false);
  // Server-minted signed URL for the material's real `file_path`, returned by the
  // get-secure-material Edge Function (service_role signed, 60s TTL). Deliberately
  // NEVER minted client-side: the bucket is private and clients hold no storage
  // SELECT policy, so a free account cannot sign its own URL for a paid PDF.
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [screenshotCount, setScreenshotCount] = useState<number>(0);
  // Strikes 1 and 2 only. There is no "fatal" variant: the third strike is a
  // hard lock rendered as a page, not a dialog.
  const [screenshotModal, setScreenshotModal] = useState<{
    title: string;
    message: string;
  } | null>(null);
  // Third screenshot strike: the account is suspended and the session revoked.
  // This is a terminal screen, not a dismissible dialog.
  const [hardLocked, setHardLocked] = useState(false);

  // Catalogue entry for the locked view, which doubles as the material landing.
  const [gateMaterial, setGateMaterial] = useState<MaterialWithStatus | null>(null);
  const [gateLoading, setGateLoading] = useState(false);

  // Checkout — ported from the old Materials page so the unified view can take
  // payment without navigating to a second route.
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Set once they tell us they have transferred; drives the pinned banner.
  const [pendingClaim, setPendingClaim] = useState(false);

  // ---- WPS reader toolbar state ----
  const [pageInput, setPageInput] = useState('1');
  const [requestedPage, setRequestedPage] = useState<{ page: number; token: number } | null>(null);
  const [requestedFit, setRequestedFit] = useState<{ mode: 'page' | 'width'; token: number } | null>(null);
  const [fitMode, setFitMode] = useState<'page' | 'width'>('page');
  const [continuous, setContinuous] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRequest, setSearchRequest] = useState<{ query: string; token: number } | null>(null);
  const [searchResult, setSearchResult] = useState<string | null>(null);

  const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400, 500];

  const jumpToPage = (n: number) => {
    const target = Math.min(totalPages, Math.max(1, Math.floor(n) || 1));
    setRequestedPage({ page: target, token: Date.now() });
  };

  // Keep the page field in step with actual navigation.
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const validationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastScreenshotAttemptRef = useRef<number>(0);
  // True while the PDF canvas is mounted. Used to keep background checks from
  // dropping into the 'loading' branch, which unmounts SecurePdfReader and
  // destroys the canvas, scroll position and rendered page.
  const readerActiveRef = useRef(false);
  // True once the access chain has resolved to a usable state (entitled landing
  // or the live reader). Background rechecks must not flash the loading screen.
  const readerResolvedRef = useRef(false);
  const fullscreenStageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    readerActiveRef.current = readerState === 'active';
    readerResolvedRef.current = readerState === 'active' || readerState === 'entitled';
  }, [readerState]);

  // Request the native Fullscreen API on the chrome-free stage once it is in
  // the DOM. The overlay already replaces the dashboard layout, so this removes
  // the browser chrome as well.
  useEffect(() => {
    if (isFullscreen && !document.fullscreenElement) {
      fullscreenStageRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, [isFullscreen]);

  // Lock outer page scrolling while the WPS reader is mounted: wheel/touch
  // gestures must move the PDF body only, never the document behind it.
  useEffect(() => {
    if (readerState !== 'active') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [readerState]);

  // Restore persistent bookmarks for this material.
  useEffect(() => {
    const id = material?.id || gateMaterial?.id || materialIdFromUrl;
    if (id) setBookmarkedPages(readBookmarks(id));
  }, [material?.id, gateMaterial?.id, materialIdFromUrl]);

  const handleScreenshotAttempt = async (source: string) => {
    if (readerState !== 'active' || !user) return;
    const now = Date.now();
    if (now - lastScreenshotAttemptRef.current < 4000) {
      // Cooldown / debounce (4 seconds) to prevent duplicate counting
      return;
    }
    lastScreenshotAttemptRef.current = now;

    const newCount = screenshotCount + 1;
    setScreenshotCount(newCount);

    const eventType = newCount >= 3 ? 'screenshot_limit_exceeded' : 'screenshot_detected';
    try {
      await supabase.rpc('log_security_event', {
        p_event_type: eventType,
        p_material_id: material?.id || null,
        p_metadata: { attempt: newCount, source },
      });
    } catch (e) {
      console.error('Failed to log security event:', e);
    }

    // Strikes 1 and 2: a full-screen warning. Strike 3 locks the account.
    if (newCount < 3) {
      setScreenshotModal({
        title: newCount === 1 ? 'Security warning' : 'Final warning',
        message:
          newCount === 1
            ? '⚠️ Warning (Strike 1/3): Screenshot attempt detected. Content is DRM protected.'
            : '🚨 Final Warning (Strike 2/3): Next attempt will permanently deactivate your access!',
      });
      return;
    }

    try {
      await supabase.rpc('log_security_event', {
        p_event_type: 'device_session_revoked',
        p_material_id: material?.id || null,
        p_metadata: { reason: 'screenshot_limit_exceeded' },
      });

      // Suspend the ACCOUNT, not just the device. A device-only lock is
      // trivially bypassed by clearing localStorage, which mints a fresh
      // device identifier — so the lock has to live on the profile. This is a
      // SECURITY DEFINER RPC because a student cannot write profiles.status.
      await supabase.rpc('suspend_account_screenshot_abuse');

      // Withdraw paid book access as well. `entitlements` is admin-write only,
      // so this runs through a SECURITY DEFINER RPC; the direct update is a
      // degraded fallback for deployments where the migration is not applied
      // (RLS will reject it, which is harmless).
      const { error: revokeErr } = await supabase.rpc('revoke_my_entitlements_on_abuse');
      if (revokeErr) {
        await supabase
          .from('entitlements')
          .update({ status: 'revoked' })
          .eq('user_id', user.id);
      }

      await revokeCurrentDeviceSession();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error locking session on screenshot limit:', err);
    }

    // Close the reader immediately: drop the signed URL so the canvas cannot
    // keep rendering, then present the terminal suspension notice.
    setSignedPdfUrl(null);
    setReaderState('denied');
    setDenialReason('account_suspended');
    setDenialMessage('Your account was suspended after repeated capture attempts.');
    setScreenshotModal(null);
    setHardLocked(true);
  };

  // Screenshot and print shortcut listeners
  useEffect(() => {
    if (readerState !== 'active') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        handleScreenshotAttempt('print_screen_key');
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handleScreenshotAttempt('print_shortcut');
      }
      // macOS screen-capture shortcuts (Cmd+Shift+3/4/5). The OS usually wins
      // the race and still captures, but the keydown fires often enough to
      // register the attempt — this is detection, not prevention, and the
      // watermark plus the three-strike lock are the real deterrents.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        handleScreenshotAttempt('macos_screenshot_shortcut');
      }
    };

    const handleBeforePrint = (e: Event) => {
      e.preventDefault();
      handleScreenshotAttempt('browser_print_dialog');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, [readerState, screenshotCount, material, user]);

  // Initialize and authorize secure reader session
  const initializeReader = async () => {
    // NEVER show the "securing your session" screen over a live canvas. A
    // background revalidation while the student is reading must not remount
    // SecurePdfReader — that is the auto-reload/flicker bug.
    if (!readerResolvedRef.current) setReaderState('loading');
    setResumedNotice(false);

    if (!user) {
      setReaderState('denied');
      setDenialReason('not_authenticated');
      setDenialMessage('Please log in to continue.');
      return;
    }

    let targetId = materialIdFromUrl;

    // No id in the URL: open the book this user actually OWNS. Resolving the
    // newest catalogue row first is what sent entitled owners of an older book
    // back to the paywall even though their entitlement was active.
    if (!targetId) {
      const { data: entRow } = await supabase
        .from('entitlements')
        .select('material_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      targetId = entRow?.material_id ?? null;
    }

    // Still unresolved (no entitlement): fall back to the flagship catalogue
    // entry, read from materials_public — the base table is not readable here.
    if (!targetId) {
      const { data: materialRow, error: matErr } = await supabase
        .from('materials_public')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (matErr) {
        // Surface the real cause instead of "not available": a permissions or
        // schema error here must not masquerade as an unpublished material.
        setReaderState('denied');
        setDenialReason('error');
        setDenialMessage(`The book catalogue could not be loaded: ${matErr.message}`);
        return;
      }

      if (!materialRow) {
        setReaderState('denied');
        setDenialReason('material_unpublished');
        setDenialMessage('This material is not currently available.');
        return;
      }
      targetId = materialRow.id;
    }

    // Perform complete secure access authorization chain
    const accessResult = await getSecureMaterialAccess(targetId);

    if (!accessResult.success || !accessResult.material || !accessResult.signedUrl) {
      // A transient transport failure must not eject a student who is already
      // reading. Genuine revocations/expiry still lock immediately.
      if (readerActiveRef.current && accessResult.denialReason === 'error') return;

      // No auto-jump in any mode. With TEST_UNLOCK_READER on, the bypass is
      // honoured at handleUnlockClick instead, so a tester still sees the real
      // pre-purchase landing first. With it off (the current setting) this is
      // simply the paywall: no entitlement means the landing and the ₦1,500 gate,
      // and the reader is unreachable without a signed URL.
      setReaderState('denied');
      setDenialReason(accessResult.denialReason || 'error');
      setDenialMessage(accessResult.errorMessage || 'Access denied to this material.');
      return;
    }

    const wasActive = readerActiveRef.current;

    setMaterial(accessResult.material);
    // Keep the URL already loaded in the canvas. Replacing it changes the
    // SecurePdfReader `url` prop and re-runs getDocument(), wiping the rendered
    // page for no reason.
    if (!wasActive) setSignedPdfUrl(accessResult.signedUrl || null);

    if (!wasActive) {
      const { progress } = await getReadingProgress(user.id, accessResult.material.id);
      // Resume from whichever source is further along: the local copy is instant and
      // survives a flaky connection, the DB copy is authoritative across devices.
      const localPage = readLocalProgress(accessResult.material.id) ?? 0;
      const dbPage = Number(progress?.current_page ?? 0);
      const resumePage = Math.max(localPage, dbPage);
      if (resumePage > 1) {
        setCurrentPage(Math.min(totalPages, Math.max(1, resumePage)));
        setResumedNotice(true);
        setTimeout(() => setResumedNotice(false), 5000);
      } else {
        setCurrentPage(1);
      }
    }

    // Entitled users land on the sample preview with a Read Material button;
    // only the /material/:id/read route mounts the secure canvas.
    setReaderState(wantsReader ? 'active' : 'entitled');
  };

  useEffect(() => {
    initializeReader();
  }, [currentPath, user]);

  // The locked view doubles as the material landing page, so it needs the
  // catalogue entry (title, preview photos, price) even though the secure-access
  // chain above has just refused the protected document. Read from
  // materials_public via getFlagshipMaterial — never the base table.
  useEffect(() => {
    if (readerState !== 'denied' && readerState !== 'entitled') return;

    let cancelled = false;
    (async () => {
      setGateLoading(true);
      const { material } = await getFlagshipMaterial(user?.id);
      if (!cancelled) {
        setGateMaterial(material);
        setGateLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [readerState, user]);

  // Pin the "send your receipt" banner while a transfer is waiting on confirmation.
  // It disappears on its own once the admin grants access: the reader moves to
  // 'active', and this effect clears the flag (DB claim + local mirror).
  useEffect(() => {
    // Only an ACTIVE session means the book was activated. 'loading' must not
    // clear the flag — this effect runs at mount, before the access chain has
    // resolved, and the student's local pending marker would vanish.
    if (readerState === 'active') {
      setPendingClaim(false);
      const activeId = material?.id || gateMaterial?.id || materialIdFromUrl;
      if (activeId) clearLocalPendingTransfer(activeId);
      return;
    }

    if (readerState !== 'denied') return;

    const id = materialIdFromUrl || gateMaterial?.id;
    if (!id) return;

    let cancelled = false;

    // Local mirror first — instant, and survives a failed claim insert.
    if (readLocalPendingTransfer(id)) setPendingClaim(true);

    (async () => {
      const pending = await hasPendingClaim(id);
      if (!cancelled && pending) setPendingClaim(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [readerState, gateMaterial?.id, materialIdFromUrl, material?.id]);

  // Watch the student's entitlement row in both directions. While waiting on an
  // admin, activation opens the reader in place; while reading, deactivation
  // locks it on the next event rather than waiting for the 3-minute re-check.
  useEffect(() => {
    if (!user || hardLocked) return;

    const channel = supabase
      .channel(`entitlement-watch:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entitlements',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const status = payload?.new?.status;

          // Drop the pending banner the instant an ACTIVE row appears.
          if (status === 'active') {
            setPendingClaim(false);
            const activeId = materialIdFromUrl || gateMaterial?.id;
            if (activeId) clearLocalPendingTransfer(activeId);
          }

          // While the canvas is live, NEVER re-run the access chain: initialize-
          // Reader would replace state and remount SecurePdfReader (the flicker
          // and lost-page bug). A revocation is applied directly instead.
          if (readerActiveRef.current) {
            if (status && status !== 'active') {
              setSignedPdfUrl(null);
              setReaderState('denied');
              setDenialReason('entitlement_expired');
              setDenialMessage('Your access to this material has expired or been revoked.');
            }
            return;
          }

          initializeReader();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, readerState, hardLocked]);

  // Polling fallback for the banner wait. Realtime must be enabled on the
  // `entitlements` table to deliver the event above; if it is not, this still
  // opens the reader within 20 seconds of activation. It only re-initializes
  // when an ACTIVE row exists, so the waiting screen never flickers.
  useEffect(() => {
    if (!pendingClaim || readerState !== 'denied' || !user) return;

    const id = materialIdFromUrl || gateMaterial?.id;
    if (!id) return;

    const timer = setInterval(async () => {
      const { data } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', user.id)
        .eq('material_id', id)
        .eq('status', 'active')
        .maybeSingle();

      if (data) {
        // Polling fallback detected activation: unmount the banner immediately,
        // then re-authorize the reader.
        setPendingClaim(false);
        clearLocalPendingTransfer(id);
        initializeReader();
      }
    }, 20000);

    return () => clearInterval(timer);
  }, [pendingClaim, readerState, user, materialIdFromUrl, gateMaterial?.id]);

  // Flutterwave return handling was retired with the switch to manual bank
  // transfer. verify-payment and create-payment remain in the codebase (dormant)
  // but nothing on this page invokes them. A stale ?tx_ref= link now does
  // nothing rather than triggering an Edge Function call.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('status') || params.has('tx_ref') || params.has('transaction_id')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);


  const handleUnlockClick = () => {
    // A guest needs an account before a payment record can exist.
    if (!user) {
      onNavigate('/signup');
      return;
    }

    // Test mode: skip the payment round-trip and open the reader canvas directly.
    // The bypass is client-side only — the get-secure-material Edge Function still
    // refuses to mint a signed URL without an entitlement, so the canvas shows its
    // placeholder pages rather than the real PDF. Only a real entitlement renders
    // the document.
    if (TEST_UNLOCK_READER) {
      if (!material && gateMaterial) setMaterial(gateMaterial);
      setReaderState('active');
      return;
    }

    setPaymentError(null);
    setPurchaseModalOpen(true);
  };

  // Bank transfer is the only checkout. The Flutterwave Edge Functions stay in
  // the codebase (dormant) but are no longer called from this button.
  const BANK_DETAILS = [
    { key: 'bank', label: 'Bank name', value: 'OPay' },
    { key: 'account', label: 'Account number', value: '8074829070' },
    { key: 'name', label: 'Account name', value: 'VICTOR OLATUNJI OLUWAFIKAYO' },
    { key: 'amount', label: 'Amount', value: '₦1,500' },
  ];

  const WHATSAPP_LINK =
    'https://wa.me/2348074829070?text=Hello%2C%20I%20have%20transferred%20%E2%82%A61%2C500%20for%20book%20access.';

  const copyToClipboard = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, denied permission). The value
      // is visible on screen either way, so this is not worth an error banner.
    }
  };

  const handleConfirmTransfer = async () => {
    const materialId = gateMaterial?.id || material?.id;
    if (!materialId) {
      setPaymentError('No material is selected.');
      return;
    }

    setIsSubmittingTransfer(true);
    setPaymentError(null);

    const res = await submitPaymentClaim(
      materialId,
      'BANK-TRANSFER',
      'Student confirmed a bank transfer of ₦1,500; receipt to follow on WhatsApp',
    );

    setIsSubmittingTransfer(false);

    if (!res.success) {
      // Keep the dialog open: the claim is what the admin acts on, so the
      // student should know it was not recorded and can retry or message the
      // receipt directly.
      setPaymentError(
        res.error ||
          'We could not record your transfer notification. Please send your receipt on WhatsApp.',
      );
      return;
    }

    // Local mirror so the banner stays pinned even after a reload.
    writeLocalPendingTransfer(materialId);
    setPurchaseModalOpen(false);
    setPendingClaim(true);

    // Back to the reader surface. If the URL already names this material, the
    // realtime entitlement watcher handles the unlock; otherwise navigating
    // re-runs the access chain.
    const readerPath = `/material/${materialId}`;
    if (currentPath !== readerPath) {
      onNavigate(readerPath);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Periodic session validation (every 3 minutes) while reading
  useEffect(() => {
    if (readerState !== 'active' || !user) return;

    validationIntervalRef.current = setInterval(async () => {
      const deviceCheck = await checkDeviceSessionActive();
      if (deviceCheck.revoked) {
        setReaderState('denied');
        setDenialReason('device_revoked');
        setDenialMessage('Your session is no longer authorized on this device.');
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle();

      if (!prof || prof.status !== 'active') {
        setReaderState('denied');
        setDenialReason('account_suspended');
        setDenialMessage('Your account is currently suspended.');
        return;
      }

      if (material && profile?.role !== 'admin') {
        const { data: ent } = await supabase
          .from('entitlements')
          .select('status, expires_at')
          .eq('user_id', user.id)
          .eq('material_id', material.id)
          .eq('status', 'active')
          .maybeSingle();

        if (!ent || (ent.expires_at && new Date(ent.expires_at) <= new Date())) {
          setReaderState('denied');
          setDenialReason('entitlement_expired');
          setDenialMessage('Your access to this material has expired or been revoked.');
          return;
        }
      }
    }, 180000); // 3 minutes

    return () => {
      if (validationIntervalRef.current) {
        clearInterval(validationIntervalRef.current);
      }
    };
  }, [readerState, user, material, profile]);

  // Revalidate when the tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && readerState === 'active' && user) {
        const deviceCheck = await checkDeviceSessionActive();
        if (!deviceCheck.active) {
          setReaderState('denied');
          setDenialReason('device_revoked');
          setDenialMessage('Your session is no longer authorized on this device.');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [readerState, user]);

  // Debounced progress saving when currentPage changes
  useEffect(() => {
    if (readerState !== 'active' || !material || !user) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      // Local copy first — this is what restores instantly on the next visit with
      // no round-trip. The DB write stays the durable, cross-device record.
      writeLocalProgress(material.id, currentPage, totalPages);
      await saveReadingProgress(user.id, material.id, currentPage, totalPages);
    }, 600);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [currentPage, material, user, readerState]);

  // No hardcoded table of contents. The reader labels pages from `totalPages`, and
  // the real document structure comes from the PDF itself. The previous fixed
  // chapter list ("1.1 Introduction & Asymptotic Bounds"…) was fabricated text for
  // a document we never read, and read convincingly enough to be mistaken for the
  // actual study guide.

  const toggleBookmark = (page: number) => {
    const next = bookmarkedPages.includes(page)
      ? bookmarkedPages.filter((p) => p !== page)
      : [...bookmarkedPages, page];
    setBookmarkedPages(next);

    // Persisted per material so bookmarks survive reloads and device restarts.
    const id = material?.id || gateMaterial?.id || materialIdFromUrl;
    if (id) writeBookmarks(id, next);
  };

  const isBookmarked = bookmarkedPages.includes(currentPage);

  const handleZoomIn = () => setZoom((prev) => Math.min(500, prev + 25));
  const handleZoomOut = () => setZoom((prev) => Math.max(25, prev - 25));

  // Fullscreen is a state change first: it renders a chrome-free overlay that
  // contains ONLY the reader, then requests the native API on that overlay.
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // Keep our state in step with the browser's own Esc/F11 exit.
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Guests get the public chrome, signed-in users the dashboard chrome — the
  // same page serves both the storefront and the reader.
  const withShell = (children: React.ReactNode) =>
    user ? (
      <DashboardLayout currentPath={currentPath} onNavigate={onNavigate}>
        {children}
      </DashboardLayout>
    ) : (
      <MainLayout currentPath={currentPath} onNavigate={onNavigate}>
        {children}
      </MainLayout>
    );

  // Shared 2-page sample preview — shown to BOTH unactivated visitors (above the
  // paywall) and activated students (above Read Material). Read from the public
  // catalogue, never the base table.
  // Support both the array column (preview_images) and any legacy per-page URL
  // columns, so an admin can supply preview pages either way.
  const legacyPreviewImages = [
    (gateMaterial as any)?.preview_page_1_url,
    (gateMaterial as any)?.preview_page_2_url,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  const previewImages =
    legacyPreviewImages.length > 0 ? legacyPreviewImages : getPreviewImages(gateMaterial);
  const previewHeading =
    readerState === 'entitled' ? 'Sample preview' : 'Read the first two pages free';

  const previewSection = gateLoading ? (
    <div className="flex flex-col items-center gap-3 py-16">
      <RefreshCw className="h-5 w-5 animate-spin text-gold" />
      <p className="text-xs text-ink-muted">Loading preview…</p>
    </div>
  ) : previewImages.length > 0 ? (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileText className="h-4 w-4 text-gold" />
          {previewHeading}
        </h2>
        <span className="text-xs text-ink-faint">
          {readerState === 'entitled' ? 'Pages 1–2' : 'No account needed'}
        </span>
      </div>

      {/* Stacked like a document rather than a gallery — page 1, then page 2,
          in a centred column. `w-full h-auto` with no fixed height keeps the
          page crisp and undistorted from phone width up to desktop. */}
      <div className="mx-auto grid w-full max-w-3xl gap-8 sm:grid-cols-2">
        {previewImages.slice(0, 2).map((url, idx) => (
          <figure key={url} className="space-y-3">
            <figcaption className="flex items-center justify-between border-b border-line-strong pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Page {idx + 1}
              </span>
              <span className="text-xs text-ink-faint">Free sample</span>
            </figcaption>
            <div className="overflow-hidden rounded-lg border border-line-strong bg-surface-deep">
              <img
                src={url}
                alt={`${gateMaterial?.title || 'Material'} — preview page ${idx + 1}`}
                loading={idx === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="block h-auto w-full object-contain"
              />
            </div>
          </figure>
        ))}
      </div>
    </section>
  ) : gateMaterial?.id ? (
    // No uploaded preview images: fall back to a PUBLIC 2-page sample PDF kept
    // in the preview bucket. The protected paid PDF is never used here — an
    // unentitled visitor has no signed URL for it, by design.
    <PreviewPdfPages
      url={
        supabase.storage
          .from(PREVIEW_BUCKET)
          .getPublicUrl(`previews/${gateMaterial.id}/sample.pdf`).data.publicUrl
      }
    />
  ) : (
    <div className="rounded-lg border border-line-strong bg-surface-deep py-16 text-center">
      <FileText className="mx-auto mb-2 h-5 w-5 text-ink-faint" />
      <p className="text-xs text-ink-muted">Preview pages are being prepared.</p>
    </div>
  );

  const purchaseModal = (
    <Modal
      isOpen={purchaseModalOpen}
      onClose={() => setPurchaseModalOpen(false)}
      title="Pay by bank transfer"
      maxWidth="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setPurchaseModalOpen(false)}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmTransfer}
            isLoading={isSubmittingTransfer}
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
          >
            I Have Made the Transfer
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
          <Landmark className="h-5 w-5 text-gold" />
        </div>

        <div className="space-y-1 text-center">
          <h4 className="text-base font-semibold text-ink">
            {gateMaterial?.title || material?.title}
          </h4>
          <p className="text-sm text-ink-muted">
            One payment of{' '}
            <span className="font-semibold text-gold">
              {formatNaira(gateMaterial?.price ?? material?.price)}
            </span>
            . Lifetime access to the complete guide.
          </p>
        </div>

        {/* Transfer details — every row is one-tap copyable. */}
        <dl className="overflow-hidden rounded-lg border border-line-strong bg-surface-deep">
          {BANK_DETAILS.map((item, idx) => (
            <div
              key={item.key}
              className={`flex items-center justify-between gap-4 px-4 py-3 ${
                idx > 0 ? 'border-t border-line' : ''
              }`}
            >
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  {item.label}
                </dt>
                <dd
                  className={`truncate text-sm font-semibold ${
                    item.key === 'amount' ? 'tabular-nums text-gold' : 'text-ink'
                  }`}
                >
                  {item.value}
                </dd>
              </div>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(item.key, item.key === 'amount' ? '1500' : item.value)
                }
                aria-label={`Copy ${item.label}`}
                title={`Copy ${item.label}`}
                className="shrink-0 rounded-md border border-line-strong bg-overlay p-2 text-ink-muted transition-colors hover:border-gold/40 hover:text-gold"
              >
                {copiedKey === item.key ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </dl>

        <div className="rounded-lg border border-gold/30 bg-gold/10 p-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Transfer <strong className="font-semibold text-ink">₦1,500</strong> to the account
            above, then send your transfer receipt to{' '}
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-gold hover:underline"
            >
              08074829070
            </a>{' '}
            on WhatsApp or SMS for instant book activation.
          </p>
        </div>

        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-overlay px-4 py-2.5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-ink-faint hover:bg-overlay-strong"
        >
          <MessageCircle className="h-4 w-4 text-gold" />
          Send Receipt on WhatsApp
        </a>

        {paymentError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-ink-soft">
            {paymentError}
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-md border border-info/30 bg-info/10 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <span className="text-xs leading-relaxed text-ink-muted">
            Once your receipt is confirmed, an administrator activates this book for your
            account. Your secure reader, watermark and screenshot protection are unchanged.
          </span>
        </div>
      </div>
    </Modal>
  );

  // Terminal state after the third screenshot strike. Rendered before any other
  // branch because the account is suspended and the session already revoked —
  // there is nothing else this user can do on this page.
  if (hardLocked) {
    return withShell(
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-danger/30 bg-danger/10">
          <Lock className="h-6 w-6 text-danger" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-ink">Account locked</h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            Your session was locked after repeated attempts to capture protected material. This
            guide is licensed to you alone and may not be copied, photographed or shared.
          </p>
        </div>

        <div className="w-full rounded-lg border border-danger/30 bg-danger/10 p-4 text-left">
          <p className="mb-1 text-sm font-semibold text-danger">Your access has been withdrawn</p>
          <p className="text-sm leading-relaxed text-ink-soft">
            This account is suspended and the device session revoked. To request reinstatement,
            contact EduVault support and quote the email address on your account.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button variant="primary" onClick={() => onNavigate('/help')}>
            Contact support
          </Button>
          <Button variant="secondary" onClick={() => onNavigate('/')}>
            Back to home
          </Button>
        </div>

        <p className="text-xs text-ink-faint">
          This lock has been recorded in the security audit log.
        </p>
      </div>
    );
  }

  if (readerState === 'loading') {
    return withShell(
      <div className="mx-auto max-w-4xl space-y-5 py-24 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-line-strong bg-canvas">
          <RefreshCw className="h-5 w-5 animate-spin text-gold" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-ink">Securing your reading session…</h2>
          <p className="text-sm text-ink-muted">
            Verifying credentials, device session, entitlements, and the private storage stream.
          </p>
        </div>
      </div>
    );
  }

  if (readerState === 'denied') {
    const price = formatNaira(gateMaterial?.price);
    const needsAccount = !user;
    // A signed-in student who simply has not paid sees an offer; anyone else
    // (suspended, revoked device) sees the reason and a next step instead.
    const isPurchaseable =
      !needsAccount &&
      (denialReason === 'no_entitlement' || denialReason === 'entitlement_expired');
    const canUnlock = needsAccount || isPurchaseable;

    return withShell(
      <>
        <div className="mx-auto max-w-4xl space-y-8 py-10">

          {pendingClaim && (
            <div className="sticky top-0 z-30 flex items-start gap-3 rounded-lg border border-gold/40 bg-surface/95 p-4 shadow-lg backdrop-blur-md">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <div className="text-sm leading-relaxed text-ink-soft">
                <strong className="mb-0.5 block font-semibold text-ink">
                  Transfer notification received!
                </strong>
                Please send your payment receipt to{' '}
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-gold hover:underline"
                >
                  08074829070
                </a>{' '}
                on WhatsApp to activate your book access.
              </div>
            </div>
          )}

          <div className="space-y-3 border-b border-line-strong pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isPurchaseable ? 'gold' : 'danger'} size="sm">
                <Lock className="h-3 w-3" />
                {isPurchaseable ? 'Locked' : 'Access restricted'}
              </Badge>
              {gateMaterial?.category && (
                <Badge variant="neutral" size="sm">{gateMaterial.category}</Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {gateMaterial?.title || FALLBACK_MATERIAL_TITLE}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
              {isPurchaseable
                ? 'Read the two free sample pages below, then unlock the complete guide to keep reading right here.'
                : denialMessage}
            </p>
          </div>

          {/* The same two-page preview everyone gets, paid or not. */}
          {previewSection}

          {/* Unlock gate, directly below the preview. */}
          <Card padding="lg" className="space-y-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-ink">
                  {isPurchaseable ? 'Unlock the complete guide' : 'You cannot open this material yet'}
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-ink-muted">
                  {isPurchaseable
                    ? 'Every remaining page opens instantly on this page. One payment, lifetime access — no subscription.'
                    : denialMessage}
                </p>
              </div>

              <div className="shrink-0 space-y-3 sm:w-64">
                {isPurchaseable && (
                  <div className="flex items-baseline justify-between rounded-md border border-line-strong bg-surface-deep px-4 py-3">
                    <span className="text-sm text-ink-muted">One-time</span>
                    <span className="text-2xl font-semibold tabular-nums text-gold">{price}</span>
                  </div>
                )}

                {canUnlock ? (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={needsAccount ? () => onNavigate('/signup') : handleUnlockClick}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    {needsAccount ? 'Create a free account' : `Pay ${price}`}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={initializeReader}
                    leftIcon={<RefreshCw className="h-4 w-4" />}
                  >
                    Try again
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
        {purchaseModal}
      </>
    );
  }

  // Entitled landing: the 2-page sample preview plus the launch button. The
  // canvas is NOT mounted here — that happens only on /material/:id/read, so
  // the preview stays a fast, static page and the reader initializes cleanly.
  if (readerState === 'entitled') {
    const entitledId = material?.id || gateMaterial?.id || materialIdFromUrl;
    const title = material?.title || gateMaterial?.title || FALLBACK_MATERIAL_TITLE;
    const description =
      material?.description || gateMaterial?.description || FALLBACK_MATERIAL_DESCRIPTION;

    return withShell(
      <div className="mx-auto max-w-4xl space-y-8 py-10">
        <div className="space-y-3 border-b border-line-strong pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="green" size="sm">
              <CheckCircle2 className="h-3 w-3" />
              Unlocked
            </Badge>
            {gateMaterial?.category && (
              <Badge variant="neutral" size="sm">
                {gateMaterial.category}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
          )}
          <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
            Your access is active. Open the secure reader to continue through the complete guide.
          </p>
        </div>

        {/* Activated readers never see the sample preview — they own the book. */}
        <Card padding="lg" className="space-y-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-ink">Open the secure reader</h2>
              <p className="max-w-md text-sm leading-relaxed text-ink-muted">
                The full guide opens in the protected canvas with watermarking, pagination and
                screenshot protection.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => entitledId && onNavigate(`/material/${entitledId}/read`)}
              disabled={!entitledId}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Read Material
            </Button>
          </div>
        </Card>
      </div>,
    );
  }

  // Reading-surface themes are a comfort feature (like an e-reader). The app
  // chrome around them is always dark; only the page itself changes. These use
  // explicit values rather than brand tokens because they are content colours,
  // not part of the dark UI palette.
  const themeClasses = {
    dark:  'bg-surface-deep text-ink-soft',
    sepia: 'bg-[#F7F1E3] text-[#4A3B2A]',
    light: 'bg-[#F8FAFC] text-[#0F172A]',
  }[readerTheme];

  // Distraction-free mode: no DashboardLayout, no sidebar, no top nav — only
  // the canvas (plus the DRM watermark and a minimal exit control).
  if (isFullscreen) {
    return (
      <div
        ref={fullscreenStageRef}
        data-reader-scroll
        className="fixed inset-0 z-[100] flex min-h-screen w-screen flex-col overflow-auto bg-canvas"
      >
        <div className="relative flex min-h-screen w-full flex-col p-2">
          <div className="pointer-events-none absolute inset-0 z-10 flex select-none flex-col items-center justify-center space-y-16 opacity-[0.04] [transform:rotate(-25deg)]">
            <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
              LICENSED TO: {userName.toUpperCase()} • {userEmailMasked.toUpperCase()}
            </div>
            <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
              EDUVAULT SECURE STREAM • AUTHORIZED DEVICE SESSION
            </div>
            <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
              LICENSED TO: {userName.toUpperCase()} • {userEmailMasked.toUpperCase()}
            </div>
          </div>

          <div className="relative z-0 min-h-0 w-full flex-1 overflow-hidden">
            {signedPdfUrl ? (
              <SecurePdfReader
                url={signedPdfUrl}
                materialId={material?.id || 'unknown'}
                title={material?.title || undefined}
                zoomPercent={zoom}
                onZoomChange={setZoom}
                requestedFit={requestedFit}
                requestedPage={requestedPage}
                continuous={continuous}
                searchRequest={searchRequest}
                onSearchResult={setSearchResult}
                onPageChange={(p, total) => {
                  setCurrentPage(p);
                  setTotalPages(total);
                }}
              />
            ) : (
              <div className="flex min-h-[60vh] items-center justify-center text-sm text-ink-muted">
                Preparing the secure document…
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="fixed right-4 top-4 z-20 rounded-md border border-line-strong bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink shadow-lg backdrop-blur"
          >
            Exit fullscreen
          </button>
        </div>
      </div>
    );
  }

  // WPS-style reader: the viewport IS the reader. No DashboardLayout, no
  // sidebar, no app header — only the minimal control bar and the canvas.
  return (
    <div className="fixed inset-0 flex h-screen w-screen flex-col overflow-hidden overscroll-none bg-canvas">
      {/* Slim title bar — title is centred between Back and the session badge */}
      <header className="relative z-30 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line-strong bg-surface px-3 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate(`/material/${material?.id || materialIdFromUrl || ''}`)}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          Back
        </Button>
        <span className="truncate text-center text-sm font-semibold text-ink">
          {material?.title || gateMaterial?.title || FALLBACK_MATERIAL_TITLE}
        </span>
        <div className="flex justify-end">
          <Badge variant="green" size="sm">Session active</Badge>
        </div>
      </header>

      {/* Single-line WPS toolbar */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-line-strong bg-surface-deep px-3 py-1.5">
        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
          >
            Previous
          </Button>
          <span className="text-xs text-ink-muted">Page</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                jumpToPage(Number(pageInput));
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Page number"
            className="w-14 rounded border border-line-strong bg-canvas px-1.5 py-1 text-center text-xs tabular-nums text-ink focus:border-gold focus:outline-none"
          />
          <span className="text-xs tabular-nums text-ink-muted">of {totalPages}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
          >
            Next
          </Button>
        </div>

        <span className="mx-1 h-4 w-px bg-line-strong" />

        {/* Streamlined zoom + the single fit mode */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleZoomOut} aria-label="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <select
            value={String(zoom)}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom level"
            className="rounded border border-line-strong bg-canvas px-1.5 py-1 text-xs tabular-nums text-ink focus:border-gold focus:outline-none"
          >
            {!ZOOM_PRESETS.includes(zoom) && <option value={zoom}>{zoom}%</option>}
            {ZOOM_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}%
              </option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={handleZoomIn} aria-label="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setZoom(100);
              setRequestedFit({ mode: 'width', token: Date.now() });
            }}
          >
            Fit Width
          </Button>
        </div>

        <span className="mx-1 h-4 w-px bg-line-strong" />

        {/* View tools */}
        <div className="flex items-center gap-1">
          <Button
            variant={sidebarOpen ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSidebarOpen((open) => !open)}
            leftIcon={<PanelLeft className="h-3.5 w-3.5" />}
          >
            Pages
          </Button>
          <Button
            variant={searchOpen ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setSearchOpen((open) => !open)}
            leftIcon={<Search className="h-3.5 w-3.5" />}
          >
            Search
          </Button>
        </div>
      </div>

      {searchOpen && (
        <div className="relative z-20 flex shrink-0 items-center gap-2 border-b border-line-strong bg-surface px-3 py-1.5">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!searchQuery.trim()) return;
                setSearchResult(null);
                setSearchRequest({ query: searchQuery.trim(), token: Date.now() });
              }
            }}
            placeholder="Search in document… (Enter)"
            className="w-64 rounded border border-line-strong bg-canvas px-2 py-1 text-xs text-ink placeholder-ink-faint focus:border-gold focus:outline-none"
          />
          {searchResult && <span className="text-xs text-ink-muted">{searchResult}</span>}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 bg-slate-950">
        {/* Sidebar / page thumbnail rail */}
        {sidebarOpen && (
          <aside className="pdf-scroll-container z-20 w-32 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900 p-2">
            <div className="space-y-1">
              {Array.from({ length: Math.max(totalPages, 1) }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => jumpToPage(n)}
                  className={`block w-full rounded px-2 py-1.5 text-left text-xs tabular-nums transition-colors ${
                    n === currentPage
                      ? 'bg-gold font-semibold text-on-gold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Page {n}
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="relative min-h-0 min-w-0 flex-1">
        <div
          data-reader-scroll
          className="pdf-scroll-container h-full overflow-auto overscroll-contain [touch-action:pan-x_pan-y] [scroll-behavior:smooth]"
        >

        {TEST_UNLOCK_READER && (
          <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-md border border-danger/30 bg-danger/10 px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
            <span className="text-sm text-danger">
              Test mode — the paywall is bypassed. Set <code>TEST_UNLOCK_READER = false</code> before
              shipping.
            </span>
          </div>
        )}

        {resumedNotice && (
          <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-md border border-success/30 bg-success/10 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              <span className="text-sm text-success">
                Resume from page {currentPage} based on your saved progress.
              </span>
            </div>
            <button
              onClick={() => setResumedNotice(false)}
              aria-label="Dismiss"
              className="text-success hover:underline"
            >
              ×
            </button>
          </div>
        )}

          <div
            className="relative h-full w-full bg-slate-950 select-none print:hidden"
          >
              {/* Watermark */}
              <div className="pointer-events-none absolute inset-0 z-10 flex select-none flex-col items-center justify-center space-y-16 opacity-[0.04] [transform:rotate(-25deg)]">
                <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
                  LICENSED TO: {userName.toUpperCase()} • {userEmailMasked.toUpperCase()}
                </div>
                <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
                  EDUVAULT SECURE STREAM • AUTHORIZED DEVICE SESSION
                </div>
                <div className="whitespace-nowrap text-2xl font-black tracking-widest sm:text-3xl">
                  LICENSED TO: {userName.toUpperCase()} • {userEmailMasked.toUpperCase()}
                </div>
              </div>

              {/* Page content — the real document when the server handed us a
                  signed URL; the placeholder pages otherwise (test-mode bypass
                  and denial paths have no URL). The watermark above stays on top
                  either way. */}
              {signedPdfUrl ? (
                <div className="relative z-0 w-full">
                  <SecurePdfReader
                    url={signedPdfUrl}
                    materialId={material?.id || 'unknown'}
                    title={material?.title || undefined}
                    // One zoom owner: the toolbar. The canvas scale follows
                    // this percentage instead of scaling the whole frame.
                    zoomPercent={zoom}
                    onZoomChange={setZoom}
                    requestedFit={requestedFit}
                    requestedPage={requestedPage}
                    continuous={continuous}
                    searchRequest={searchRequest}
                    onSearchResult={setSearchResult}
                    onPageChange={(p, total) => {
                      // Keep the parent in step with the real document so progress
                      // persistence and the resume logic use true values.
                      setCurrentPage(p);
                      setTotalPages(total);
                    }}
                  />
                </div>
              ) : (
              <div className="relative z-0 mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center space-y-6 py-16 text-center">
                <Lock className="h-8 w-8 text-ink-faint" aria-hidden="true" />
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                    No document token issued
                  </h2>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-muted">
                    The canvas renders the real file the instant the secure backend hands back a
                    signed URL. It has not, so there is nothing to display — this is an access
                    result, not a rendering failure.
                  </p>
                  {/* Naming the actual reason turns "why is this blank?" into a one-glance
                      answer. In test mode the server never signs, so this is expected. */}
                  <p className="mx-auto max-w-md text-xs leading-relaxed text-ink-faint">
                    Reason: <span className="font-mono text-ink-muted">{denialReason}</span>
                    {TEST_UNLOCK_READER &&
                      ' · test mode bypasses the server, so no URL is minted'}
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-4 text-left text-xs">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <div>
                    <strong className="mb-0.5 block font-semibold text-success">
                      DRM protection active
                    </strong>
                    <span className="text-success">
                      Authenticated as {userName} ({userEmailMasked}). Printing and downloading are
                      disabled.
                    </span>
                  </div>
                </div>
              </div>
              )}

              {/* Pagination is owned by SecurePdfReader (buttons, wheel and swipe). */}
          </div>
        </div>
        </div>
      </div>

      {/* Reader settings */}
      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Reader settings"
        footer={
          <Button variant="primary" size="sm" onClick={() => setSettingsOpen(false)}>
            Save preferences
          </Button>
        }
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Reading theme</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: 'dark', label: 'Dark', preview: 'bg-surface-deep' },
                { key: 'light', label: 'Light', preview: 'bg-[#F8FAFC]' },
              ] as const).map((theme) => (
                <button
                  key={theme.key}
                  onClick={() => setReaderTheme(theme.key)}
                  aria-pressed={readerTheme === theme.key}
                  className={`rounded-md border p-3 text-sm font-medium text-ink transition-colors duration-200 ${
                    readerTheme === theme.key
                      ? 'border-gold ring-2 ring-gold/20'
                      : 'border-line-strong hover:border-ink-faint'
                  }`}
                >
                  <span className={`mb-2 block h-6 rounded ${theme.preview} border`} />
                  {theme.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Watermark</label>
            <dl className="space-y-1 rounded-md border border-line-strong bg-canvas p-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Licensed user</dt>
                <dd className="font-medium text-ink">{userName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Masked email</dt>
                <dd className="font-medium text-ink">{userEmailMasked}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">DRM status</dt>
                <dd className="font-medium text-ink">Active</dd>
              </div>
            </dl>
          </div>
        </div>
      </Modal>

      {/* Screenshot warning — strikes 1 and 2. The third strike does not come
          through here; it suspends the account and renders the hard lock screen,
          which is terminal and cannot be dismissed. */}
      <Modal
        isOpen={Boolean(screenshotModal)}
        onClose={() => setScreenshotModal(null)}
        title={screenshotModal?.title || 'Security notice'}
        footer={
          <Button variant="danger" size="sm" onClick={() => setScreenshotModal(null)}>
            I understand
          </Button>
        }
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-danger/30 bg-danger/10 text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">{screenshotModal?.message}</p>
          <p className="text-xs italic text-ink-muted">
            EduVault protects educational content against unauthorized copying and distribution.
          </p>
        </div>
      </Modal>

      {purchaseModal}
    </div>
  );
};
