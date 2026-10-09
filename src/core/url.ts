// Pure-function extraction from src/tools/modules/url-codec.ts; see PROVENANCE.json.
import {validateInput} from "./contracts.js";

export function transformUrl(value: string, decode: boolean) {
  validateInput(value);
  try { return decode ? decodeURIComponent(value) : encodeURIComponent(value); }
  catch { throw new Error(decode ? '无法解码：请检查百分号编码是否完整、是否为有效的 UTF-8 字符。' : '无法编码：输入中存在不完整的 Unicode 字符。'); }
}