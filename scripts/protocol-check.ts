import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { cases } from "../tests/cases.js";
import type { Data } from "../src/tools.js";

// Evidence contains names and checks only, never tool arguments or returned passwords.
export async function verifyProtocol(parameters: StdioServerParameters) {
  const transport = new StdioClientTransport({ ...parameters, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client({
    name: "toolrobin-verification",
    version: "0.1.0",
  });
  try {
    await client.connect(transport, { timeout: 15_000 });
    const listing = await client.listTools();
    assert.equal(listing.tools.length, 18);
    assert.deepEqual(
      listing.tools.map((t) => t.name).sort(),
      cases.map((c) => "toolrobin_" + c.name).sort(),
    );
    for (const tool of listing.tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.equal(tool.annotations?.openWorldHint, false);
      assert.ok(tool._meta?.["toolrobin.com/website"]);
    }
    const results = [];
    for (const c of cases) {
      const name = "toolrobin_" + c.name;
      const valid = await client.callTool(
        { name, arguments: c.valid },
        undefined,
        { timeout: 10_000 },
      );
      assert.notEqual(valid.isError, true, name);
      assert.ok(valid.structuredContent, name);
      c.verify(valid.structuredContent as Data);
      const blocks = valid.content as Array<{ type: string; text?: string }>;
      assert.deepEqual(
        JSON.parse(blocks[0]!.text!),
        valid.structuredContent,
        name,
      );
      const invalid = await client.callTool({ name, arguments: c.invalid });
      assert.equal(invalid.isError, true, name);
      const unknown = await client.callTool({
        name,
        arguments: { ...c.valid, unexpected: "synthetic" },
      });
      assert.equal(unknown.isError, true, name);
      results.push({
        tool: name,
        normal: "passed",
        invalid: "rejected",
        unknownArgument: "rejected",
      });
    }
    const unknownTool = await client.callTool({
      name: "toolrobin_does_not_exist",
      arguments: {},
    });
    assert.equal(unknownTool.isError, true);
    const oversize = await client.callTool({
      name: "toolrobin_word_counter",
      arguments: { text: "a".repeat(100001) },
    });
    assert.equal(oversize.isError, true);
    const malformed = await client.callTool({
      name: "toolrobin_json_format",
      arguments: { json: "DO_NOT_ECHO_SYNTHETIC_SECRET" },
    });
    assert.equal(malformed.isError, true);
    assert.doesNotMatch(
      JSON.stringify(malformed),
      /DO_NOT_ECHO_SYNTHETIC_SECRET/,
    );
    await client.ping();
    assert.equal(stderr, "", "Server must not log requests or results.");
    return {
      server: client.getServerVersion(),
      toolCount: listing.tools.length,
      toolCalls: 57,
      ping: "passed",
      serverStderr: "empty",
      results,
    };
  } finally {
    await client.close();
  }
}
