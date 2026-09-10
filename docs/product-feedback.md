# Product feedback — actual implementation experience

## What was used and why

- Amazon Build, Ship, Shape rules, resources and official forum clarification established the permitted **simulated Alexa+** path. No Alexa SDK, Agent Skill, live Alexa account or Amazon cloud API was used. We cannot report runtime experience or onboarding metrics for those products.
- `@modelcontextprotocol/sdk` 1.30.0 provided a real Streamable HTTP server with protocol 2025-11-25. It was selected to make catalog resolution and scheduling inspectable tool calls without paid inference.
- `CfWorkerJsonSchemaValidator` with `@cfworker/json-schema` made schema validation compatible with the Worker runtime, avoiding code-generation assumptions.
- React/Vinext and Cloudflare Workers supplied a browser frontend and standard Request/Response backend. Zod is shared between validation and tools.
- Codex assisted research, design, implementation, tests and documentation. OpenAI image generation created the original gear still life. The app itself does not call an AI model.

## What worked

The Web Standard transport handled browser requests directly. Stateless per-request server construction kept concurrent callers isolated. We validated initialize → initialized → tools/list → tools/call; the notification correctly returns empty HTTP202. Two simultaneous clients using the same JSON-RPC ID received independent schedule results. No credentials or external data were needed for the simulated experience.

Explicit proposal objects made the UI's boundary understandable: a plan never marks an item received; stale revisions cannot apply; missing item/date information cannot silently become an agreement. The browser walkthrough confirmed persistence after reload and the separate receipt step.

## Friction and resolutions

1. **Documentation version selection:** current SDK documentation also exposes a differently packaged v2 API. We checked the published v1.30.0 package and its exact imports rather than mixing APIs. A version selector and prominent package/import pairing would make this easier.
2. **Protocol details:** even with JSON responses enabled, the client must accept both JSON and SSE content types; notifications have no JSON body. These are now explicit in the client and integration tests.
3. **Simulation discoverability:** the overview's emphasis on MCP/Agent Skills initially looked narrower than the rules. The rules and official forum clarified that a web simulation can have real logic without voice or an Alexa connection. A single prominent simulation checklist in the resources would reduce uncertainty. This is onboarding feedback, not a claimed API defect.
4. **Local runtime compatibility:** today's compatibility date exceeded the bundled workerd binary's supported date. The local runtime refused startup. We selected its supported 2026-05-22 date and documented the constraint. This was a local Cloudflare/Vinext toolchain issue, not an Amazon issue.
5. **Windows launcher:** the Sites helper's npm shell invocation resolved npm entrypoints relative to the project. Calling npm's installed JavaScript entrypoint directly worked; a local ignored shim allowed the helper to finish. Again, this is not an Alexa defect.
6. **Rejected request lifecycle:** the built local Worker proxy intermittently returned HTTP503 on a request following an early rejected POST. Cancelling the unread body did not solve it. Consuming the bounded body before rejection resolved the sequence; the integration suite now drains response bodies and uses explicit timeouts. Both the rejection and the immediately following preflight/GET are tested against the built Worker.

## Would we use it again?

Yes, the MCP Web Standard transport is a suitable small boundary for deterministic tools. For real household use, the next work would be authenticated shared records, verified calendar permissions and a live Alexa integration, each tested separately. This demo does not prove those integrations, linguistic generality, or product demand.

## Honest limitations

Three synthetic objects, a fixed five-day date range, guided English phrases and manual confirmation. No human user study, live Alexa trial, adoption data or paid service trial was conducted. No quantitative usability improvement is claimed. The recorded walkthrough and tests document behavior, not market outcomes.

## Sources

- https://amazonappdev2026.devpost.com/rules
- https://amazonappdev2026.devpost.com/forum_topics/45058-clarification-on-simulated-alexa-web-experience-requirements
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://github.com/modelcontextprotocol/typescript-sdk/tree/2d889f2b329e46680ec9bdd565de4616c497825a
