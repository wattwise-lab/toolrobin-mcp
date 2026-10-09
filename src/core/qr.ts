// ToolRobin core copied from src/tools/qr/core.ts; see PROVENANCE.json.
export const MAX_QR_BYTES = 1200;
export type QrOptions = { text: string; scale: number; level: 'M' | 'H' };
export function validateQr(options: QrOptions) {
  if (!options.text.trim()) throw new Error('Enter a URL or some text first.');
  if (!options.text.isWellFormed()) throw new Error('The text contains an incomplete character. Please paste it again.');
  if (new TextEncoder().encode(options.text).length > MAX_QR_BYTES) throw new Error('Keep the content within 1,200 UTF-8 bytes. Shorter content is easier to scan.');
  if (![4, 8, 12].includes(options.scale) || !['M', 'H'].includes(options.level)) throw new Error('Choose a supported size and correction level.');
}
export type QrMatrix = { size: number; data: Uint8Array };
export function svgFromMatrix(matrix: QrMatrix, scale: number) {
  const size = matrix.size + 8;
  let path = '';
  for (let y = 0; y < matrix.size; y++) for (let x = 0; x < matrix.size; x++) {
    if (matrix.data[y * matrix.size + x]) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  }
  // Only generated matrix coordinates enter XML, never the user's input.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * scale}" height="${size * scale}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#000" d="${path}"/></svg>`;
}
