import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { verifyProtocol } from "../scripts/protocol-check.js";

test(
  "real stdio discovery and all 18 tools work with network and listening sockets denied",
  { timeout: 30_000 },
  async () => {
    const result = await verifyProtocol({
      command: process.execPath,
      args: [
        "--import",
        resolve("tests/deny-network.mjs"),
        resolve("dist/index.js"),
      ],
    });
    assert.equal(result.toolCount, 18);
  },
);
test(
  "an oversized incomplete frame closes safely without logging its contents",
  { timeout: 10_000 },
  async () => {
    const child = spawn(process.execPath, [resolve("dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    // The transport may close its pipe before this write finishes.
    child.stdin.on("error", () => {});
    try {
      const exit = new Promise<void>((done, reject) => {
        child.once("exit", () => done());
        child.once("error", reject);
      });
      child.stdin.end("SYNTHETIC_SECRET" + "a".repeat(1_048_577));
      await exit;
      assert.equal(stdout, "");
      assert.match(stderr, /MCP message rejected/);
      assert.doesNotMatch(stderr, /SYNTHETIC_SECRET/);
    } finally {
      child.kill();
    }
  },
);
