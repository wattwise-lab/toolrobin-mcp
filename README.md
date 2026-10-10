# ToolRobin MCP

18 local text and calculation operations for MCP assistants, using the same core logic as [ToolRobin](https://toolrobin.com/). Run as a child process over **stdio**. No account, API key, backend or listening port is required by this server.

This is an independent MIT project. Building and running it does not need access to ToolRobin's private website repository. Phase 1 does not change the website.

An optional [local PDF pilot](https://github.com/wattwise-lab/toolrobin-mcp/tree/main/packages/pdf-pilot) runs as a separate process with an explicitly selected read directory. It returns Markdown with page references and extraction warnings. It grants no file access to the 18 operations below, performs no OCR, and is not published to npm.

## Start from source

Requires Node.js **22.12.0 or newer** and npm. From this repository:

```sh
npm ci --ignore-scripts
npm run build
node dist/index.js
```

The last command waits for MCP messages on stdin. A blank terminal is normal. Connect it from an MCP client, or run `npm run test:stdio` for a reproducible discovery and invocation check. `node dist/index.js --help` and `--version` are CLI diagnostics, not MCP sessions.

## Run with npx

**`@toolrobin/mcp` is not published to npm yet.** Owner approval is required before a registry release. The following name-based command becomes usable only after that release; it is not today's installation path:

```sh
npx --yes @toolrobin/mcp@0.1.0
```

Today, build a local package and run that exact artifact:

```sh
npm pack
npx --yes --package ./toolrobin-mcp-0.1.0.tgz toolrobin-mcp
```

Installing dependencies or an npx package may contact npm. Tool execution itself does not contact npm or any other service. For offline operation after installation, use the absolute Node command below.

## Connect a client

First build the project. Replace both example paths with the absolute paths on your computer. Find Node with `command -v node` on macOS/Linux or `where node` on Windows. Paths with spaces are single JSON strings; do not add shell quotes inside them.

```json
{
  "mcpServers": {
    "toolrobin": {
      "command": "/ABSOLUTE/PATH/TO/node",
      "args": ["/ABSOLUTE/PATH/toolrobin-mcp/dist/index.js"]
    }
  }
}
```

Merge the `toolrobin` entry into existing configuration; preserve your other servers. You can generate locally resolved examples with `npm run test:config`. It writes `evidence/local-clients/` without modifying any client settings.

| Client                      | Configuration location                                                                                                           | What to check                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Claude Desktop              | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json` | Restart the app; check that the local server connects and tools appear.       |
| Claude Code                 | `.mcp.json` at the project root                                                                                                  | Approve the project server when prompted; check `/mcp` and `claude mcp list`. |
| Cursor                      | `.cursor/mcp.json` at the project root, or `~/.cursor/mcp.json` for a user configuration                                         | Check the MCP server status and tool list.                                    |
| Codex CLI / ChatGPT desktop | `~/.codex/config.toml`, shared by the local clients on the same host                                                             | Restart the desktop app; inspect the local MCP server and tools.              |

The JSON templates are saved in `examples/claude-desktop.json`, `examples/claude-code.json` and `examples/cursor.json`. Cursor also specifies `"type": "stdio"` in its server entry. These portable files use a placeholder server path. The verification script substitutes absolute paths and exercises all 18 tools through each launch command. **That tests the commands, not the three applications' UIs.** Actual host evidence, where available, is recorded separately in `evidence/`.

For Codex CLI, add the built server with the official command, using your resolved paths:

```sh
codex mcp add toolrobin -- /ABSOLUTE/PATH/TO/node /ABSOLUTE/PATH/toolrobin-mcp/dist/index.js
codex mcp get toolrobin
```

The equivalent TOML entry is in `examples/codex.toml`. Back up existing settings before merging configuration and preserve other entries. ChatGPT desktop supports this local stdio configuration; browser-based ChatGPT needs a remote connector and is **outside this stdio-only phase**. A configured server or a successful tool listing does not prove an assistant used it.

Official setup references: [Claude Desktop local MCP](https://modelcontextprotocol.io/docs/develop/connect-local-servers), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://cursor.com/docs/mcp), [OpenAI local MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Tools

Names count individual operations, not 18 different website products. For example, Base64 encoding and decoding are separate tools. Optional website links in tool metadata point to the equivalent browser tool; they never contain your input and this server never opens them.

| Tool name                          | Required input → output                                                      | Browser equivalent                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `toolrobin_word_counter`           | `text` → graphemes, Han characters, Latin/number words, paragraphs           | [Text stats](https://toolrobin.com/tools/text-stats/)                   |
| `toolrobin_text_cleanup`           | `text` → normalized text; options for trimming, spaces and line breaks       | [Text cleanup](https://toolrobin.com/tools/text-cleanup/)               |
| `toolrobin_text_compare`           | `before`, `after` → added, removed and unchanged lines                       | [Text compare](https://toolrobin.com/tools/text-compare/)               |
| `toolrobin_remove_duplicate_lines` | `text` → retained lines and before/after counts                              | [Duplicate lines](https://toolrobin.com/tools/remove-duplicate-lines/)  |
| `toolrobin_base64_encode`          | `text` → UTF-8 Base64                                                        | [Base64](https://toolrobin.com/tools/base64-codec/)                     |
| `toolrobin_base64_decode`          | `text` → strictly valid UTF-8 text                                           | [Base64](https://toolrobin.com/tools/base64-codec/)                     |
| `toolrobin_url_encode`             | `text` → percent-encoded URL component                                       | [URL codec](https://toolrobin.com/tools/url-codec/)                     |
| `toolrobin_url_decode`             | `text` → decoded URL component                                               | [URL codec](https://toolrobin.com/tools/url-codec/)                     |
| `toolrobin_json_format`            | `json` → indented JSON with numeric tokens preserved                         | [JSON formatter](https://toolrobin.com/tools/json-format/)              |
| `toolrobin_json_minify`            | `json` → compact JSON with numeric tokens preserved                          | [JSON formatter](https://toolrobin.com/tools/json-format/)              |
| `toolrobin_timestamp_to_date`      | `value`, `unit` → UTC ISO date, seconds and milliseconds                     | [Timestamp converter](https://toolrobin.com/tools/timestamp-converter/) |
| `toolrobin_date_to_timestamp`      | ISO `value` with timezone → UTC ISO date, seconds and milliseconds           | [Timestamp converter](https://toolrobin.com/tools/timestamp-converter/) |
| `toolrobin_date_difference`        | `start`, `end` → signed calendar days; optional inclusive counting           | [Date calculator](https://toolrobin.com/tools/date-calculator/)         |
| `toolrobin_date_add_days`          | `start`, integer `days` → calendar date                                      | [Date calculator](https://toolrobin.com/tools/date-calculator/)         |
| `toolrobin_percentage`             | `mode`, decimal strings `first`, `second` → result, formula, rounding flag   | [Percentage](https://toolrobin.com/tools/percentage/)                   |
| `toolrobin_password_generator`     | Optional length, character groups and count → passwords and entropy estimate | [Password generator](https://toolrobin.com/tools/password-generator/)   |
| `toolrobin_qr_code`                | `text` → QR SVG text, dimensions and error-correction level                  | [QR generator](https://toolrobin.com/tools/qr-code/)                    |
| `toolrobin_meta_preview`           | `title`, `description`, `pageUrl` → escaped HTML tags and domain             | [Meta preview](https://toolrobin.com/tools/meta-preview/)               |

All arguments have schemas and reject unknown keys. Unknown-parameter errors list the allowed names without echoing the supplied names. Defaults are advertised in `tools/list`. Successful responses contain the same result as JSON text and `structuredContent`; invalid tool arguments return `isError: true` with a readable message.

## Example calls

Send these through your MCP client after initialization, rather than pasting them into an ordinary shell. Runnable fixtures for every tool are in `examples/calls.json`.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "toolrobin_json_format",
    "arguments": { "json": "{\"n\":9007199254740993}" }
  }
}
```

The output is `{"n": 9007199254740993}` with indentation and line breaks. The integer remains exactly `9007199254740993`; it is not parsed into a lossy JavaScript number.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "toolrobin_percentage",
    "arguments": { "mode": "discount", "first": "200", "second": "20" }
  }
}
```

Result: `value: "160"`, `approximate: false`, formula `200 × (1 − 20 ÷ 100)`. Modes are `percent` (percentage of a number), `share` (part/total), `change` (old/new), `adjust` (amount/change %) and `discount` (price/% off).

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "toolrobin_date_add_days",
    "arguments": { "start": "2024-02-28", "days": 1 }
  }
}
```

