import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  readFile,
  copyFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { verifyProtocol } from "./protocol-check.js";
const run = promisify(execFile);
const root = resolve("."),
  directory = await mkdtemp(join(tmpdir(), "toolrobin-mcp-package-"));
const cache =
  process.env.TOOLROBIN_TEST_NPM_CACHE ??
  join(tmpdir(), "toolrobin-mcp-npm-cache");
const npm = process.platform === "win32" ? "npm.cmd" : "npm",
  npx = process.platform === "win32" ? "npx.cmd" : "npx";
await writeFile(
  join(directory, "package.json"),
  JSON.stringify({
    name: "toolrobin-package-verification",
    version: "0.0.0",
    private: true,
  }),
);
const packed = await run(
  npm,
  ["pack", "--json", "--pack-destination", directory, "--cache", cache],
  { cwd: root, timeout: 60_000, maxBuffer: 2_000_000 },
);
const packages = JSON.parse(packed.stdout) as Array<{
  filename: string;
  files: Array<{ path: string }>;
}>;
assert.equal(packages.length, 1);
const pkg = packages[0]!;
assert.ok(pkg.files.some((f) => f.path === "dist/index.js"));
assert.ok(pkg.files.some((f) => f.path === "README.md"));
assert.ok(pkg.files.some((f) => f.path === "LICENSE"));
assert.ok(pkg.files.some((f) => f.path === "PROVENANCE.json"));
assert.ok(pkg.files.some((f) => f.path === "THIRD_PARTY_NOTICES.txt"));
for (const file of pkg.files)
  assert.doesNotMatch(file.path, /^(node_modules|evidence|\.git|tests)\//);
const tarball = join(directory, pkg.filename);
await run(
  npm,
  [
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    cache,
    tarball,
  ],
  { cwd: directory, timeout: 120_000, maxBuffer: 1_000_000 },
);
const installed = JSON.parse(
  await readFile(
    join(directory, "node_modules/@toolrobin/mcp/package.json"),
    "utf8",
  ),
) as { version: string };
assert.equal(installed.version, "0.1.0");
const report = await verifyProtocol({
  command: npx,
  args: [
    "--yes",
    "--offline",
    "--cache",
    cache,
    "--loglevel=error",
    "--package",
    tarball,
    "toolrobin-mcp",
  ],
  cwd: directory,
});
await mkdir("evidence", { recursive: true });
await copyFile(tarball, resolve(pkg.filename));
await writeFile(
  "evidence/package.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      package: pkg.filename,
      sha256: createHash("sha256")
        .update(await readFile(tarball))
        .digest("hex"),
      files: pkg.files.map((f) => f.path),
      cleanInstall: "passed",
      launch: "npx local tarball, offline, from a clean temporary project",
      ...report,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Package passed: ${pkg.files.length} files; clean install; offline npx; ${report.toolCount} tools and ${report.toolCalls} verified calls.\n`,
);
