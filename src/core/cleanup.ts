// ToolRobin core copied from src/tools/text/cleanup-core.ts; see PROVENANCE.json.
import { validateInput } from './contracts.js';
export type CleanupOptions = { trimLines: boolean; collapseSpaces: boolean; lineBreaks: 'keep' | 'paragraphs' | 'single' };
// Horizontal whitespace only: do not treat line separators or zero-width joiners as spaces.
const horizontal = /[\t\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+/g;
const edges = /^[\t\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+|[\t\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$/g;
export function cleanupText(input: string, options: CleanupOptions): string {
  validateInput(input);
  if (!['keep', 'paragraphs', 'single'].includes(options.lineBreaks)) throw new Error('Choose a valid line-break option.');
  let lines = input.replace(/\r\n?|[\u2028\u2029]/g, '\n').split('\n');
  lines = lines.map(line => {
    if (options.collapseSpaces) line = line.replace(horizontal, ' ');
    return options.trimLines ? line.replace(edges, '') : line;
  });
  if (options.lineBreaks === 'keep') return lines.join('\n');
  // Joining is explicit: adjacent lines become prose; blank lines delimit paragraphs.
  if (options.lineBreaks === 'single') return lines.map(line => line.replace(edges, '')).filter(Boolean).join(' ');
  const paragraphs: string[] = []; let paragraph: string[] = [];
  for (const line of lines) {
    const trimmed = line.replace(edges, '');
    if (trimmed) paragraph.push(trimmed);
    else if (paragraph.length) { paragraphs.push(paragraph.join(' ')); paragraph = []; }
  }
  if (paragraph.length) paragraphs.push(paragraph.join(' '));
  return paragraphs.join('\n\n');
}
