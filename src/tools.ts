import * as z from "zod";
import QRCode from "qrcode";
import { analyzeText } from "./core/text-stats.js";
import { cleanupText } from "./core/cleanup.js";
import { dedupeLines } from "./core/dedupe.js";
import { encodeBase64Text, decodeBase64Text } from "./core/base64.js";
import { transformUrl } from "./core/url.js";
import { formatJson } from "./core/json.js";
import { compareText } from "./core/compare.js";
import { timestampToDate, dateToTimestamp } from "./core/timestamp.js";
import { dateDifference, addDays } from "./core/dates.js";
import { calculate } from "./core/percentage.js";
import { generatePasswords, entropyBits } from "./core/password.js";
import { validateQr, svgFromMatrix } from "./core/qr.js";
import { buildMetaPreview } from "./core/meta.js";

export const MAX_INPUT_UNITS = 100_000;
export const MAX_RESULT_BYTES = 1_048_576;
export type Data = Record<string, unknown>;
export interface ToolDefinition {
  name: string;
  description: string;
  website: string;
  schema: z.ZodObject;
  execute: (args: unknown) => Data;
}
const text = () =>
  z
    .string()
    .max(MAX_INPUT_UNITS)
    .describe("Text, at most 100,000 UTF-16 code units.");
const nonblank = () =>
  text().refine((v) => v.trim().length > 0, {
    message: "Enter non-blank text.",
  });
const bool = (value: boolean) => z.boolean().default(value);
const decimal = () =>
  z
    .string()
    .max(24)
    .regex(/^[+-]?\d{1,15}(?:\.\d{1,6})?$/)
    .describe(
      "Decimal string, up to 15 integer digits and 6 decimal places; no units or exponent.",
    );
const day = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .max(10)
    .describe("Real calendar date YYYY-MM-DD, years 0001–9999.");
