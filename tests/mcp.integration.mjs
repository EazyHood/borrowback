import { test } from "node:test";
import assert from "node:assert/strict";
const endpoint =
  process.env.BORROWBACK_TEST_URL ?? "http://localhost:5173/api/mcp";
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": "2025-11-25",
};
// Drain response bodies so ignored rejection payloads do not pin an undici pool connection.
async function fetchFully(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });
  const bytes = await r.arrayBuffer();
  return new Response([204, 205, 304].includes(r.status) ? null : bytes, {
    status: r.status,
    headers: r.headers,
  });
}
const post = (body, extra = {}) =>
  fetchFully(endpoint, {
    method: "POST",
    headers: { ...headers, ...extra },
    body: JSON.stringify(body),
  });
const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "borrowback-tests", version: "1.0" },
  },
};
const call = (name, args, id = 2) =>
  post({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
test("initialization negotiates 2025-11-25 without session ID", async () => {
  const r = await post(init);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("mcp-session-id"), null);
  const data = await r.json();
  assert.equal(data.result.protocolVersion, "2025-11-25");
});
test("initialized notification is an empty 202", async () => {
  const r = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(r.status, 202);
  assert.equal(await r.text(), "");
});
test("list exposes two read-only tools", async () => {
  const r = await post({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list",
    params: {},
  });
  const { result } = await r.json();
  assert.deepEqual(result.tools.map((t) => t.name).sort(), [
    "find_return_windows",
    "resolve_item",
  ]);
  assert.ok(
    result.tools.every(
      (t) => t.annotations.readOnlyHint && t.annotations.idempotentHint,
    ),
  );
});
test("real tool returns ambiguity and validates arguments", async () => {
  const r = await call("resolve_item", { query: "tripod" });
  const d = await r.json();
  assert.equal(d.result.structuredContent.matches.length, 2);
  const bad = await (await call("resolve_item", { query: "" })).json();
  assert.ok(bad.result?.isError || bad.error);
});
test("two concurrent clients using the same ID get their own results", async () => {
  const [a, b] = await Promise.all([
    call("find_return_windows", { itemId: "projector", date: "2026-09-11" }, 9),
    call("find_return_windows", { itemId: "projector", date: "2026-09-12" }, 9),
  ]);
  const [da, db] = await Promise.all([a.json(), b.json()]);
  assert.equal(da.id, 9);
  assert.equal(db.id, 9);
  assert.equal(da.result.structuredContent.slots.length, 0);
  assert.equal(db.result.structuredContent.slots.length, 2);
});
test("origin check, preflight, GET and request size are enforced", async () => {
  assert.equal(
    (await post(init, { Origin: "https://unrelated.example" })).status,
    403,
  );
  const origin = new URL(endpoint).origin;
  const pre = await fetchFully(endpoint, {
    method: "OPTIONS",
    headers: { Origin: origin },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), origin);
  assert.equal((await fetchFully(endpoint)).status, 405);
  const large = await post({ text: "x".repeat(17000) });
  assert.equal(large.status, 413);
});
test("invalid JSON and missing SSE accept type are rejected", async () => {
  const invalid = await fetchFully(endpoint, {
    method: "POST",
    headers,
    body: "{",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, -32700);
  const missing = await post(init, { Accept: "application/json" });
  assert.equal(missing.status, 406);
});
