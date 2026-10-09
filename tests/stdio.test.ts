import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { verifyProtocol } from "../scripts/protocol-check.js";
import { cases } from "./cases.js";
import type { Data } from "../src/tools.js";

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
  "untrusted parameter names produce bounded corrections and malformed containers leave every tool usable",
  { timeout: 30_000 },
  async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        resolve("tests/deny-network.mjs"),
        resolve("dist/index.js"),
      ],
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const client = new Client({
      name: "toolrobin-hostile-input-check",
      version: "1",
    });
    await client.connect(transport);
    const marker = "SYNTHETIC_PARAMETER_MUST_NOT_ECHO";
    try {
      for (const fixture of cases) {
        const name = "toolrobin_" + fixture.name;
        for (const arguments_ of [
          { ...fixture.valid, [marker + "x".repeat(50_000)]: "synthetic" },
          {
            ...fixture.valid,
            ...Object.fromEntries([
              ["__proto__", { polluted: true }],
              ["constructor", "synthetic"],
            ]),
          },
          {
            ...fixture.valid,
            unexpected: Array.from({ length: 3_000 }, () => ({ nested: [] })),
          },
        ]) {
          const rejected = await client.callTool({
            name,
            arguments: arguments_,
          });
          const serialized = JSON.stringify(rejected);
          assert.equal(rejected.isError, true, name);
          assert.ok(Buffer.byteLength(serialized) < 1_024, name);
          assert.doesNotMatch(serialized, new RegExp(marker));
          assert.doesNotMatch(serialized, /__proto__|polluted/);
          const recovery = await client.callTool({
            name,
            arguments: fixture.valid,
          });
          assert.notEqual(recovery.isError, true, name);
          fixture.verify(recovery.structuredContent as Data);
        }
      }
      const correction = await client.callTool({
        name: "toolrobin_word_counter",
        arguments: { text: "hello", wrong: true },
      });
      assert.match(JSON.stringify(correction), /Allowed parameters: text/);
      assert.equal(stderr, "");
      assert.equal(({} as { polluted?: boolean }).polluted, undefined);
    } finally {
      await client.close();
    }
  },
);
test(
  "a burst of malformed protocol frames closes with one diagnostic and no payload echo",
  { timeout: 10_000 },
  async (context) => {
    const child = spawn(process.execPath, [resolve("dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.on("error", () => {});
    context.signal.addEventListener("abort", () => child.kill("SIGKILL"), {
      once: true,
    });
    const exit = new Promise<void>((done, reject) => {
      child.once("exit", () => done());
      child.once("error", reject);
    });
    try {
      child.stdin.write("SYNTHETIC_DAMAGED_FRAME\n".repeat(1_000));
      await exit;
      assert.equal(stdout, "");
      assert.match(stderr, /connection closed/);
      assert.equal(stderr.trim().split("\n").length, 1);
      assert.ok(Buffer.byteLength(stderr) < 256);
      assert.doesNotMatch(stderr, /SYNTHETIC_DAMAGED_FRAME/);
    } finally {
      child.kill();
    }
  },
);
test(
  "SIGTERM releases a connected stdio process while the host keeps its input pipe open",
  { timeout: 10_000, skip: process.platform === "win32" },
  async (context) => {
    const child = spawn(process.execPath, [resolve("dist/index.js")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.on("error", () => {});
    context.signal.addEventListener("abort", () => child.kill("SIGKILL"), {
      once: true,
    });
    const exit = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((done, reject) => {
      child.once("exit", (code, signal) => done({ code, signal }));
      child.once("error", reject);
    });
    const ready = new Promise<void>((done) => {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
        if (stdout.includes("\n")) done();
      });
    });
    try {
      child.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "shutdown-check", version: "1" },
          },
        }) + "\n",
      );
      await ready;
      assert.equal(
        JSON.parse(stdout.trim()).result.serverInfo.name,
        "toolrobin-mcp",
      );
      child.kill("SIGTERM");
      assert.deepEqual(await exit, { code: 0, signal: null });
      assert.equal(stderr, "");
    } finally {
      child.kill("SIGKILL");
    }
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
