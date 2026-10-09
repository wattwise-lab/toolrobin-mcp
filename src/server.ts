import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tools, executeTool, errorMessage } from "./tools.js";
export const SERVER_VERSION = "0.1.0";
export function createServer() {
  const server = new McpServer(
    { name: "toolrobin-mcp", version: SERVER_VERSION },
    {
      // Every tool takes a flat argument object. Bound malformed container inputs
      // before schema validation; text/JSON strings keep their separate limits.
      maxToolInputElements: 64,
      instructions:
        "ToolRobin Phase 1 provides 18 local-only operations. Inputs and results remain within stdio; this process makes no network requests and does not save them. Website links are optional equivalents, never visited by this server. AI hosts have their own storage and transmission policies.",
    },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: tool.name !== "toolrobin_password_generator",
          openWorldHint: false,
        },
        _meta: { "toolrobin.com/website": tool.website },
      },
      async (args) => {
        try {
          const data = executeTool(tool.name, args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
            structuredContent: data,
          };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: errorMessage(error) }],
          };
        }
      },
    );
  }
  return server;
}
