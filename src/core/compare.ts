// ToolRobin core copied from src/tools/compare/core.ts; see PROVENANCE.json.
export const MAX_TEXT = 100_000;
export const MAX_LINES = 1500;
export interface CompareOptions { ignoreCase: boolean; trimEdges: boolean }
export interface DiffRow { kind: 'same' | 'add' | 'remove'; text: string; oldLine: number | null; newLine: number | null }
export interface DiffResult { rows: DiffRow[]; added: number; removed: number; unchanged: number }
export function textLines(text: string): string[] {
  if (text.length > MAX_TEXT) throw new Error('Each draft can contain up to 100,000 UTF-16 units. Shorten the text and try again.');
  const lines = text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > MAX_LINES) throw new Error('Each draft can contain up to 1,500 lines. Compare a smaller section.');
  return lines;
}
export function compareText(before: string, after: string, options: CompareOptions): DiffResult {
  const a = textLines(before), b = textLines(after);
  if (!a.length && !b.length) throw new Error('Enter text in at least one draft.');
  const key = (s: string) => { const value = options.trimEdges ? s.trim() : s; return options.ignoreCase ? value.toLowerCase() : value; };
  const ak = a.map(key), bk = b.map(key), columns = b.length + 1;
  // Bounded to 1,501 squared Uint16 cells (about 4.3 MiB); at most 1,500 matches.
  const table = new Uint16Array((a.length + 1) * columns);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    table[i * columns + j] = ak[i] === bk[j] ? table[(i + 1) * columns + j + 1]! + 1 : Math.max(table[(i + 1) * columns + j]!, table[i * columns + j + 1]!);
  }
  const rows: DiffRow[] = []; let i = 0, j = 0, added = 0, removed = 0, unchanged = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ak[i] === bk[j]) { rows.push({kind:'same',text:b[j]!,oldLine:++i,newLine:++j}); unchanged++; }
    else if (i < a.length && (j === b.length || table[(i + 1) * columns + j]! >= table[i * columns + j + 1]!)) { rows.push({kind:'remove',text:a[i]!,oldLine:++i,newLine:null}); removed++; }
    else { rows.push({kind:'add',text:b[j]!,oldLine:null,newLine:++j}); added++; }
  }
  return { rows, added, removed, unchanged };
}
export function diffReport(result: DiffResult, heading: string): string {
  return heading + '\n\n' + result.rows.map(row => `${row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' '}\t${row.oldLine ?? ''}\t${row.newLine ?? ''}\t${row.text}`).join('\n') + '\n';
}
