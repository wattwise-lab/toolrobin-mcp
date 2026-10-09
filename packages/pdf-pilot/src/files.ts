import { constants } from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export async function prepareReadRoot(input: string) {
  if (!isAbsolute(input)) throw Error('The read directory must be absolute.');
  const root = await realpath(input);
  if (!(await lstat(root)).isDirectory()) throw Error('Choose an existing read directory.');
  return root;
}
function allowedRelativePath(input: string) {
  // Portable paths only. The caller never controls the authorized root.
  if (!input || input.length > 1024 || isAbsolute(input) || /[\\\x00-\x1f:]/u.test(input)
    || input.split('/').some(part => !part || part === '.' || part === '..') || !/\.pdf$/iu.test(input)) {
    throw Error('Use a relative .pdf path inside the configured read directory, without traversal.');
  }
}
export async function readAuthorizedPdf(root: string, input: string): Promise<Uint8Array> {
  allowedRelativePath(input);
  const target = resolve(root, input);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) throw Error('File is outside the read directory.');
  let current = root;
  try {
    for (const part of rel.split(sep)) {
      current = resolve(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw Error('Links are not supported.');
    }
    if ((await realpath(target)) !== target) throw Error('Links are not supported.');
    const before = await lstat(target);
    if (!before.isFile()) throw Error('Choose a regular PDF file.');
    if (!before.size || before.size > MAX_PDF_BYTES) throw Error('PDF must be nonempty and at most 20 MiB.');
    // NONBLOCK also keeps a replaced FIFO from hanging the process.
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
        || opened.size !== before.size || (await realpath(target)) !== target) throw Error('File changed; select it again.');
      const buffer = new Uint8Array(MAX_PDF_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const after = await file.stat();
      if (!length || length > MAX_PDF_BYTES) throw Error('PDF must be nonempty and at most 20 MiB.');
      if (length !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw Error('File changed; select it again.');
      const bytes = buffer.slice(0, length);
      if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw Error('This is not a readable PDF.');
      return bytes;
    } finally { await file.close(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/^(Links are|Choose a regular|PDF must|File changed|This is not)/u.test(message)) throw error;
    throw Error('PDF could not be read. Check its relative path and file permissions.');
  }
}
