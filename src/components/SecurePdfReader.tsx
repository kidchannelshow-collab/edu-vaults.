import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
// Worker setup lives in one module and is derived from the installed
// pdfjs-dist version, so API and worker can never drift apart.
import { pdfjsLib } from '../lib/pdfjs';

/**
 * One shared PDF surface for the whole platform â€” the student reader and the
 * admin audit reader both render through this, so behaviour cannot drift.
 *
 * It exists because an <iframe> embedding a PDF is opaque: it cannot report a page
 * count, cannot be paged, and cannot tell us where the reader is.
 *
 * The watermark is NOT rendered here. Callers overlay their own (student and admin
 * wording differ), and it must sit above the canvas to be effective.
 *
 * Fullscreen is a CSS overlay on the SAME element tree, not a separate branch.
 * That is deliberate: switching branches would unmount the canvas, and exiting
 * would cost a re-render. This way the document, page and zoom survive untouched.
 */

type FitMode = 'page' | 'width';

const positionKey = (materialId: string) => `eduvault_progress_${materialId}`;
const FIT_KEY = 'edu_reader_fit_mode';

/** Room reserved below the stage for the bottom navigation bar, inline only. */
const CHROME_HEIGHT = 84;

/** Readability floor for the measured fit. */
const MIN_SCALE = 0.4;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

/** Minimum gap between wheel-triggered page flips, in ms. */
const WHEEL_COOLDOWN = 800;

/** Accumulated wheel distance required to turn a page (dampening). */
const WHEEL_TURN_THRESHOLD = 150;

/** Minimum vertical swipe, in px, before a touch turns a page. */
const SWIPE_TURN_THRESHOLD = 100;

function readPosition(materialId: string): number {
  try {
    const raw = localStorage.getItem(positionKey(materialId));
    if (!raw) return 1;
    // Current format is { page, progressPct, totalPages }; older entries were a
    // bare number. Accept both so saved positions survive the upgrade.
    try {
      const parsed = JSON.parse(raw);
      const page = Number(parsed?.page ?? parsed);
      return Number.isFinite(page) && page > 0 ? page : 1;
    } catch {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }
  } catch {
    return 1;
  }
}

function writePosition(materialId: string, page: number, totalPages: number): void {
  try {
    const progressPct =
      totalPages > 0 ? Math.min(100, Math.max(0, Math.round((page / totalPages) * 100))) : 0;
    localStorage.setItem(
      positionKey(materialId),
      JSON.stringify({ page, progressPct, totalPages }),
    );
  } catch {
    /* storage unavailable */
  }
}

function readFitMode(): FitMode {
  try {
    return localStorage.getItem(FIT_KEY) === 'width' ? 'width' : 'page';
  } catch {
    return 'page';
  }
}

export interface SecurePdfReaderProps {
  /** Signed URL for the real PDF. */
  url: string;
  /** Stable id; the local reading position is keyed on it. */
  materialId: string;
  /** Shown in the reader's own header toolbar. */
  title?: string;
  /** Fires on every page change with the true page and page count. */
  onPageChange?: (page: number, totalPages: number) => void;
  /**
   * Controlled zoom, in percent. 100 = the measured page fit. Owned by the
   * parent toolbar so there is exactly ONE zoom control for the document.
   */
  zoomPercent?: number;
  /** Called for pinch and Ctrl/Cmd + wheel zoom. */
  onZoomChange?: (percent: number) => void;
  /** Controlled fit request from the toolbar. */
  requestedFit?: { mode: FitMode; token: number } | null;
  /** Direct page jump from the toolbar page input / sidebar. */
  requestedPage?: { page: number; token: number } | null;
  /** Render every page stacked in a continuous, scrollable column. */
  continuous?: boolean;
  /** Document search request. */
  searchRequest?: { query: string; token: number } | null;
  onSearchResult?: (message: string | null) => void;
}

const ZOOM_PERCENT_MIN = 25;
const ZOOM_PERCENT_MAX = 500;

const clampPercent = (n: number) =>
  Math.min(ZOOM_PERCENT_MAX, Math.max(ZOOM_PERCENT_MIN, Math.round(n / 10) * 10));

