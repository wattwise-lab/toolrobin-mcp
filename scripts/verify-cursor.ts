import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { cases } from "../tests/cases.js";
import type { Data } from "../src/tools.js";

const executable = process.argv[2] ?? "cursor-agent";
const version = spawnSync(executable, ["--version"], { encoding: "utf8" });
assert.equal(
  version.status,
  0,
  "An installed official Cursor CLI is required.",
);
const workspace = mkdtempSync(join(tmpdir(), "toolrobin-cursor-host-"));
mkdirSync(join(workspace, ".cursor"));
const configured = JSON.parse(
  readFileSync(join(homedir(), ".cursor/mcp.json"), "utf8"),
) as {
  mcpServers: Record<
    string,
    { type?: string; command?: string; args?: string[] }
  >;
};
const entry = configured.mcpServers.toolrobin;
assert.ok(
  entry?.command && entry.args?.[0],
  "Configure the built ToolRobin server in ~/.cursor/mcp.json first.",
);
assert.equal(
  realpathSync(entry.args[0]),
  realpathSync(resolve("dist/index.js")),
  "The client must use this project's current build.",
);
// Only this disposable workspace authorizes ToolRobin. Do not use --force,
// change global permissions, or grant shell/file/network tools to the test.
writeFileSync(
  join(workspace, ".cursor/cli.json"),
  JSON.stringify({
    permissions: {
      allow: ["Mcp(toolrobin:*)"],
      deny: [
        "Shell(*)",
        "Read(*)",
        "Write(*)",
        "WebFetch(*)",
        ...Object.keys(configured.mcpServers)
          .filter((name) => name !== "toolrobin")
          .map((name) => `Mcp(${name}:*)`),
      ],
    },
  }),
);
// Use the already-approved real client entry. Creating a second project entry
// requires separate Cursor approval and does not test the installed connection.
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
const prompt = `Perform a real MCP acceptance test using only toolrobin. Discover its tools if necessary. No shell, filesystem, web, other servers or subagents.
Actually call EVERY fixture with the exact synthetic arguments, not your own calculations:
${JSON.stringify(fixtures)}
Then call all three deliberately invalid cases unchanged. Tool errors are expected; continue after each:
${JSON.stringify(invalid)}
After the errors, call toolrobin_json_format with {"json":"{\\"ok\\":true}"} to prove recovery.
Also select the right operations for these two human requests:
1. A value of 200 increases by 15 percent. Return the adjusted amount.
2. Remove duplicates from " A \\na\\nB", ignoring case and edge spaces for comparison, retaining the first original line's spaces.
Do not print generated passwords or QR SVG. Finish with a brief count only. The runner independently checks actual call events.`;
type Call = {
  args: {
    serverIdentifier?: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };
  result?: {
    success?: {
      content?: Array<{ text?: { text?: string } }>;
      isError?: boolean;
    };
    permissionDenied?: unknown;
    error?: unknown;
  };
};
const calls: Call[] = [];
let pending = "",
  nonMcpActions = 0,
  completed = false,
  failed = false,
  stderrBytes = 0;
const exitCode = await new Promise<number | null>((done, reject) => {
  const child = spawn(
    executable,
    [
      "--workspace",
      workspace,
      "--trust",
      "--sandbox",
      "enabled",
      "--mode",
      "ask",
      "--print",
      "--output-format",
      "stream-json",
      prompt,
    ],
    { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] },
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
        subtype?: string;
        is_error?: boolean;
        tool_call?: { mcpToolCall?: Call; getMcpToolsToolCall?: unknown };
      };
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "result") {
        completed = true;
        failed ||= event.subtype !== "success" || !!event.is_error;
      }
      if (event.type === "tool_call" && event.subtype === "completed") {
        const call = event.tool_call?.mcpToolCall;
        if (call) {
          calls.push(call);
          process.stdout.write(
            `Host call observed: ${call.args.serverIdentifier}/${call.args.toolName}\n`,
          );
        } else if (!event.tool_call?.getMcpToolsToolCall) nonMcpActions++;
      }
    }
  });
  child.once("close", (code) => {
    clearTimeout(timer);
    done(code);
  });
});
function sameArgs(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown>,
) {
  return (
    !!a &&
    Object.entries(b).every(
      ([k, v]) => JSON.stringify(a[k]) === JSON.stringify(v),
    )
  );
}
function find(tool: string, args: Record<string, unknown>) {
  return calls.find(
    (c) =>
      c.args.serverIdentifier === "toolrobin" &&
      c.args.toolName === tool &&
      sameArgs(c.args.args, args),
  );
}
function data(c: Call | undefined): Data | undefined {
  if (!c?.result?.success || c.result.success.isError) return undefined;
  try {
    return JSON.parse(
      c.result.success.content?.find((b) => b.text?.text)?.text?.text ?? "",
    ) as Data;
  } catch {
    return undefined;
  }
}
const results = cases.map((c) => {
  const call = find("toolrobin_" + c.name, c.valid);
  let passed = false;
  try {
    const value = data(call);
    if (value) {
      c.verify(value);
      passed = true;
    }
  } catch {
    /* Never print raw tool data. */
  }
  return {
    tool: "toolrobin_" + c.name,
    actualAssistantCall: !!call,
    independentResultCheck: passed ? "passed" : "failed",
    resultKinds: Object.keys(call?.result ?? {}),
  };
});
const errorChecks = invalid.map((c) => {
  const call = find(c.tool, c.arguments);
  // A permissions denial is not evidence that the tool rejected its input.
  return {
    tool: c.tool,
    actualAssistantCall: !!call,
    rejected: !!call?.result?.success?.isError,
  };
});
const sessionRecovery =
  data(find("toolrobin_json_format", { json: '{"ok":true}' }))?.output ===
  '{\n  "ok": true\n}';
const naturalRequests = {
  percentageMode:
    data(
      find("toolrobin_percentage", {
        mode: "adjust",
        first: "200",
        second: "15",
      }),
    )?.value === "230",
  comparisonOnlyTrimming:
    data(
      find("toolrobin_remove_duplicate_lines", {
        text: " A \na\nB",
        ignoreCase: true,
        trim: true,
      }),
    )?.output === " A \nB",
};
const unexpectedToolCalls = calls.filter(
  (c) => c.args.serverIdentifier !== "toolrobin",
).length;
const passed =
  exitCode === 0 &&
  completed &&
  !failed &&
  results.every((r) => r.independentResultCheck === "passed") &&
  errorChecks.every((r) => r.rejected) &&
  sessionRecovery &&
  Object.values(naturalRequests).every(Boolean) &&
  nonMcpActions === 0 &&
  unexpectedToolCalls === 0;
const report = {
  verifiedAt: new Date().toISOString(),
  clientVersion: version.stdout.trim(),
  actualAIHost: true,
  scope:
    "Authenticated Cursor CLI in disposable workspace; only ToolRobin allowed; shell/files/web denied; synthetic data; raw events/passwords not stored.",
  status: passed ? "passed" : "incomplete",
  exitCode,
  turnCompleted: completed,
  observedToolCalls: calls.length,
  nonMcpActions,
  unexpectedToolCalls,
  stderrBytes,
  results,
  errorChecks,
  sessionRecovery,
  naturalRequests,
};
mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/cursor.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write(
  `Cursor actual assistant verification: ${report.status}; ${results.filter((r) => r.independentResultCheck === "passed").length}/18 tool results checked.\n`,
);
if (!passed) process.exitCode = 1;
