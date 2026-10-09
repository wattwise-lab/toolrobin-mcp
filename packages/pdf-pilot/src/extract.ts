import { Worker } from 'node:worker_threads';
export const TIMEOUT_MS = 30_000;
export type PdfData = { markdown: string; pages: number; profile: string; pagesNeedingOcr: number[]; hasEncodingIssues: boolean; complexLayout: boolean; limitations: string };
const errors: Record<string, string> = {
  pages: 'PDF must contain 1–100 pages.',
  scan: 'No usable text layer was found. This pilot does not perform OCR.',
  output: 'Extracted result exceeds 1 MiB; split the PDF into smaller parts.',
  invalid: 'PDF could not be decoded. Check for corruption or encryption; export an unencrypted copy and retry.',
};
export function extractPdf(bytes: Uint8Array, profile: 'fidelity' | 'compact', signal?: AbortSignal, deadline = TIMEOUT_MS, workerUrl = new URL('./pdf-worker.js', import.meta.url)) {
  return new Promise<PdfData>((resolve, reject) => {
    if (signal?.aborted) { reject(Error('PDF extraction cancelled.')); return; }
    // CLI/runtime V8 flags can be invalid for workers. Preserve explicit module
    // preloads (including the verification network guard), not unrelated flags.
    const preloadFlags = ['--import', '--require', '-r'];
    const preloads = process.execArgv.filter((arg, i, all) => preloadFlags.includes(arg) || preloadFlags.includes(all[i - 1] ?? '') || arg.startsWith('--import=') || arg.startsWith('--require='));
    const worker = new Worker(workerUrl, { workerData: { bytes, profile }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 }, execArgv: preloads });
    let settled = false;
    const finish = (error?: Error, data?: PdfData) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void worker.terminate().finally(() => error ? reject(error) : resolve(data!));
    };
    const abort = () => finish(Error('PDF extraction cancelled.'));
    const timer = setTimeout(() => finish(Error('PDF extraction exceeded 30 seconds. Split it into smaller parts and retry.')), deadline);
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', message => message.ok ? finish(undefined, message.data as PdfData) : finish(Error(errors[message.code as string] ?? errors['invalid']!)));
    worker.once('error', () => finish(Error(errors['invalid']!)));
    worker.once('exit', () => { if (!settled) finish(Error(errors['invalid']!)); });
  });
}
