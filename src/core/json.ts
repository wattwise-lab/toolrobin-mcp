// Pure-function extraction from src/tools/modules/json-format.ts; see PROVENANCE.json.
import {validateInput} from "./contracts.js";

// JSON.parse/stringify can silently change large numbers and duplicate keys.
// Validate with the native parser, then format the original lexical tokens.
export function formatJson(value: string, compact = false) {
  validateInput(value);
  try { JSON.parse(value); } catch { throw new Error('JSON 格式有误。请检查引号、逗号和括号；内容未被修改。'); }
  const tokens = value.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
  if (compact) return tokens.join('');
  let depth = 0;
  let output = '';
  const newline = () => '\n' + '  '.repeat(depth);
  tokens.forEach((token, index) => {
    if (token === '{' || token === '[') {
      output += token; depth++;
      if (depth > 100) throw new Error('嵌套超过 100 层，请减少嵌套后重试。');
      if (tokens[index + 1] !== '}' && tokens[index + 1] !== ']') output += newline();
    } else if (token === '}' || token === ']') {
      depth--;
      if (tokens[index - 1] !== '{' && tokens[index - 1] !== '[') output += newline();
      output += token;
    } else if (token === ',') output += ',' + newline();
    else if (token === ':') output += ': ';
    else output += token;
  });
  return output;
}