Result: `date: "2024-02-29"`. Calendar arithmetic ignores local timezone and daylight-saving changes.

A human-facing request can be: “Use ToolRobin to remove duplicate lines from this text, preserving case and spaces.” The assistant must choose `toolrobin_remove_duplicate_lines` with `ignoreCase: false` and `trim: false`.

## Limits and choices

- Text and JSON: at most **100,000 UTF-16 code units per field**. Emojis can use more than one unit. Blank input is rejected where it has no useful result; Base64 permits empty text.
- Comparison: at most **1,500 lines per draft**, literal line comparison rather than semantic similarity. Word counting reports Latin/number tokens and separate Han characters; it is not a universal language segmentation algorithm.
- JSON: at most **100 nesting levels**. Numeric spelling, duplicate keys and key order are preserved; this is formatting, not schema validation or repair. Results over **1 MiB of serialized data** are rejected rather than truncated.
- Stdio: **1 MiB incoming-buffer cap**. Tool arguments are flat objects; malformed container inputs are also limited to **64 object members/array elements combined**, before tool validation. This does not count characters inside text or JSON strings. Protocol framing failures close the transport. Ordinary invalid tool inputs return errors and leave the session usable. UTF-8 byte limits and UTF-16 field limits are different.
- Base64: textual UTF-8 only; standard and URL-safe decoding accepted, malformed padding/UTF-8 rejected. Leading BOM characters are preserved during text round trips. URL codec encodes a component, not a whole URL; decoding does not treat `+` as a space.
- Calendar dates: real `YYYY-MM-DD` dates, years **0001–9999**. Day offsets are integers from **−3,652,058 to 3,652,058**; the resulting date must stay in range. Date-time conversion requires seconds and an explicit `Z` or numeric timezone; Unix input requires an explicit seconds/milliseconds unit and whole-number value.
- Percentages: decimal strings with at most **15 integer digits and 6 fractional digits**, no units or exponents. BigInt arithmetic avoids floating-point input rounding. Results round to at most six decimal places and flag approximation. Zero or invalid denominators are rejected.
- Passwords: **8–64** characters, one or ten at a time, using `crypto.getRandomValues` with rejection sampling. Selected groups each appear. `excludeAmbiguous` excludes `0 O 1 l I`. The entropy meter is an estimate; prefer unique passwords and a password manager. An AI host may retain passwords in the conversation.
- QR: at most **1,200 UTF-8 bytes**, scale **4/8/12** (default 8), error correction **M/H** (default M), four-module quiet zone. Output is SVG text, not a saved file or PNG. The server never follows encoded links.
- Metadata: title **120**, description **320**, URL **2,048** characters. Only absolute HTTP(S) URLs without credentials are accepted. Tags are escaped. This does not fetch a page, confirm an image exists, or predict a platform's final preview.

