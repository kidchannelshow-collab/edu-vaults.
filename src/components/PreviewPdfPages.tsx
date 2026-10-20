import React, { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../lib/pdfjs';

/**
 * Lightweight 2-page sample preview.
 *
 * Used on the material landing when the admin has not uploaded preview images.
 * It renders pages 1 and 2 of a PUBLIC sample PDF to two canvases — never the
 * protected 'educational-materials' document, which stays behind the paywall.
 * A missing sample simply falls back to the "being prepared" message.
 */
export const PreviewPdfPages: React.FC<{ url: string }> = ({ url }) => {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    const task = pdfjsLib.getDocument({ url });

    (async () => {
      const doc = await task.promise;
      if (cancelled) return;

      for (let i = 0; i < 2 && i < doc.numPages; i++) {
        const pdfPage = await doc.getPage(i + 1);
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;

        const containerWidth = canvas.parentElement?.clientWidth || 800;
        const base = pdfPage.getViewport({ scale: 1 });
        const ratio = window.devicePixelRatio || 1;
        const scale = Math.max(0.2, containerWidth / base.width);
        const viewport = pdfPage.getViewport({ scale: scale * ratio });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width / ratio}px`;
        canvas.style.height = `${viewport.height / ratio}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      }

      if (!cancelled) setStatus('ready');
    })().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      void task.destroy?.();
    };
  }, [url]);

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-line-strong bg-surface-deep py-16 text-center">
        <p className="text-xs text-ink-muted">Preview pages are being prepared.</p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Read the first two pages free</h2>
        <span className="text-xs text-ink-faint">{status === 'loading' ? 'Loading…' : 'Free sample'}</span>
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {[1, 2].map((pageNumber) => (
          <figure key={pageNumber} className="space-y-3">
            <figcaption className="flex items-center justify-between border-b border-line-strong pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Page {pageNumber}
              </span>
              <span className="text-xs text-ink-faint">Free sample</span>
            </figcaption>
            <div className="overflow-hidden rounded-lg border border-line-strong bg-surface-deep">
              <canvas
                ref={(el) => {
                  canvasRefs.current[pageNumber - 1] = el;
                }}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="block h-auto w-full bg-white"
              />
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
};
