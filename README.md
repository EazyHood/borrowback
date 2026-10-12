# BorrowBack

**Clear loans. Planned handoffs. Confirmed returns.**

BorrowBack turns an informal equipment loan into a reviewable agreement. It asks which tripod you mean, makes the date explicit, finds a handoff that fits two sample schedules, and keeps **a return plan** separate from **an item you have actually received**.

A working **simulated Alexa+ experience** for Amazon's Build, Ship, Shape hackathon. The conversation is guided and deterministic; it is not a language model, voice assistant, or live Alexa integration. Two real MCP tools support the conversation over Streamable HTTP, protocol **2025-11-25**.

- Demo: https://borrowback-jdr.jhona999.chatgpt.site/
- MCP endpoint: `/api/mcp` on the same origin
- Source: https://github.com/EazyHood/borrowback
- Author: Jhonatan del rio mejia (EazyHood), built with Codex assistance
- New project started September 9, 2026 (Colombia); not a resubmission of an earlier project

## Try the complete flow

1. Open the demo and reset sample data if needed. It uses the fixed date **Wednesday, September 9, 2026**, America/Bogota.
2. Choose **Try: “I lent the tripod to Alex until Friday”**. Two catalog matches require clarification. Nothing is saved.
3. Select **Tall tripod**. Type **“Make that Saturday”**. The draft now displays September 12.
4. **Review loan → Confirm change**. Reload the page: the confirmed loan survives; temporary drafts do not.
5. Type **“Plan the projector return on Friday”**. There is no shared availability, so no appointment is invented.
6. Choose **Sat 12**, then **4:00 PM–4:30 PM → Confirm change**. The agreement remains **On loan / Received: Not confirmed**.
7. Download **Calendar draft**. It is an RFC5545 `.ics` with `STATUS:TENTATIVE`. Importing it does not contact anyone or mark an item returned.
8. Choose **I received it**. Only the subsequent explicit confirmation marks the projector received. The change appears in agreement history and can be undone.
9. Expand **How this demo works** to inspect the last real MCP result and export device data.

Controls and guided phrases operate the same state. Unknown phrases make no changes. Dates outside September 9–13, 2026 are deliberately out of scope.

## Run locally

Node.js **24** is recommended (used for validation). No API keys, Amazon account, AWS account, database, microphone or paid inference is needed.

```sh
npm run install:ci
npm run dev
# http://localhost:5173
```

```sh
npm test
npm run typecheck
npm run test:mcp  # development server must be running
npm run build
npm start -- --port 8787
```

To test the built Worker, set `BORROWBACK_TEST_URL=http://127.0.0.1:8787/api/mcp` before running `npm run test:mcp`. The server uses the bundled workerd-compatible date `2026-05-22`; do not raise it beyond your installed runtime's supported date without updating the runtime.

On Windows, if a surrounding launcher mishandles npm's shell shim, invoke the installed `npm-cli.js` with Node directly. This is a launcher issue, not a required project modification.

## Architecture and truth boundary

| Part | What actually runs |
|---|---|
| Conversation | Explicit intent parser and forms in React; unsupported text gets an honest fallback |
| `resolve_item` | Real MCP tool returning zero, one or two matches from the three-item sample catalog |
| `find_return_windows` | Real MCP tool intersecting synthetic owner/borrower windows and a reservation limit |
| Agreements | Validated device-local state; preview revision must still match when confirmed |
| Calendar | Actual `.ics` generation, UTC times, escaping and UTF-8 line folding |
| Receipt | User declaration, never automatic inference or physical verification |
| Alexa, real calendars, messaging | Simulated or absent; no Alexa connection, voice, outgoing message or calendar write |

The MCP server is stateless, creates a fresh SDK transport per request, offers two read-only tools, and never receives borrower names or saved loan records. Catalog query strings and demo dates reach it. It requires approved Origin/Host values and bounds requests to 16 KiB. CORS is not authentication: this public demo is for synthetic inputs, not a private operational service. For a different host, change the explicit origin allowlist in `lib/mcp-server.ts` and rebuild.

Before each invocation, the web client performs `initialize`, `notifications/initialized`, and `tools/list`, validates discovery, and checks that the requested tool is advertised. Only then does it send `tools/call`. Missing or malformed discovery stops the flow without saving an agreement.

`localStorage` is not a multi-user database or cross-tab transaction service. Storage events invalidate visible previews; if storage is unavailable, changes are memory-only. No durability guarantee beyond the browser/device is made. Reset clears only this demo's local data.

Optional WebMCP hooks expose the same visible state and actions: `read_demo_agreements`, `stage_demo_conversation`, `confirm_demo_change`. Unsupported browsers still have the full interface. These hooks were checked in a supporting browser with valid and invalid inputs.

## Validation

- 10 business-rule tests: ambiguity, dates, missing fields, occupied gear, stale/duplicate confirmation, unavailable windows, corrections, explicit receipt, calendar encoding and corrupt storage.
- 3 client regression tests: discovery before invocation, missing tools and malformed tool discovery.
- 7 HTTP integration tests: protocol negotiation, 202 notifications, tool list, argument validation, concurrent request isolation, origin/method/body bounds and malformed requests.
- TypeScript and application ESLint checks.
- A recorded browser walkthrough exercises clarification, correction, confirmation, reload, conflicting schedules, return plan, calendar draft and receipt.

See [docs/product-feedback.md](docs/product-feedback.md) for actual implementation feedback and limitations, and [docs/submission.md](docs/submission.md) for the proposed hackathon description. Passing tests is not evidence of user adoption, market demand, or Alexa certification.

## Original contribution and dependencies

The contribution is an inspectable conversational state machine for informal equipment handoffs, plus two small MCP tools and regression tests. Lending apps, calendars and Alexa memory already exist; this project makes no first-ever claim or measured speed advantage.

React/Vinext/Cloudflare Workers provide the runtime, the MCP TypeScript SDK provides transport, Zod validates data, shadcn/Radix provides accessible primitives, and Lucide supplies icons. Existing starter utilities are retained. The gear image was generated with OpenAI image generation for this project; it depicts synthetic objects without third-party logos. No music, personal photo, third-party lending dataset, or proprietary Alexa asset is included.

Original BorrowBack code is MIT licensed. Dependencies and retained third-party components remain under their respective licenses.