If a host truncates a large response, shorten the input or use JSON minification. If the server fails to connect, check the Node version and absolute paths, run `npm run build`, and inspect the client's server logs. Do not put debug output on stdout; stdout is reserved for MCP messages.

## Privacy boundary

This server makes **no outbound network requests**, stores no arguments or results, and has no telemetry, upload service, shell-execution tool or file-reading tool. Inputs and results travel only over its parent client's stdio pipes. URLs in inputs are treated as data. Server errors do not log input contents or passwords.

**The AI client has its own policies.** It may send conversation text and tool results to its model provider or retain them in history. A local MCP server cannot promise that Claude, ChatGPT, Cursor or another host is offline. Use the browser password tool when you do not want a generated password included in an AI conversation.

DNS, IP, WHOIS and TLS certificate queries are **excluded** from Phase 1 because obtaining live results requires sending a domain or IP to a network service. They need a separate, explicit privacy design. There are no image/PDF/audio/video file tools or remote transports in this version.

Stdio removes the need for a network listener; it is not an operating-system sandbox. Review code and dependencies before running any package. The network-denial test is verification of current operations, not a sandbox shipped to users.

## Develop and verify

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm test
npm run test:stdio
npm run test:stdio -- --deny-network
npm run test:config
npm run test:package
```

`npm test` builds first, runs each tool's normal, invalid and unknown-field cases, then checks edge cases, source provenance, independent QR decoding and actual stdio operation with outbound APIs disabled. The package check builds a tarball, installs it in a clean temporary project and starts it through npx. Evidence records names, counts and assertions; it does not save generated passwords or arbitrary user inputs.

An optional **real assistant** check is available for an installed, authenticated Codex CLI:

```sh
npm run test:codex
```

This consumes the client's normal model quota. It uses synthetic data in a temporary workspace, observes actual MCP calls, independently checks all 18 results, and checks invalid inputs, session recovery and two natural-language parameter choices. It stores only checks and counts in `evidence/codex.json`, never raw events or generated passwords. This is separate from the SDK protocol tests.

For an installed, authenticated **official Cursor CLI**:

First configure this project's built server in `~/.cursor/mcp.json` and approve `toolrobin` with the official Cursor CLI. The runner verifies that the client entry points to this project's current build.

```sh
npm run test:cursor -- /ABSOLUTE/PATH/TO/cursor-agent
```

The runner creates a disposable workspace with only `Mcp(toolrobin:*)` allowed, and shell, file and web tools denied. It does not change global permissions or use `--force`. Cursor's MCP server approval and its individual tool permissions are separate; listing the tools alone can succeed while execution is denied. See the [official Cursor permissions reference](https://cursor.com/docs/cli/reference/permissions). This check also consumes model quota and stores only assertions in `evidence/cursor.json`. Use the Cursor executable's full path if another program also calls its CLI `agent`.

See `evidence/verification.json` for dated results and the distinction between protocol, package, launch-command and actual application verification. No GitHub Actions run is needed. There is no automatic npm publication.

Current host acceptance: on October 10, signed-in official Claude Desktop invoked all 18 tools with synthetic inputs. Each real Request/Response card was expanded and checked; invalid JSON produced an actionable error, and a subsequent valid call recovered. See [the scoped Desktop receipt](evidence/claude-desktop.json). An unattended approval timeout and earlier interrupted batches are excluded from successful acceptance. On October 9, Codex CLI and Cursor CLI each made 24 observed calls, covering all 18 tools, three invalid inputs, recovery and two natural-language requests. Claude Code connected in a health check, but actual assistant use was blocked by the available account's required subscription; ChatGPT Desktop native GUI calls remain unverified. These client checks are separate. Local Phase 1 is accepted; the npm registry package remains unpublished.

## Source and license

Pure functions were copied from the ToolRobin website at the revision recorded in `PROVENANCE.json`, with browser UI code excluded. Import paths were adapted for Node ESM. Input/output guards are in the MCP adapter. The QR matrix engine is the same pinned `qrcode` version used by the browser tool. No private files, credentials or deployment configuration are required.

ToolRobin code is [MIT licensed](LICENSE). Third-party dependencies retain their licenses, collected in `THIRD_PARTY_NOTICES.txt`. The project uses the maintained v1 [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x) API requested for this phase, pinned in `package-lock.json`.
