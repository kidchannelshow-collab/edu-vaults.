import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
// Same package, same version as the API above. The legacy worker ships PDF.js's
// bundled core-js `Promise.withResolvers` polyfill, which the standard
// `build/pdf.worker.min.mjs` does not. Importing it through Vite as a URL keeps
// the worker same-origin and removes the old CDN version-drift risk.
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/**
 * Single source of truth for the PDF.js worker.
 *
 * The worker MUST be the exact same version as the API. Both files are imported
 * from the installed `pdfjs-dist` package, so they cannot drift:
 *   - API:    pdfjs-dist/legacy/build/pdf.mjs
 *   - Worker: pdfjs-dist/legacy/build/pdf.worker.min.mjs
 *
 * Do not point this at a CDN worker or bundle a worker from another version;
 * that produces "The API version does not match the Worker version".
 */
const rawVersion = pdfjsLib.version || '';
const versionMatch = rawVersion.match(/\d+\.\d+\.\d+/);
export const PDF_WORKER_VERSION = versionMatch ? versionMatch[0] : rawVersion;

/** Same-origin worker asset emitted by Vite from the installed package. */
export const PDF_WORKER_SRC = pdfWorkerUrl;

pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

export { pdfjsLib };
