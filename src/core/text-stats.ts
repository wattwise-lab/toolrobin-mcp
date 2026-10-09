// Pure-function extraction from src/tools/modules/text-stats.ts; see PROVENANCE.json.

export function analyzeText(text: string) {
  // Intl.Segmenter counts user-visible characters, including emoji sequences.
  const characters = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].filter(item => !/^\s+$/u.test(item.segment)).length;
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const words = (text.match(/[\p{Script=Latin}\p{N}]+(?:['’-][\p{Script=Latin}\p{N}]+)*/gu) ?? []).length;
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/u).length : 0;
  return { characters, han, words, paragraphs };
}
