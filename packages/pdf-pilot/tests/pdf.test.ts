import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { prepareReadRoot, readAuthorizedPdf, MAX_PDF_BYTES } from '../src/files.js';
import { extractPdf } from '../dist/extract.js';

let root: string, outside: string, bytes: Uint8Array;
before(async () => {
  root = await prepareReadRoot(await mkdtemp(join(tmpdir(), 'toolrobin-pdf-pilot-')));
  outside = await mkdtemp(join(tmpdir(), 'toolrobin-outside-'));
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage(); first.drawText('Returns policy', { x: 40, y: 750, size: 20, font }); first.drawText('Returns accepted within 30 days.', { x: 40, y: 710, size: 12, font });
  const second = doc.addPage(); second.drawText('Shipping takes 3 business days.', { x: 40, y: 710, size: 12, font });
  bytes = await doc.save();
  await writeFile(join(root, 'policy.pdf'), bytes); await writeFile(join(outside, 'secret.pdf'), bytes);
  await mkdir(join(root, 'nested')); await writeFile(join(root, 'nested', 'file with spaces.pdf'), bytes);
  await writeFile(join(root, 'invalid.pdf'), '%PDF-1.7 invalid'); await writeFile(join(root, 'wrong.pdf'), 'not a PDF');
  await writeFile(join(root, 'big.pdf'), new Uint8Array(MAX_PDF_BYTES + 1));
  await symlink(join(outside, 'secret.pdf'), join(root, 'linked.pdf'));
  await symlink(outside, join(root, 'linked-dir'));
});
after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });

test('read root must be existing absolute directory', async () => {
  assert.equal(await prepareReadRoot(root), root);
  await assert.rejects(prepareReadRoot('relative'), /absolute/);
  await assert.rejects(prepareReadRoot(join(root, 'policy.pdf')), /directory/);
});
test('reads a regular PDF including nested spaces without altering it', async () => {
  assert.deepEqual(await readAuthorizedPdf(root, 'nested/file with spaces.pdf'), bytes);
});
test('rejects traversal, absolute paths, wrong extensions and control characters', async () => {
  for (const path of ['../secret.pdf', '/tmp/secret.pdf', 'nested/../../secret.pdf', 'file.txt', 'x\\y.pdf', 'x/./y.pdf', 'x//y.pdf', 'x\n.pdf', 'C:secret.pdf', 'a'.repeat(1025) + '.pdf']) await assert.rejects(readAuthorizedPdf(root, path), /relative/);
});
test('rejects final and ancestor symlinks before decoding', async () => {
  for (const path of ['linked.pdf', 'linked-dir/secret.pdf']) await assert.rejects(readAuthorizedPdf(root, path), /Links/);
});
test('rejects missing, non-PDF and oversize files without leaking absolute paths', async () => {
  for (const path of ['missing.pdf', 'wrong.pdf', 'big.pdf']) await assert.rejects(readAuthorizedPdf(root, path), error => error instanceof Error && !error.message.includes(root));
});
test('same website engine extracts real text and numbered pages in both profiles', async () => {
  for (const profile of ['fidelity', 'compact'] as const) {
    const result = await extractPdf(bytes, profile);
    assert.equal(result.pages, 2); assert.equal(result.profile, profile);
    assert.match(result.markdown, /Returns accepted within 30 days/);
    assert.match(result.markdown, /Shipping takes 3 business days/);
    assert.match(result.markdown, /<!-- Page 2 -->/);
    assert.deepEqual(result.pagesNeedingOcr, []);
  }
});
test('corrupt, scanned and 101-page PDFs are refused; a later valid PDF succeeds', async () => {
  await assert.rejects(extractPdf(await readAuthorizedPdf(root, 'invalid.pdf'), 'fidelity'), /decoded/);
  const scan = await PDFDocument.create(); scan.addPage(); await assert.rejects(extractPdf(await scan.save(), 'fidelity'), /text layer/);
  const many = await PDFDocument.create(); for (let i = 0; i < 101; i++) many.addPage(); await assert.rejects(extractPdf(await many.save(), 'fidelity'), /1–100/);
  assert.equal((await extractPdf(bytes, 'fidelity')).pages, 2);
});
test('request cancellation terminates the worker and permits retry', async () => {
  const controller = new AbortController();
  const pending = extractPdf(bytes, 'fidelity', controller.signal); controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal((await extractPdf(bytes, 'compact')).pages, 2);
});
test('actual 30-second deadline terminates a stuck worker and permits retry', { timeout: 35_000 }, async () => {
  const hanging = join(root, 'hang.mjs'); await writeFile(hanging, 'while(true){}');
  const start = performance.now();
  await assert.rejects(extractPdf(bytes, 'fidelity', undefined, 30_000, new URL('file://' + hanging)), /30 seconds/);
  const duration = performance.now() - start;
  assert.ok(duration >= 29_500 && duration < 34_000, String(duration));
  assert.equal((await extractPdf(bytes, 'fidelity')).pages, 2);
});
test('stdio: one tool, readable result, malformed arguments and recovery with network APIs denied', async () => {
  const preload = resolve('../../tests/deny-network.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', preload, resolve('dist/index.js'), '--read-root', root], stderr: 'pipe' });
  let stderr = ''; transport.stderr!.on('data', chunk => { stderr += String(chunk); });
  const client = new Client({ name: 'pilot-verification', version: '1.0' });
  try {
    await client.connect(transport); const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(t => t.name), ['toolrobin_pdf_to_markdown']);
    for (const args of [{ path: '../secret.pdf' }, { path: 'invalid.pdf' }, { path: 'linked.pdf' }, { path: 'policy.pdf', profile: 'wrong' }, { path: 'policy.pdf', unexpected: true }]) {
      const result = await client.callTool({ name: 'toolrobin_pdf_to_markdown', arguments: args }); assert.equal(result.isError, true);
      assert.ok(!JSON.stringify(result).includes(root));
    }
    const valid = await client.callTool({ name: 'toolrobin_pdf_to_markdown', arguments: { path: 'policy.pdf' } });
    assert.ok(!valid.isError); assert.match(JSON.stringify(valid.structuredContent), /30 days/);
    const concurrent = await Promise.all([0, 1].map(() => client.callTool({ name: 'toolrobin_pdf_to_markdown', arguments: { path: 'policy.pdf' } })));
    assert.equal(concurrent.filter(result => result.isError).length, 1);
    assert.match(JSON.stringify(concurrent.find(result => result.isError)), /already being processed/);
    assert.ok(!(await client.callTool({ name: 'toolrobin_pdf_to_markdown', arguments: { path: 'policy.pdf' } })).isError);
    await client.ping();
  } finally { await client.close(); }
  assert.equal(stderr, '');
});
