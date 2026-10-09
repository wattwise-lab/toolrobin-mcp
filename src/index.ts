#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
export const MAX_STDIO_BUFFER_BYTES = 1_048_576;
const arguments_ = process.argv.slice(2);
if (arguments_.includes("--help")) {
  process.stdout.write(
    "ToolRobin MCP: 18 local operations over stdio. Start without arguments. Node >=22.12.0. No listening port.\n",
  );
} else if (arguments_.includes("--version")) {
  process.stdout.write("0.1.0\n");
} else if (arguments_.length) {
  process.stderr.write(
    "Unsupported option. Start without arguments for stdio, or use --help.\n",
  );
  process.exitCode = 1;
} else {
  const server = createServer();
  const transport = new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: MAX_STDIO_BUFFER_BYTES,
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  process.stdin.once("end", () => {
    void close();
  });
  // Deliberately do not log arguments, tool results, passwords, parse errors or stacks.
  server.server.onerror = () => {
    process.stderr.write(
      "MCP message rejected; verify request format and the 1 MiB input-buffer limit.\n",
    );
  };
  try {
    await server.connect(transport);
  } catch {
    process.stderr.write("ToolRobin MCP could not start.\n");
    process.exitCode = 1;
  }
}
