import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { resolveViaMcp } from "../lib/mcp-client.ts";

type Message = { id?: number; method: string; params?: unknown };
function server(tools: unknown) {
  const messages: Message[] = [];
  mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    const message = JSON.parse(String(options.body)) as Message;
    messages.push(message);
    if (message.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    const result = message.method === "initialize"
      ? { protocolVersion: "2025-11-25" }
      : message.method === "tools/list"
        ? { tools }
        : { structuredContent: { matches: [{ id: "tall-tripod", name: "Tall tripod", detail: "Graphite" }] } };
    return Response.json({ jsonrpc: "2.0", id: message.id, result });
  });
  return messages;
}

test("frontend discovers advertised tools before calling and validates the result", async () => {
  const messages = server([{ name: "resolve_item" }]);
  try {
    assert.equal((await resolveViaMcp("tripod"))[0].id, "tall-tripod");
    assert.deepEqual(messages.map((m) => m.method), ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    assert.deepEqual(messages.at(-1)?.params, { name: "resolve_item", arguments: { query: "tripod" } });
    assert.deepEqual(messages.filter((m) => m.id).map((m) => m.id), [1, 2, 3]);
  } finally { mock.restoreAll(); }
});

test("frontend stops before invocation when requested tool is absent", async () => {
  const messages = server([{ name: "find_return_windows" }]);
  try {
    await assert.rejects(resolveViaMcp("tripod"), /not available/);
    assert.equal(messages.some((m) => m.method === "tools/call"), false);
  } finally { mock.restoreAll(); }
});

test("frontend rejects malformed discovery without invoking a tool", async () => {
  const messages = server([{ name: 42 }]);
  try {
    await assert.rejects(resolveViaMcp("tripod"));
    assert.equal(messages.some((m) => m.method === "tools/call"), false);
  } finally { mock.restoreAll(); }
});
