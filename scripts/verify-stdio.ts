import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { verifyProtocol } from "./protocol-check.js";
const networkDenied = process.argv.includes("--deny-network");
const report = await verifyProtocol({
  command: process.execPath,
  args: [
    ...(networkDenied ? ["--import", resolve("tests/deny-network.mjs")] : []),
    resolve("dist/index.js"),
  ],
});
mkdirSync("evidence", { recursive: true });
const name = networkDenied ? "stdio-network-denied" : "stdio";
writeFileSync(
  `evidence/${name}.json`,
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      transport: "stdio",
      networkDenied,
      ...report,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `${name}: ${report.toolCount} tools discovered; ${report.toolCalls} calls checked; ping passed; server stderr empty.\n`,
);
