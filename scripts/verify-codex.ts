import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cases } from "../tests/cases.js";
import type { Data } from "../src/tools.js";

// This is a real AI-host acceptance run, not a substituted SDK call. It uses
// the client's existing login and only synthetic inputs. Never save raw events:
// password results and the AI client's own diagnostic data stay out of evidence.
const executable = process.argv[2] ?? "codex";
const version = spawnSync(executable, ["--version"], { encoding: "utf8" });
assert.equal(version.status, 0, "An installed Codex CLI is required.");
const workspace = mkdtempSync(join(tmpdir(), "toolrobin-codex-host-"));
const fixtures = cases.map((c) => ({
  tool: "toolrobin_" + c.name,
  arguments: c.valid,
}));
const invalid = [
  { tool: "toolrobin_json_format", arguments: { json: '{"x":}' } },
  {
    tool: "toolrobin_percentage",
    arguments: { mode: "share", first: "1", second: "0" },
  },
  {
    tool: "toolrobin_date_difference",
    arguments: { start: "2023-02-29", end: "2023-03-01" },
  },
];
const prompt = `Perform a real MCP acceptance test using only the configured toolrobin server.
Do not use shell, filesystem, browser, web, other servers, or your own calculations as substitutes.
If needed, discover ToolRobin tools using tool search. Actually call EVERY fixture below, with its exact arguments. These are synthetic test data.
${JSON.stringify(fixtures)}
Then actually call these three deliberately invalid cases. They should return errors; do not repair their arguments before calling.
${JSON.stringify(invalid)}
After all three errors, call toolrobin_json_format with {"json":"{\\"ok\\":true}"} to prove the session remains usable.
Also choose the right ToolRobin operations for these human requests:
1. A value of 200 increases by 15 percent. Return the adjusted amount, not just the percentage change.
2. Remove duplicate lines from " A \\na\\nB" ignoring case and edge spaces for detection, while retaining the first original line's spaces.
Do not print generated passwords or the QR SVG in your final response. Give only a brief completion count; the runner checks actual tool-call events.`;
type Call = {
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  result?: {
    structured_content?: Data;
    structuredContent?: Data;
    content?: Array<{ type: string; text?: string }>;
    is_error?: boolean;
    isError?: boolean;
  };
  error?: unknown;
  status?: string;
};
const calls: Call[] = [];
let nonMcpActions = 0;
let pending = "",
  completed = false,
  failed = false,
  stderrBytes = 0;
