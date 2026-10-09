import { test } from "node:test";
import assert from "node:assert/strict";
import { tools, executeTool, errorMessage } from "../src/tools.js";
import { cases } from "./cases.js";
import { entropyBits, generatePasswords } from "../src/core/password.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { QRCode } from "jsqr";
const jsQR = createRequire(import.meta.url)("jsqr") as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => QRCode | null;

for (const c of cases) {
  test(`${c.name}: normal input`, () =>
    c.verify(executeTool("toolrobin_" + c.name, c.valid)));
  test(`${c.name}: rejects invalid input`, () =>
    assert.throws(() => executeTool("toolrobin_" + c.name, c.invalid)));
  test(`${c.name}: rejects unknown argument keys`, () =>
    assert.throws(() =>
      executeTool("toolrobin_" + c.name, {
        ...c.valid,
        __proto_payload: "not accepted",
      }),
    ));
}
test("complete, unique names and bounded JSON schemas", () => {
  assert.equal(tools.length, 18);
  assert.equal(new Set(tools.map((t) => t.name)).size, 18);
  for (const tool of tools) {
    assert.match(tool.name, /^toolrobin_[a-z][a-z0-9_]*$/);
    assert.ok(tool.description);
    assert.ok(tool.website.startsWith("https://toolrobin.com/"));
  }
  assert.throws(() => executeTool("unknown", {}));
});
test("limits reject long text and excessive line counts", () => {
  assert.throws(() =>
    executeTool("toolrobin_word_counter", { text: "a".repeat(100001) }),
  );
  assert.throws(() =>
    executeTool("toolrobin_text_compare", {
      before: "a\n".repeat(1501),
      after: "b",
    }),
  );
  assert.throws(() =>
    executeTool("toolrobin_text_compare", {
      before: "a",
      after: "b".repeat(100001),
    }),
  );
  assert.throws(() =>
    executeTool("toolrobin_qr_code", { text: "a".repeat(1201) }),
  );
});
test("JSON guard applies to both modes, ignores brackets inside strings, and preserves adversarial keys as data", () => {
  for (const name of ["json_format", "json_minify"])
    assert.throws(() =>
      executeTool("toolrobin_" + name, {
        json: "[".repeat(101) + "0" + "]".repeat(101),
      }),
    );
  assert.equal(
    executeTool("toolrobin_json_minify", {
      json: '{"__proto__":{},"x":"[\\\"}\\\"]"}',
    }).output,
    '{"__proto__":{},"x":"[\\\"}\\\"]"}',
  );
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.throws(() =>
    executeTool("toolrobin_json_format", {
      json:
        "[".repeat(100) +
        "[" +
        "0,".repeat(40000) +
        "0" +
        "]" +
        "]".repeat(100),
    }),
  );
});
test("Base64 strict UTF-8, URL-safe input, Unicode and padding", () => {
  assert.equal(
    executeTool("toolrobin_base64_decode", { text: "SGVsbG8" }).output,
    "Hello",
  );
  assert.equal(
    executeTool("toolrobin_base64_decode", { text: "8J-YgA" }).output,
    "😀",
  );
  assert.throws(() => executeTool("toolrobin_base64_decode", { text: "/w==" }));
  assert.throws(() => executeTool("toolrobin_base64_decode", { text: "Y===" }));
  assert.equal(executeTool("toolrobin_base64_encode", { text: "" }).output, "");
});
test("calendar boundaries, reverse inclusive days and exact large percentage values", () => {
  assert.equal(
    executeTool("toolrobin_date_add_days", { start: "0001-01-01", days: 0 })
      .date,
    "0001-01-01",
  );
  assert.throws(() =>
    executeTool("toolrobin_date_add_days", { start: "0001-01-01", days: -1 }),
  );
  assert.equal(
    executeTool("toolrobin_date_difference", {
      start: "2024-03-01",
      end: "2024-02-28",
      inclusive: true,
    }).days,
    -3,
  );
  assert.equal(
    executeTool("toolrobin_percentage", {
      mode: "percent",
      first: "999999999999999",
      second: "100",
    }).value,
    "999999999999999",
  );
  assert.throws(() =>
    executeTool("toolrobin_percentage", {
      mode: "discount",
      first: "100",
      second: "101",
    }),
  );
  assert.throws(() =>
    executeTool("toolrobin_timestamp_to_date", {
      value: "9999999999999999",
      unit: "milliseconds",
    }),
  );
  assert.throws(() =>
    executeTool("toolrobin_date_to_timestamp", {
      value: "2026-01-01T00:00:00",
    }),
  );
});
test("password rejects stuck random source and estimates the restricted alphabet without Math.random", () => {
  const o = {
    length: 8,
    uppercase: true,
    lowercase: false,
    digits: false,
    symbols: false,
    excludeAmbiguous: false,
  };
  assert.throws(() =>
    generatePasswords(o, {
      getRandomValues: (a) => {
        a.fill(255);
        return a;
      },
    }),
  );
  assert.ok(Math.abs(entropyBits(o) - 8 * Math.log2(26)) < 1e-10);
  assert.doesNotMatch(
    readFileSync("src/core/password.ts", "utf8"),
    /Math\.random/,
  );
});
test("QR output is independently decoded from returned SVG coordinates", () => {
  const text = "https://example.com/a?x=1&x=2";
  const r = executeTool("toolrobin_qr_code", { text });
  const svg = r.svg as string;
  const width = r.width as number,
    size = (r.modules as number) + 8,
    scale = width / size;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const path = /<path fill="#000" d="([^"]*)"/.exec(svg)?.[1];
  assert.ok(path);
  for (const m of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(m[1]) * scale,
      y = Number(m[2]) * scale;
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const i = ((y + dy) * width + x + dx) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
  }
  assert.equal(jsQR(pixels, width, width)?.data, text);
  assert.doesNotMatch(svg, /https:\/\/example\.com/);
});
test("metadata validates URLs without fetching; escapes content, forbids credentials and executable schemes", () => {
  assert.throws(() =>
    executeTool("toolrobin_meta_preview", {
      title: "a",
      description: "b",
      pageUrl: "https://user:pass@example.com",
    }),
  );
  assert.throws(() =>
    executeTool("toolrobin_meta_preview", {
      title: "a",
      description: "b",
      pageUrl: "https://example.com",
      imageUrl: "file:///tmp/a",
    }),
  );
  assert.match(
    executeTool("toolrobin_meta_preview", {
      title: "<script>x</script>",
      description: "y",
      pageUrl: "https://example.com",
    }).tags as string,
    /&lt;script&gt;/,
  );
});
test("copied core is self-contained and matches recorded provenance hashes", () => {
  const p = JSON.parse(readFileSync("PROVENANCE.json", "utf8")) as {
    files: Array<{ destination: string; copiedSha256: string }>;
  };
  for (const f of p.files) {
    assert.equal(
      createHash("sha256").update(readFileSync(f.destination)).digest("hex"),
      f.copiedSha256,
    );
    assert.doesNotMatch(readFileSync(f.destination, "utf8"), /from ['"]\//);
  }
});
test("operation errors are English and do not echo invalid JSON content", () => {
  try {
    executeTool("toolrobin_json_format", { json: "SECRET_NOT_JSON" });
    assert.fail();
  } catch (e) {
    const message = errorMessage(e);
    assert.match(message, /Invalid JSON/);
    assert.doesNotMatch(message, /SECRET_NOT_JSON/);
  }
});
