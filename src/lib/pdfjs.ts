import * as pdfjsLib from 'pdfjs-dist';

/**
 * Single source of truth for the PDF.js worker.
 *
 * The worker MUST be the exact same version as the API. Hard-coding a worker
 * URL (or bundling a worker from a different major) is what produces:
 *   "The API version does not match the Worker version"
 * and, in pdf.js v6's production chunking, `a.toHex is not a function`.
 *
 * `pdfjsLib.version` is resolved from the installed package at build time, so
 * upgrading `pdfjs-dist` moves the worker URL with it automatically.
 *
 * Extension note: pdf.js v4 ships `pdf.worker.min.mjs` ONLY (there is no
 * `pdf.worker.min.js` — cdnjs returns 404 for it). Do not "fix" this to `.js`.
 */
const rawVersion = pdfjsLib.version || '';
const versionMatch = rawVersion.match(/\d+\.\d+\.\d+/);
export const PDF_WORKER_VERSION = versionMatch ? versionMatch[0] : rawVersion;

export const PDF_WORKER_SRC =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_WORKER_VERSION}/pdf.worker.min.mjs`;

pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

export { pdfjsLib };