let usage: unknown;
const exitCode = await new Promise<number | null>((done, reject) => {
  const child = spawn(
    executable,
    [
      "exec",
      "--ephemeral",
      "--json",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--cd",
      workspace,
      "-c",
      'approval_policy="never"',
      "-c",
      `mcp_servers.toolrobin.command=${JSON.stringify(process.execPath)}`,
      "-c",
      `mcp_servers.toolrobin.args=${JSON.stringify([resolve("dist/index.js")])}`,
      "-c",
      "mcp_servers.toolrobin.required=true",
      "-",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const timer = setTimeout(() => child.kill("SIGTERM"), 240_000);
  child.once("error", (e) => {
    clearTimeout(timer);
    reject(e);
  });
  child.stderr.on("data", (c) => {
    stderrBytes += c.length;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      let event: {
        type?: string;
        item?: Call & { type?: string };
        usage?: unknown;
      };
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "turn.failed" || event.type === "error") failed = true;
      if (event.type === "turn.completed") {
        completed = true;
        usage = event.usage;
      }
      if (
        event.type === "item.completed" &&
        event.item?.type === "mcp_tool_call"
      ) {
        calls.push(event.item);
        process.stdout.write(
          `Host call observed: ${event.item.server}/${event.item.tool}\n`,
        );
      }
      if (
        event.type === "item.completed" &&
        ["command_execution", "web_search", "file_change"].includes(
          event.item?.type ?? "",
        )
      )
        nonMcpActions++;
    }
  });
  child.once("close", (code) => {
    clearTimeout(timer);
    done(code);
  });
  child.stdin.end(prompt);
});
function data(call: Call) {
  if (call.error || !call.result) return undefined;
  return (
    call.result.structured_content ??
    call.result.structuredContent ??
    (() => {
      const block = call.result?.content?.find((c) => c.type === "text");
      try {
        return JSON.parse(block?.text ?? "") as Data;
      } catch {
        return undefined;
      }
    })()
  );
}
function sameArgs(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown>,
) {
  // The host may explicitly send advertised defaults. Match required fixture
  // arguments, then let the fixture's independent result checks verify behavior.
  return (
    !!a &&
    Object.entries(b).every(
      ([k, v]) => JSON.stringify(a[k]) === JSON.stringify(v),
    )
  );
}
const results = cases.map((c) => {
  const call = calls.find(
    (x) =>
      x.server === "toolrobin" &&
      x.tool === "toolrobin_" + c.name &&
      sameArgs(x.arguments, c.valid),
  );
  let passed = false;
  try {
    if (call && data(call)) {
      c.verify(data(call)!);
      passed = true;
    }
  } catch {
    /* Do not print tool data. */
  }
  return {
    tool: "toolrobin_" + c.name,
    actualAssistantCall: !!call,
    independentResultCheck: passed ? "passed" : "failed",
  };
});
const errorChecks = invalid.map((c) => {
  const call = calls.find(
    (x) =>
      x.server === "toolrobin" &&
      x.tool === c.tool &&
      sameArgs(x.arguments, c.arguments),
  );
  const rejected =
    !!call &&
    (call.status === "failed" ||
      !!call.error ||
      !!call.result?.is_error ||
      !!call.result?.isError);
  return { tool: c.tool, actualAssistantCall: !!call, rejected };
});
const recovery = calls.find(
  (x) =>
    x.tool === "toolrobin_json_format" &&
    sameArgs(x.arguments, { json: '{"ok":true}' }),
);
const adjusted = calls.find(
  (x) =>
    x.tool === "toolrobin_percentage" &&
    sameArgs(x.arguments, { mode: "adjust", first: "200", second: "15" }),
);
const deduped = calls.find(
  (x) =>
    x.tool === "toolrobin_remove_duplicate_lines" &&
    sameArgs(x.arguments, { text: " A \na\nB", ignoreCase: true, trim: true }),
);
const sessionRecovery =
  !!recovery && data(recovery)?.output === '{\n  "ok": true\n}';
const naturalRequests = {
  percentageMode: !!adjusted && data(adjusted)?.value === "230",
  comparisonOnlyTrimming: !!deduped && data(deduped)?.output === " A \nB",
};
const unexpectedToolCalls = calls.filter(
  (c) => c.server !== "toolrobin",
).length;
const passed =
  exitCode === 0 &&
  completed &&
  !failed &&
  results.every((r) => r.independentResultCheck === "passed") &&
  errorChecks.every((r) => r.rejected) &&
  sessionRecovery &&
  Object.values(naturalRequests).every(Boolean) &&
  unexpectedToolCalls === 0 &&
  nonMcpActions === 0;
const report = {
  verifiedAt: new Date().toISOString(),
  clientVersion: version.stdout.trim(),
  actualAIHost: true,
  scope:
    "Ephemeral Codex CLI using existing authenticated client; synthetic inputs only; raw events/passwords not stored.",
  status: passed ? "passed" : "incomplete",
  exitCode,
  turnCompleted: completed,
  observedToolCalls: calls.length,
  unexpectedToolCalls,
  nonMcpActions,
  stderrBytes,
  results,
  errorChecks,
  sessionRecovery,
  naturalRequests,
  usage,
};
mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/codex.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write(
  `Codex actual assistant verification: ${report.status}; ${results.filter((r) => r.independentResultCheck === "passed").length}/18 tool results checked.\n`,
);
if (!passed) process.exitCode = 1;