export const SecurePdfReader: React.FC<SecurePdfReaderProps> = ({
  url,
  materialId,
  title,
  onPageChange,
  zoomPercent = 100,
  onZoomChange,
  requestedFit = null,
  requestedPage = null,
  continuous = false,
  searchRequest = null,
  onSearchResult,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<any>(null);
  // pdfjs-dist v6's PDFDocumentProxy has no typed destroy(); the
  // PDFDocumentLoadingTask owns teardown (worker + document), so it is kept
  // here and destroyed on unmount / URL change.
  const loadingTaskRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const renderSeqRef = useRef(0);
  const pendingScrollRef = useRef<number | null>(null);
  const wheelLockRef = useRef(0);
  const fullscreenRef = useRef(false);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pageRendering, setPageRendering] = useState(false);
  // Exact page restored from localStorage, surfaced as "Resume from page X".
  const [resumeFrom, setResumeFrom] = useState<number | null>(null);

  // Live progress sync (user_material_progress). The user id is resolved once;
  // the upsert is debounced so scrolling never floods Supabase.
  const userIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) userIdRef.current = data.user?.id ?? null;
    });
    return () => {
      cancelled = true;
      if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current);
    };
  }, []);

  /** The measured fit for the current layout â€” excludes user zoom. */
  const [baseScale, setBaseScale] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<FitMode>(readFitMode);
  const fitModeRef = useRef(fitMode);
  useEffect(() => {
    fitModeRef.current = fitMode;
  }, [fitMode]);

  const zoom = Math.max(0.25, zoomPercent / 100);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    fullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  // ---- Measure the fit (once per document / layout, never per page) --------
  // Fit-WIDTH is the only mode: every page spans the container so the book
  // reads like a normal vertically-scrolled document, never horizontally.
  const measure = useCallback(async () => {
    const doc = docRef.current;
    const stage = stageRef.current ?? continuousRef.current;
    if (!doc || !stage) return;

    try {
      const base = (await doc.getPage(1)).getViewport({ scale: 1 });
      // Fit-WIDTH baseline: scale exactly to the live container width so the
      // page fills the workspace (professional desktop-reader size), rather
      // than rendering at 1:1 and floating small in the middle.
      const containerWidth = stage.clientWidth || stage.getBoundingClientRect().width;
      const availW = Math.max(240, containerWidth - 16);
      setBaseScale(Math.max(MIN_SCALE, availW / base.width));
    } catch {
      /* best-effort; the previous scale stays in force */
    }
  }, []);

  // ---- Load the document (once per URL) -----------------------------------
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setNumPages(0);
    setBaseScale(null);

    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url });
        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) {
          // The task owns the document and worker; destroying the proxy
          // directly is not part of the public v6 API.
          void loadingTask.destroy?.();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        const saved = Math.min(doc.numPages, Math.max(1, readPosition(materialId)));
        setPage(saved);
        if (saved > 1) {
          setResumeFrom(saved);
          window.setTimeout(() => setResumeFrom(null), 5000);
        }
        setStatus('ready');
        await measure();
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setError(err?.message || 'The document could not be opened.');
      }
    })();

    return () => {
      cancelled = true;
      renderSeqRef.current++;
      renderTaskRef.current?.cancel?.();
      void loadingTaskRef.current?.destroy?.();
      loadingTaskRef.current = null;
      docRef.current = null;
    };
  }, [url, materialId, measure]);

  // ---- Re-measure on resize and on layout switch ---------------------------
  useEffect(() => {
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void measure(), 180);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [measure]);

  useEffect(() => {
    if (status !== 'ready') return;
    // The stage changes size when the layout switches, so re-fit after paint.
    const t = window.setTimeout(() => void measure(), 0);
    return () => window.clearTimeout(t);
  }, [isFullscreen, fitMode, status, measure]);

  // ---- Fullscreen: lock the page behind the overlay -------------------------
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenRef.current) setIsFullscreen(false);
    };
    const onNativeFullscreen = () => {
      // If the browser's own fullscreen was exited with Esc, drop our overlay too.
      if (!document.fullscreenElement && fullscreenRef.current) setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onNativeFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onNativeFullscreen);
    };
  }, []);

  // ---- Render the current page --------------------------------------------
  useEffect(() => {
    if (status !== 'ready' || !docRef.current || baseScale === null) return;
    let cancelled = false;

    (async () => {
      const seq = ++renderSeqRef.current;
      const anchor = pendingScrollRef.current;
      try {
        const pdfPage = await docRef.current.getPage(page);
        if (cancelled || seq !== renderSeqRef.current) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Zoom multiplies the measured fit, so the level is identical on every
        // page â€” changing pages never silently rescales the document.
        const viewport = pdfPage.getViewport({ scale: baseScale * zoom });

        // Standard high-DPI scaling: backing store = viewport × devicePixelRatio,
        // CSS box = the logical viewport. No artificial supersampling and no
        // image-rendering overrides — the PDF renders exactly as authored.
        const outputScale = window.devicePixelRatio || 1;
        const cssW = Math.floor(viewport.width);
        const cssH = Math.floor(viewport.height);
        const bw = Math.floor(viewport.width * outputScale);
        const bh = Math.floor(viewport.height * outputScale);

        // Assigning canvas.width CLEARS it and reallocates the backing store, so
        // only touch it when the size actually changes.
        // High-DPI: the backing store is multiplied by devicePixelRatio, while
        // the CSS box stays at the un-scaled logical size. This is what makes
        // text sharp on Retina/HiDPI displays at every zoom level.
        if (canvas.width !== bw) canvas.width = bw;
        if (canvas.height !== bh) canvas.height = bh;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        renderTaskRef.current?.cancel?.();
        setPageRendering(true);

        const task = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;

        // Warm the next page so the following "Next" doesn't pay for the parse.
        const total = docRef.current?.numPages || page;
        if (page + 1 <= total) docRef.current?.getPage(page + 1).catch(() => {});
      } catch (err: any) {
        if (cancelled || err?.name === 'RenderingCancelledException') return;
        setStatus('error');
        setError(err?.message || 'This page could not be rendered.');
      } finally {
        if (seq === renderSeqRef.current) {
          setPageRendering(false);

          // Put the inline reader back where it was; the canvas height change can
          // otherwise drag the viewport to the top. Fullscreen owns its own scroll
          // container, so it must not touch the window.
          if (anchor !== null && !fullscreenRef.current) {
            pendingScrollRef.current = null;
            window.scrollTo({ top: anchor });
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, status, baseScale, zoom]);

  // ---- Remember and report the position -----------------------------------
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    if (status !== 'ready' || numPages === 0) return;
    writePosition(materialId, page, numPages);
    onPageChangeRef.current?.(page, numPages);

    const userId = userIdRef.current;
    if (!userId) return;

    if (progressTimerRef.current) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => {
      const progressPct = Math.min(100, Math.max(0, Math.round((page / numPages) * 100)));
      // Fire-and-forget: a failed sync must never interrupt reading.
      void supabase
        .from('user_material_progress')
        .upsert(
          {
            user_id: userId,
            material_id: materialId,
            last_page: page,
            total_pages: numPages,
            progress_percent: progressPct,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,material_id' },
        );
    }, 700);
  }, [materialId, page, numPages, status]);

  // ---- Toolbar-driven navigation, fit and search ---------------------------
  useEffect(() => {
    if (!requestedFit) return;
    setFitMode(requestedFit.mode);
    fitModeRef.current = requestedFit.mode;
    void measure();
  }, [requestedFit?.token]);

  useEffect(() => {
    if (!requestedPage) return;
    const target = Math.min(numPages || requestedPage.page, Math.max(1, requestedPage.page));
    setPage(target);
    if (continuous) {
      document
        .getElementById(`page-${target}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [requestedPage?.token]);

  useEffect(() => {
    if (!searchRequest || status !== 'ready' || !docRef.current) return;
    let cancelled = false;

    (async () => {
      const query = searchRequest.query.trim().toLowerCase();
      if (!query) return;

      for (let p = 1; p <= numPages; p++) {
        const pdfPage = await docRef.current.getPage(p);
        const content = await pdfPage.getTextContent();
        const text = (content.items as Array<{ str?: string }>)
          .map((item) => item.str || '')
          .join(' ')
          .toLowerCase();
        if (cancelled) return;
        if (text.includes(query)) {
          setPage(p);
          if (continuous) {
            document
              .getElementById(`page-${p}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          onSearchResult?.(`Found on page ${p}`);
          return;
        }
      }
      if (!cancelled) onSearchResult?.('No matches found');
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [searchRequest?.token, status, numPages]);

  // On open, land on the saved page in the continuous stack (progress
  // persistence: eduvault_progress_<materialId>).
  useEffect(() => {
    if (status !== 'ready') return;
    const saved = readPosition(materialId);
    if (saved <= 1) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`page-${saved}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [status, materialId]);

  // Track the page occupying the upper-middle viewport band. Each page wrapper
  // carries id="page-N" + data-pdf-page=N; this observer is the single source
  // of truth for the counter, the page input and the persisted read position.
  const continuousRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    const el = continuousRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    // The element that actually scrolls (the Material workspace). Using the
    // content element as the observer root would freeze: root and targets move
    // together, so no intersection change is ever observed.
    const scroller =
      (el.closest('[data-reader-scroll]') as HTMLElement | null) ?? el;

    const syncToBand = () => {
      const nodes = el.querySelectorAll<HTMLElement>('[data-pdf-page]');
      if (nodes.length === 0) return;

      // Top of the upper-middle band (20% down the scroll viewport).
      const bandTop = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.2;
      let current = 1;
      let closest = Number.POSITIVE_INFINITY;

      nodes.forEach((node) => {
        const distance = Math.abs(node.getBoundingClientRect().top - bandTop);
        if (distance < closest) {
          closest = distance;
          current = Number(node.dataset.pdfPage || current);
        }
      });

      if (Number.isFinite(current) && current > 0) setPage(current);
    };

    const io = new IntersectionObserver(
      () => syncToBand(),
      {
        root: scroller,
        // The page crossing the upper-middle band is "the page you're reading".
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0,
      },
    );

    el.querySelectorAll<HTMLElement>('[data-pdf-page]').forEach((node) => io.observe(node));
    syncToBand();
    return () => io.disconnect();
  }, [status, numPages]);

  const go = useCallback(
    (delta: number) => {
      // Capture the inline anchor BEFORE the page change; fullscreen scrolls its
      // own container, so the window must be left alone.
      if (!fullscreenRef.current) pendingScrollRef.current = window.scrollY;
      setPage((p) => {
        const next = Math.min(numPages || 1, Math.max(1, p + delta));
        if (continuous) {
          document
            .getElementById(`page-${next}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return next;
      });
    },
    [numPages, continuous],
  );

  // ---- Pinch + Ctrl/Cmd-wheel zoom, wheel/swipe page turning --------------
  // Attached natively so preventDefault works: React's onWheel/onTouchMove are
  // passive at the root, which lets the browser page-zoom win instead.
  const goRef = useRef<(delta: number) => void>(() => {});
  const wheelAccumRef = useRef(0);
  const lastWheelAtRef = useRef(0);
  useEffect(() => {
    goRef.current = go;
  }, [go]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const scrollContainer = () => {
      const marked = el.closest('[data-reader-scroll]') as HTMLElement | null;
      return marked ?? (document.scrollingElement as HTMLElement | null);
    };

    const onWheel = (e: WheelEvent) => {
      // Ctrl/Cmd + wheel zooms. Plain wheel is left entirely to the browser so
      // the page stack scrolls naturally with momentum — no page flipping.
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const base = zoomRef.current * 100;
      onZoomChangeRef.current?.(clampPercent(base + (e.deltaY < 0 ? 10 : -10)));
    };

    let startDist = 0;
    let startZoom = 100;
    let startY = 0;
    let startX = 0;
    const distance = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = distance(e.touches);
        startZoom = zoomRef.current * 100;
      } else if (e.touches.length === 1) {
        startDist = 0;
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDist <= 0) return;
      e.preventDefault();
      const ratio = distance(e.touches) / startDist;
      onZoomChangeRef.current?.(clampPercent(startZoom * ratio));
    };
    const onTouchEnd = () => {
      startDist = 0;
      startY = 0;
      startX = 0;
    };
    const onTouchCancel = () => {
      startDist = 0;
      startY = 0;
      startX = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchCancel);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

  const chooseFit = useCallback(
    (mode: FitMode) => {
      setFitMode(mode);
      fitModeRef.current = mode;
      try {
        localStorage.setItem(FIT_KEY, mode);
      } catch {
        /* storage unavailable */
      }
      setSettingsOpen(false);
      void measure();
    },
    [measure],
  );
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!fullscreenRef.current) return;
      const el = scrollRef.current;
      if (!el) return;

      const now = Date.now();
      if (now - wheelLockRef.current < WHEEL_COOLDOWN) return;

      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const atTop = el.scrollTop <= 4;

      if (e.deltaY > 0 && atBottom && page < numPages) {
        wheelLockRef.current = now;
        go(1);
        el.scrollTop = 0;
      } else if (e.deltaY < 0 && atTop && page > 1) {
        wheelLockRef.current = now;
        go(-1);
        // Land at the foot of the previous page so the motion reads as continuous.
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    },
    [go, page, numPages],
  );

  const shell = (children: React.ReactNode) => (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-[9999] flex h-screen w-screen flex-col gap-3 overflow-hidden bg-slate-950 p-3'
          : 'flex min-h-full flex-col gap-2 bg-canvas'
      }
    >
      {resumeFrom !== null && status === 'ready' && (
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success">
          <FileText className="h-3.5 w-3.5" />
          Resume from page {resumeFrom}
        </div>
      )}

      {isFullscreen ? (
        <div
          ref={scrollRef}
          onWheel={onWheel}
          className="pdf-scroll-container min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-4"
        >
          {children}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      )}
    </div>
  );

  const stage = (
    <div ref={stageRef} className="mx-auto flex h-full w-full max-w-[1500px] items-center justify-center">
      <div className="relative w-full max-w-full">
        <canvas
          ref={canvasRef}
          className="mx-auto block max-w-full rounded-sm border border-slate-800 bg-white shadow-lg"
        />
        {pageRendering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        )}
      </div>
    </div>
  );

  if (status === 'loading') {
    return shell(
      <div className="flex min-h-[420px] items-center justify-center gap-3 rounded-lg border border-line-strong bg-surface-deep text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Opening documentâ€¦
      </div>,
    );
  }

  if (status === 'error') {
    return shell(
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger/10 p-6 text-center">
        <AlertTriangle className="h-5 w-5 text-danger" />
        <p className="max-w-md text-sm text-danger">{error}</p>
        <p className="max-w-md text-xs text-danger/80">
          Signed URLs expire â€” reload or re-mint to get a fresh one.
        </p>
      </div>,
    );
  }

  const continuousView = (
    <div
      ref={continuousRef}
      className="w-full bg-slate-950 px-3 py-4"
    >
      <div className="mx-auto flex w-full flex-col items-center gap-8 pb-24">
        {Array.from({ length: numPages }, (_, i) => (
          <div
            key={i}
            id={`page-${i + 1}`}
            data-pdf-page={i + 1}
            className="scroll-mt-4"
          >
            <PageSheet
              doc={docRef.current}
              pageNumber={i + 1}
              scale={Math.max(0.25, (baseScale ?? 1) * zoom)}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return shell(continuousView);
};

/**
 * One lazily-rendered page for the continuous view. The canvas mounts only
 * when the page is within 800px of the viewport, so a long book does not
 * allocate every backing store at once.
 */
const PageSheet: React.FC<{ doc: any; pageNumber: number; scale: number }> = ({
  doc,
  pageNumber,
  scale,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const hasRenderedRef = useRef(false);
  // Rendered = page is visible or within one viewport of it. Off-screen pages
  // release their canvas backing store so long books never accumulate memory.
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => setActive(entry.isIntersecting));
      },
      { rootMargin: '100% 0px' }, // visible + 1 buffer viewport
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!active || !doc) {
      // Release the backing store but keep the CSS box so scroll position and
      // page height never jump when a page virtualizes out.
      if (hasRenderedRef.current) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }

    let cancelled = false;

    (async () => {
      const pdfPage = await doc.getPage(pageNumber);
      if (cancelled) return;

      const pixelRatio = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale: scale * pixelRatio });
      if (!canvasRef.current) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${viewport.width / pixelRatio}px`;
      canvas.style.height = `${viewport.height / pixelRatio}px`;
      hasRenderedRef.current = true;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [active, doc, pageNumber, scale]);

  return (
    <div
      ref={holderRef}
      className="relative flex min-h-[70vh] w-full items-center justify-start"
    >
      <canvas
        ref={canvasRef}
        className="mx-auto block rounded-sm border border-slate-800 bg-white shadow-lg"
      />
      <span className="absolute -bottom-5 right-0 text-[11px] tabular-nums text-slate-500">
        {pageNumber}
      </span>
    </div>
  );
};


