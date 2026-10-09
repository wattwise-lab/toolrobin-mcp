#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { prepareReadRoot } from './files.js';
import { createFileServer } from './server.js';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('ToolRobin PDF pilot: node dist/index.js --read-root /absolute/selected-directory\nRead-only local stdio. One PDF, 20 MiB, 100 pages, 30 seconds. No network or file writes.\n');
} else if (args.length !== 2 || args[0] !== '--read-root') {
  process.stderr.write('Specify exactly --read-root with an absolute directory, or --help.\n');
  process.exitCode = 1;
} else {
  try {
    const root = await prepareReadRoot(args[1]!);
    const server = createFileServer(root);
    const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 1_048_576 });
    let closing = false;
    const close = async () => { if (closing) return; closing = true; try { await server.close(); } finally { process.stdin.destroy(); } };
    server.server.onerror = () => { if (!closing) { process.stderr.write('MCP message rejected; connection closed. Check request framing and restart.\n'); void close(); } };
    process.once('SIGINT', () => void close());
    process.once('SIGTERM', () => void close());
    process.stdin.once('end', () => void close());
    await server.connect(transport);
  } catch { process.stderr.write('PDF pilot could not start. Check the absolute read directory and installation.\n'); process.exitCode = 1; }
}
