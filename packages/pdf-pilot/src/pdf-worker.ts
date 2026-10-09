import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { initSync, detectPdf, processPdf } from '@firecrawl/pdf-inspector-wasm';

// Same pinned parser and options as ToolRobin's advanced-five worker readPdf.
// The WASM module is supplied as bytes: its initializer never fetches a URL.
try {
  const entry = createRequire(import.meta.url).resolve('@firecrawl/pdf-inspector-wasm');
  initSync({ module: await readFile(join(dirname(entry), 'pdf_inspector_wasm_bg.wasm')) });
  const bytes = new Uint8Array(workerData.bytes);
  const detected = detectPdf(bytes);
  if (detected.pageCount < 1 || detected.pageCount > 100) throw Error('pages');
  const result = processPdf(bytes, { profile: workerData.profile, includePageMarkers: true, includeImages: false });
  if (!result.markdown?.trim()) throw Error('scan');
  const data = {
    markdown: result.markdown,
    pages: result.pageCount,
    profile: workerData.profile,
    pagesNeedingOcr: result.pagesNeedingOcr,
    hasEncodingIssues: result.hasEncodingIssues,
    complexLayout: result.layout.isComplex,
    limitations: 'Text layer only. No OCR or image export. Check reading order, tables and missing glyphs against the original PDF.',
  };
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 1_048_576) throw Error('output');
  parentPort!.postMessage({ ok: true, data });
} catch (error) {
  const code = error instanceof Error && ['pages', 'scan', 'output'].includes(error.message) ? error.message : 'invalid';
  parentPort!.postMessage({ ok: false, code });
}
