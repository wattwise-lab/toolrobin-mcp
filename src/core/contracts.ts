// Pure validation excerpt from src/tools/contracts.ts; see PROVENANCE.json.
export const MAX_INPUT_LENGTH = 100_000;

export function validateInput(value: string) {
  if (!value.trim()) throw new Error('请先输入需要处理的内容。');
  if (value.length > MAX_INPUT_LENGTH) throw new Error('单次最多处理 10 万字符（部分表情计为多个字符），请缩短内容后重试。');
}
