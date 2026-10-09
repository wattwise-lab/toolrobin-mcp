import assert from "node:assert/strict";
import type { Data } from "../src/tools.js";
export interface Case {
  name: string;
  valid: Record<string, unknown>;
  invalid: Record<string, unknown>;
  verify: (result: Data) => void;
}
export const cases: Case[] = [
  {
    name: "word_counter",
    valid: { text: "你好 world 👨‍👩‍👧‍👦\n\nCafé 42" },
    invalid: { text: " " },
    verify: (r) => {
      assert.equal(r.characters, 14);
      assert.equal(r.han, 2);
      assert.equal(r.words, 3);
      assert.equal(r.paragraphs, 2);
    },
  },
  {
    name: "text_cleanup",
    valid: { text: "  Hello  world\r\n next  " },
    invalid: { text: "x", lineBreaks: "delete" },
    verify: (r) => assert.equal(r.output, "Hello world\nnext"),
  },
  {
    name: "text_compare",
    valid: { before: "a\nb", after: "a\nc" },
    invalid: { before: "", after: "" },
    verify: (r) => {
      assert.equal(r.added, 1);
      assert.equal(r.removed, 1);
      assert.equal(r.unchanged, 1);
    },
  },
  {
    name: "remove_duplicate_lines",
    valid: { text: "a\nb\na" },
    invalid: { text: "\n" },
    verify: (r) => {
      assert.equal(r.output, "a\nb");
      assert.equal(r.before, 3);
      assert.equal(r.after, 2);
    },
  },
  {
    name: "base64_encode",
    valid: { text: "你好" },
    invalid: { text: "\ud800" },
    verify: (r) => assert.equal(r.output, "5L2g5aW9"),
  },
  {
    name: "base64_decode",
    valid: { text: "5L2g5aW9" },
    invalid: { text: "%%%" },
    verify: (r) => assert.equal(r.output, "你好"),
  },
  {
    name: "url_encode",
    valid: { text: "a b+你" },
    invalid: { text: "\ud800" },
    verify: (r) => assert.equal(r.output, "a%20b%2B%E4%BD%A0"),
  },
  {
    name: "url_decode",
    valid: { text: "a%20b%2B%E4%BD%A0" },
    invalid: { text: "%E4" },
    verify: (r) => assert.equal(r.output, "a b+你"),
  },
  {
    name: "json_format",
    valid: { json: '{"n":9007199254740993,"n":1e+9}' },
    invalid: { json: '{"x":}' },
    verify: (r) =>
      assert.equal(r.output, '{\n  "n": 9007199254740993,\n  "n": 1e+9\n}'),
  },
  {
    name: "json_minify",
    valid: { json: '{ "n": 9007199254740993, "n": 1e+9 }' },
    invalid: { json: "[1,]" },
    verify: (r) => assert.equal(r.output, '{"n":9007199254740993,"n":1e+9}'),
  },
  {
    name: "timestamp_to_date",
    valid: { value: "0", unit: "seconds" },
    invalid: { value: "1.5", unit: "seconds" },
    verify: (r) => assert.equal(r.utc, "1970-01-01T00:00:00.000Z"),
  },
  {
    name: "date_to_timestamp",
    valid: { value: "1970-01-01T08:00:00+08:00" },
    invalid: { value: "2026-02-30T00:00:00Z" },
    verify: (r) => assert.equal(r.seconds, "0"),
  },
  {
    name: "date_difference",
    valid: { start: "2024-02-28", end: "2024-03-01" },
    invalid: { start: "2023-02-29", end: "2023-03-01" },
    verify: (r) => assert.equal(r.days, 2),
  },
  {
    name: "date_add_days",
    valid: { start: "2024-02-28", days: 1 },
    invalid: { start: "9999-12-31", days: 1 },
    verify: (r) => assert.equal(r.date, "2024-02-29"),
  },
  {
    name: "percentage",
    valid: { mode: "share", first: "1", second: "3" },
    invalid: { mode: "share", first: "1", second: "0" },
    verify: (r) => {
      assert.equal(r.value, "33.333333%");
      assert.equal(r.approximate, true);
    },
  },
  {
    name: "password_generator",
    valid: { length: 20, count: 10, excludeAmbiguous: true },
    invalid: {
      length: 8,
      uppercase: false,
      lowercase: false,
      digits: false,
      symbols: false,
    },
    verify: (r) => {
      const ps = r.passwords as string[];
      assert.equal(ps.length, 10);
      assert.equal(new Set(ps).size, 10);
      for (const p of ps) {
        assert.equal(p.length, 20);
        assert.match(p, /[A-Z]/);
        assert.match(p, /[a-z]/);
        assert.match(p, /[0-9]/);
        assert.match(p, /[^A-Za-z0-9]/);
        assert.doesNotMatch(p, /[0O1lI]/);
      }
      assert.ok((r.entropyBits as number) > 100);
    },
  },
  {
    name: "qr_code",
    valid: { text: "https://example.com/a?x=1&x=2" },
    invalid: { text: "你好".repeat(201) },
    verify: (r) => {
      assert.match(r.svg as string, /^<svg /);
      assert.equal(r.quietZone, 4);
      assert.equal(r.width, r.height);
    },
  },
  {
    name: "meta_preview",
    valid: {
      title: "A < B",
      description: 'D "quoted"',
      pageUrl: "https://example.com/",
      imageUrl: "https://example.com/image.png",
    },
    invalid: { title: "A", description: "D", pageUrl: "javascript:alert(1)" },
    verify: (r) => {
      assert.match(r.tags as string, /<title>A &lt; B<\/title>/);
      assert.match(r.tags as string, /&quot;quoted&quot;/);
      assert.equal(r.domain, "example.com");
    },
  },
];
