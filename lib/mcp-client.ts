import { z } from "zod";
import { itemIdSchema, type ItemId, returnWindows } from "./borrowback";
type RpcResult = {
  id?: number;
  error?: { message: string };
  result?: {
    protocolVersion?: string;
    isError?: boolean;
    content?: { type: string; text?: string }[];
    structuredContent?: unknown;
  };
};
async function request(message: object): Promise<RpcResult | undefined> {
  const response = await fetch("/api/mcp", {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 202) return;
  const data: RpcResult = await response.json();
  if (!response.ok || data.error)
    throw new Error(
      data.error?.message ?? `Tool request failed (${response.status}).`,
    );
  if ("id" in message && data.id !== message.id)
    throw new Error("Mismatched tool response.");
  return data;
}
export async function callTool(name: string, args: object) {
  const init = await request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "borrowback-guided-simulation", version: "0.1.0" },
    },
  });
  if (init?.result?.protocolVersion !== "2025-11-25")
    throw new Error("Unexpected MCP version.");
  await request({ jsonrpc: "2.0", method: "notifications/initialized" });
  const result = await request({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });
  if (result?.result?.isError)
    throw new Error("The tool could not prepare this proposal.");
  return result?.result?.structuredContent;
}
export async function resolveViaMcp(query: string) {
  return z
    .object({
      matches: z.array(
        z.object({ id: itemIdSchema, name: z.string(), detail: z.string() }),
      ),
    })
    .parse(await callTool("resolve_item", { query })).matches;
}
export async function windowsViaMcp(itemId: ItemId, date: string) {
  const expected = returnWindows(itemId, date);
  const actual = await callTool("find_return_windows", { itemId, date });
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("Unexpected availability result; nothing has been saved.");
  return expected;
}
