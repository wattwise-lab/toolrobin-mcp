import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const command = process.argv[2];
if (!command)
  throw Error(
    "Pass the absolute path of an installed official Claude Code executable.",
  );
const profile = mkdtempSync(join(tmpdir(), "toolrobin-claude-host-"));
const workspace = join(profile, "workspace");
mkdirSync(workspace);
const env = {
  ...process.env,
  CLAUDE_CONFIG_DIR: join(profile, "config"),
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_TELEMETRY: "1",
  DISABLE_ERROR_REPORTING: "1",
};
function run(args: string[]) {
  const r = spawnSync(command!, args, {
    cwd: workspace,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (r.error) throw r.error;
  return r;
}
const version = run(["--version"]);
assert.equal(version.status, 0);
const entry = JSON.parse(
  readFileSync("evidence/local-clients/claude-code.json", "utf8"),
).mcpServers.toolrobin;
const add = run([
  "mcp",
  "add-json",
  "--scope",
  "local",
  "toolrobin",
  JSON.stringify(entry),
]);
assert.equal(add.status, 0);
const list = run(["mcp", "list"]);
assert.equal(list.status, 0);
assert.match(list.stdout, /toolrobin:.*Connected/);
const auth = run(["auth", "status"]);
assert.ok(auth.status === 0 || auth.status === 1);
const status = JSON.parse(auth.stdout) as { loggedIn: boolean };
mkdirSync("evidence", { recursive: true });
writeFileSync(
  "evidence/claude-code-health.txt",
  list.stdout.replaceAll(resolve("."), "<project>"),
);
writeFileSync(
  "evidence/claude-code.json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      clientVersion: version.stdout.trim(),
      healthCheck: "passed",
      authenticated: status.loggedIn,
      actualAssistantToolCalls: "not verified by health check",
      scope:
        "Temporary isolated Claude Code profile; existing user configuration untouched.",
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Claude Code: Connected; authenticated in isolated test profile: ${status.loggedIn}. Actual assistant invocations need a logged-in session.\n`,
);
