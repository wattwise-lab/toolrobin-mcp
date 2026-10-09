// ToolRobin core copied from src/tools/text/base64-core.ts; see PROVENANCE.json.
import { MAX_INPUT_LENGTH } from './contracts.js';

const INPUT_TOO_LONG = 'Input is longer than 100,000 characters.';
const INVALID_BASE64 = 'Enter valid Base64 text.';
const INVALID_UTF8 = 'The decoded bytes are not valid UTF-8 text.';

function checkLength(value: string) {
  if (value.length > MAX_INPUT_LENGTH) throw new Error(INPUT_TOO_LONG);
}

function checkWellFormedUnicode(value: string) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Input contains an unmatched Unicode surrogate.');
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('Input contains an unmatched Unicode surrogate.');
    }
  }
}

export function encodeBase64Text(value: string) {
  checkLength(value);
  checkWellFormedUnicode(value);
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 16_384;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function decodeBase64Text(value: string) {
  checkLength(value);
  const compact = value.replace(/\s+/gu, '').replace(/-/gu, '+').replace(/_/gu, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(compact)) throw new Error(INVALID_BASE64);

  const unpadded = compact.replace(/=+$/u, '');
  const suppliedPadding = compact.length - unpadded.length;
  const remainder = unpadded.length % 4;
  if (remainder === 1) throw new Error(INVALID_BASE64);
  const requiredPadding = remainder === 0 ? 0 : 4 - remainder;
  if (suppliedPadding && (compact.length % 4 !== 0 || suppliedPadding !== requiredPadding)) throw new Error(INVALID_BASE64);

  let binary: string;
  try { binary = atob(unpadded + '='.repeat(requiredPadding)); }
  catch { throw new Error(INVALID_BASE64); }

  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(INVALID_UTF8); }
}
