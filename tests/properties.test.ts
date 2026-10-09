import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../src/tools.js";
import type { DiffRow } from "../src/core/compare.js";

// Reproducible synthetic inputs, independent of the password random source.
function generator(seed: number) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
}
const call = (name: string, arguments_: Record<string, unknown>) =>
  executeTool("toolrobin_" + name, arguments_);

test("250 Unicode codec cases match Node UTF-8 encoding and round-trip without losing characters", () => {
  const next = generator(0x12af43);
  const characters = [
    "a",
    " ",
    "\n",
    "\0",
    "中",
    "é",
    "\u0301",
    "\uFEFF",
    "\u200D",
    "😀",
    "𐐀",
    "+",
    "%",
    "/",
    "&",
    "\u202E",
  ];
  for (let i = 0; i < 250; i++) {
    let text = i % 3 === 0 ? "\uFEFFh" : "h";
    for (let j = next() % 100; j > 0; j--)
      text += characters[next() % characters.length];
    const base64 = call("base64_encode", { text }).output as string;
    assert.equal(base64, Buffer.from(text, "utf8").toString("base64"));
    assert.equal(call("base64_decode", { text: base64 }).output, text);
    assert.equal(
      call("base64_decode", {
        text: Buffer.from(text, "utf8").toString("base64url"),
      }).output,
      text,
    );
    const encoded = call("url_encode", { text }).output as string;
    assert.equal(call("url_decode", { text: encoded }).output, text);
  }
});

test("200 structured JSON cases preserve semantics, escaped text and stable formatting", () => {
  const next = generator(0x53aba1);
  for (let i = 0; i < 200; i++) {
    const value = {
      number: next(),
      nested: [
        null,
        true,
        false,
        { text: '\\"[{}]😀\n\t', list: [next(), -next(), i / 8] },
      ],
      "__proto__-data": "ordinary key",
    };
    const input = JSON.stringify(value, null, "\t");
    const formatted = call("json_format", { json: input }).output as string;
    const compact = call("json_minify", { json: formatted }).output as string;
    assert.deepEqual(JSON.parse(formatted), value);
    assert.equal(compact, JSON.stringify(value));
    assert.equal(call("json_format", { json: formatted }).output, formatted);
  }
});

test("timestamp extremes keep exact millisecond and second spelling; 200 calendar cases reverse correctly", () => {
  const next = generator(0x94c1);
  const extremes = [
    -8_640_000_000_000_000, -8_639_999_999_999_999, -1001, -1, 0, 1, 1001,
    8_639_999_999_999_999, 8_640_000_000_000_000,
  ];
  const samples = [
    ...extremes,
    ...Array.from({ length: 200 }, () =>
      Math.trunc((next() / 0xffffffff - 0.5) * 17_280_000_000_000_000),
    ),
  ];
  for (const milliseconds of samples) {
    const result = call("timestamp_to_date", {
      value: String(milliseconds),
      unit: "milliseconds",
    });
    assert.equal(result.milliseconds, String(milliseconds));
    assert.equal(Date.parse(result.utc as string), milliseconds);
    const magnitude = BigInt(Math.abs(milliseconds));
    const fraction = (magnitude % 1000n)
      .toString()
      .padStart(3, "0")
      .replace(/0+$/, "");
    const seconds =
      (milliseconds < 0 ? "-" : "") +
      String(magnitude / 1000n) +
      (fraction ? "." + fraction : "");
    assert.equal(result.seconds, seconds);
  }
  for (let i = 0; i < 200; i++) {
    const milliseconds = Date.UTC(2000, 0, 1) + (next() % 50_000) * 86_400_000;
    const start = new Date(milliseconds).toISOString().slice(0, 10);
    const days = (next() % 4001) - 2000;
    const end = call("date_add_days", { start, days }).date as string;
    assert.equal(
      end,
      new Date(milliseconds + days * 86_400_000).toISOString().slice(0, 10),
    );
    assert.equal(call("date_difference", { start, end }).days, days);
    assert.equal(
      call("date_add_days", { start: end, days: -days }).date,
      start,
    );
    const utc = new Date(milliseconds + (next() % 86_400_000)).toISOString();
    const result = call("date_to_timestamp", { value: utc });
    assert.equal(result.milliseconds, String(Date.parse(utc)));
  }
});

test("200 line comparisons reconstruct both drafts and find a minimal edit sequence", () => {
  const next = generator(0x21015);
  const alphabet = ["A", "B", "C", " a ", "a"];
  function longestCommon(a: string[], b: string[]): number {
    if (!a.length || !b.length) return 0;
    if (a[0] === b[0]) return 1 + longestCommon(a.slice(1), b.slice(1));
    return Math.max(longestCommon(a.slice(1), b), longestCommon(a, b.slice(1)));
  }
  for (let i = 0; i < 200; i++) {
    const a = Array.from(
      { length: 1 + (next() % 6) },
      () => alphabet[next() % alphabet.length]!,
    );
    const b = Array.from(
      { length: 1 + (next() % 6) },
      () => alphabet[next() % alphabet.length]!,
    );
    const result = call("text_compare", {
      before: a.join("\n"),
      after: b.join("\n"),
    });
    const rows = result.rows as DiffRow[];
    assert.deepEqual(
      rows.filter((row) => row.kind !== "add").map((row) => row.text),
      a,
    );
    assert.deepEqual(
      rows.filter((row) => row.kind !== "remove").map((row) => row.text),
      b,
    );
    assert.equal(result.unchanged, longestCommon(a, b));
    assert.equal(result.removed, a.length - (result.unchanged as number));
    assert.equal(result.added, b.length - (result.unchanged as number));
  }
});
