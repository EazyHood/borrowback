import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { z } from "zod";
import {
  dateSchema,
  itemIdSchema,
  resolveItem,
  returnWindows,
} from "./borrowback";

const origins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8787",
  "http://localhost:8787",
  "https://borrowback-jdr.jhona999.chatgpt.site",
]);
export async function handleMcp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forbidden =
    !origins.has(url.origin) ||
    (origin !== null && !origins.has(origin)) ||
    (host !== null && host !== url.host);
  if (forbidden && request.method !== "POST") {
    return new Response("Forbidden origin or host", { status: 403 });
  }
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
  });
  if (origin && !forbidden) headers.set("Access-Control-Allow-Origin", origin);
  const wrap = (r: Response) => {
    const h = new Headers(r.headers);
    headers.forEach((v, k) => h.set(k, v));
    return new Response(r.body, { status: r.status, headers: h });
  };
  if (request.method === "OPTIONS")
    return wrap(new Response(null, { status: 204 }));
  if (request.method !== "POST")
    return wrap(
      new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } }),
    );
  // Consume at most 16 KiB even when Content-Length is missing or inaccurate.
  const reader = request.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        return wrap(new Response("Request too large", { status: 413 }));
      }
      chunks.push(value);
    }
  }
  // Drain bounded POST bodies before rejecting. Cancelling an unread body can
  // disrupt the local preview proxy's pooled connection on the following request.
  if (forbidden) return new Response("Forbidden origin or host", { status: 403 });
  const bytes = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, pos);
    pos += chunk.length;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return wrap(
      Response.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        },
        { status: 400 },
      ),
    );
  }
  const server = new McpServer(
    { name: "borrowback-demo", version: "0.1.0" },
    { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  server.registerTool(
    "resolve_item",
    {
      description:
        "Find exact aliases in the three-item synthetic catalog. Multiple matches require clarification; no loan is saved.",
      inputSchema: { query: z.string().trim().min(1).max(80) },
      annotations,
    },
    async ({ query }) => {
      const data = { matches: resolveItem(query) };
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: data,
      };
    },
  );
  server.registerTool(
    "find_return_windows",
    {
      description:
        "Intersect synthetic schedules for a 30-minute equipment handoff. Returns proposals, not bookings or physical returns.",
      inputSchema: { itemId: itemIdSchema, date: dateSchema },
      annotations,
    },
    async ({ itemId, date }) => {
      const data = returnWindows(itemId, date);
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: data,
      };
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return wrap(await transport.handleRequest(request, { parsedBody: parsed }));
  } finally {
    await server.close();
  }
}