function define<S extends z.ZodRawShape>(
  name: string,
  description: string,
  slug: string,
  fields: S,
  execute: (args: z.output<z.ZodObject<S>>) => Data,
): ToolDefinition {
  const schema = z.strictObject(fields);
  return {
    name: "toolrobin_" + name,
    description,
    website: "https://toolrobin.com/tools/" + slug + "/",
    schema,
    execute: (input) => execute(schema.parse(input)),
  };
}
// Adapter-only allocation guard; the original lexical JSON formatter is unchanged.
function checkJsonDepth(text: string) {
  let depth = 0,
    inString = false,
    escape = false;
  for (const c of text) {
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[" || c === "{") {
      if (++depth > 100) throw Error("JSON nesting exceeds 100 levels.");
    } else if (c === "]" || c === "}") depth--;
  }
}
const json = (input: string, compact: boolean) => {
  checkJsonDepth(input);
  return {
    output: formatJson(input, compact),
    mode: compact ? "minify" : "format",
    numbersPreserved: true,
  };
};
export const tools: ToolDefinition[] = [
  define(
    "word_counter",
    "Count non-whitespace graphemes, Han characters, Latin/number words and paragraphs in text.",
    "text-stats",
    { text: nonblank() },
    ({ text }) => ({
      ...analyzeText(text),
      wordRule:
        "Latin/number tokens; Han characters counted separately, not a universal language word count.",
    }),
  ),
  define(
    "text_cleanup",
    "Normalize whitespace and line endings using explicit trimming, spacing and paragraph options.",
    "text-cleanup",
    {
      text: nonblank(),
      trimLines: bool(true),
      collapseSpaces: bool(true),
      lineBreaks: z.enum(["keep", "paragraphs", "single"]).default("keep"),
    },
    ({ text, ...options }) => ({ output: cleanupText(text, options) }),
  ),
  define(
    "text_compare",
    "Compare two text drafts line by line and return additions, removals and unchanged lines.",
    "text-compare",
    {
      before: text(),
      after: text(),
      ignoreCase: bool(false),
      trimEdges: bool(false),
    },
    ({ before, after, ...options }) => ({
      ...compareText(before, after, options),
    }),
  ),
  define(
    "remove_duplicate_lines",
    "Remove repeated lines under explicit case, trimming and blank-line rules while preserving kept text.",
    "remove-duplicate-lines",
    {
      text: nonblank(),
      ignoreCase: bool(false),
      trim: bool(false),
      removeBlank: bool(false),
    },
    ({ text, ...options }) => ({ ...dedupeLines(text, options) }),
  ),
  define(
    "base64_encode",
    "Encode well-formed Unicode text as UTF-8 Base64 without reading files.",
    "base64-codec",
    { text: text() },
    ({ text }) => ({ output: encodeBase64Text(text), encoding: "UTF-8" }),
  ),
  define(
    "base64_decode",
    "Decode standard or URL-safe Base64 to strictly valid UTF-8 text.",
    "base64-codec",
    { text: text() },
    ({ text }) => ({ output: decodeBase64Text(text), encoding: "UTF-8" }),
  ),
  define(
    "url_encode",
    "Percent-encode a Unicode URL component without opening or fetching a URL.",
    "url-codec",
    { text: nonblank() },
    ({ text }) => ({
      output: transformUrl(text, false),
      operation: "encodeURIComponent",
    }),
  ),
  define(
    "url_decode",
    "Decode a percent-encoded URL component, leave '+' unchanged, and reject malformed escapes or UTF-8.",
    "url-codec",
    { text: nonblank() },
    ({ text }) => ({
      output: transformUrl(text, true),
      operation: "decodeURIComponent",
    }),
  ),
  define(
    "json_format",
    "Indent valid JSON while preserving original numeric tokens, duplicate keys and key order.",
    "json-format",
    { json: nonblank() },
    ({ json: input }) => json(input, false),
  ),
  define(
    "json_minify",
    "Remove insignificant whitespace from valid JSON without rounding numeric tokens.",
    "json-format",
    { json: nonblank() },
    ({ json: input }) => json(input, true),
  ),
  define(
    "timestamp_to_date",
    "Convert an explicit whole-number seconds or milliseconds Unix timestamp to UTC ISO text and both units.",
    "timestamp-converter",
    {
      value: z
        .string()
        .max(17)
        .regex(/^-?\d{1,16}$/),
      unit: z.enum(["seconds", "milliseconds"]),
    },
    ({ value, unit }) => ({ ...timestampToDate(value, unit) }),
  ),
  define(
    "date_to_timestamp",
    "Convert a valid ISO date-time with an explicit timezone to Unix seconds, milliseconds and UTC.",
    "timestamp-converter",
    { value: z.string().max(35).min(20) },
    ({ value }) => ({ ...dateToTimestamp(value) }),
  ),
  define(
    "date_difference",
    "Calculate signed calendar-day differences between two real dates with optional inclusive counting.",
    "date-calculator",
    { start: day(), end: day(), inclusive: bool(false) },
    ({ start, end, inclusive }) => ({
      days: dateDifference(start, end, inclusive),
      inclusive,
      rule: "Calendar days without local timezone or DST.",
    }),
  ),
  define(
    "date_add_days",
    "Add or subtract a bounded whole-day offset and return a YYYY-MM-DD calendar date.",
    "date-calculator",
    { start: day(), days: z.number().int().min(-3_652_058).max(3_652_058) },
    ({ start, days }) => ({ date: addDays(start, String(days)) }),
  ),
  define(
    "percentage",
    "Calculate a percentage, share, change, adjustment or discount using decimal strings and exact integer arithmetic.",
    "percentage",
    {
      mode: z
        .enum(["percent", "share", "change", "adjust", "discount"])
        .describe(
          "percent: first × second%; share: first/second × 100%; change: old first to new second; adjust: first adjusted by second%; discount: first price with second% off.",
        ),
      first: decimal().describe(
        "Base amount (percent/adjust), part (share), original value (change), or original price (discount). Decimal string: up to 15 integer digits and 6 decimal places.",
      ),
      second: decimal().describe(
        "Percentage (percent/adjust/discount), positive total (share), or new value (change). Decimal string: up to 15 integer digits and 6 decimal places.",
      ),
    },
    ({ mode, first, second }) => ({
      ...calculate(mode, first, second),
      precision:
        "Rounded to at most 6 decimal places; approximate flags a non-exact result.",
    }),
  ),
  define(
    "password_generator",
    "Generate one or ten cryptographically random passwords and an entropy estimate from selected character groups.",
    "password-generator",
    {
      length: z.number().int().min(8).max(64).default(20),
      count: z.union([z.literal(1), z.literal(10)]).default(1),
      uppercase: bool(true),
      lowercase: bool(true),
      digits: bool(true),
      symbols: bool(true),
      excludeAmbiguous: bool(false),
    },
    (options) => ({
      passwords: generatePasswords(options),
      entropyBits: entropyBits(options),
      note: "Entropy is an estimate, not a security guarantee; use unique passwords and a password manager. Your AI host may store tool results.",
    }),
  ),
  define(
    "qr_code",
    "Generate a QR matrix and SVG text from up to 1,200 UTF-8 bytes without opening encoded links.",
    "qr-code",
    {
      text: z.string().min(1).max(1200),
      scale: z.union([z.literal(4), z.literal(8), z.literal(12)]).default(8),
      level: z.enum(["M", "H"]).default("M"),
    },
    (options) => {
      validateQr(options);
      const matrix = QRCode.create(options.text, {
        errorCorrectionLevel: options.level,
      }).modules;
      return {
        svg: svgFromMatrix(matrix, options.scale),
        width: (matrix.size + 8) * options.scale,
        height: (matrix.size + 8) * options.scale,
        modules: matrix.size,
        errorCorrection: options.level,
        quietZone: 4,
      };
    },
  ),
  define(
    "meta_preview",
    "Generate escaped HTML title, description, canonical, Open Graph and Twitter tags from supplied fields without fetching URLs.",
    "meta-preview",
    {
      title: z.string().min(1).max(120),
      description: z.string().min(1).max(320),
      pageUrl: z.string().min(1).max(2048),
      imageUrl: z.string().max(2048).default(""),
    },
    (fields) => ({ ...buildMetaPreview(fields) }),
  ),
];
export const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
const errors: Record<string, string> = {
  "请先输入需要处理的内容。": "Enter non-blank text.",
  "单次最多处理 10 万字符（部分表情计为多个字符），请缩短内容后重试。":
    "Use at most 100,000 UTF-16 code units.",
  "JSON 格式有误。请检查引号、逗号和括号；内容未被修改。":
    "Invalid JSON: check quotes, commas and brackets; input is unchanged.",
  "嵌套超过 100 层，请减少嵌套后重试。": "JSON nesting exceeds 100 levels.",
  "无法解码：请检查百分号编码是否完整、是否为有效的 UTF-8 字符。":
    "Invalid percent encoding or UTF-8 sequence.",
  "无法编码：输入中存在不完整的 Unicode 字符。":
    "Input contains an unmatched Unicode surrogate.",
};
export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return (
      "Invalid arguments: " +
      error.issues
        .slice(0, 3)
        .map((i) => i.path.join(".") + ": " + i.message)
        .join("; ")
    );
  if (error instanceof Error) return errors[error.message] ?? error.message;
  return "The operation could not finish.";
}
export function executeTool(name: string, args: unknown): Data {
  const tool = toolByName.get(name);
  if (!tool) throw Error("Unknown ToolRobin tool.");
  const result = tool.execute(args);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_RESULT_BYTES)
    throw Error(
      "Result exceeds 1 MiB. Use a smaller input or JSON minification.",
    );
  return result;
}
