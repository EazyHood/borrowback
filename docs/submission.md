# Proposed submission copy — not a submission receipt

## Name
BorrowBack

## Tagline
Turn an informal equipment loan into a clear return plan, and keep planned handoffs separate from confirmed returns.

## Inspiration
An equipment loan can be described casually: “I lent the tripod to Alex until Friday.” The useful work is in what that sentence leaves open: which tripod, which date, when both people can meet, and whether the object has actually come back. BorrowBack explores a focused conversational flow for those decisions. This is a design hypothesis, not a claim based on a user study.

## What it does
BorrowBack clarifies ambiguous objects, previews agreements, supports date corrections, intersects sample schedules, exports a tentative calendar file, and records receipt only after explicit confirmation. Confirmed data stays on the device after reload. Users can inspect history and undo the latest change.

## How it was built
React and Vinext run the interface on Cloudflare Workers. Two actual MCP tools use Streamable HTTP and protocol2025-11-25: resolve_item and find_return_windows. Zod validates inputs and state transitions. A guided deterministic parser orchestrates the simulated conversation; no live Alexa, voice, language model or calendar service is connected. Codex assisted implementation, research and validation. The original product illustration was generated for this project.

## Challenges and accomplishments
The main challenge was preserving uncertainty and separating intentions from completed actions. A missing detail does not create a loan; a conflicting schedule does not invent a time; a calendar export does not mark receipt. Tests cover those boundaries, invalid inputs and concurrent MCP requests. The browser walkthrough shows the same behavior, including persistence after reload.

## What we learned
A compact state machine and explicit proposals can make a simulated assistant's behavior inspectable. Correct MCP negotiation, empty notification responses and a Worker-compatible validator mattered more than adding another conversational surface. A simulation is useful evidence of the workflow, but it cannot substitute for testing the eventual Alexa/calendar integration with real users.

## Next steps
Validate the workflow with actual equipment-sharing groups. Only after that, add authenticated shared records and a properly permissioned Alexa/calendar integration. No external messaging or data collection is included in this prototype.

## Open Source mini contribution
New MIT-licensed BorrowBack repository created during the hackathon window. Contribution: a proposal/confirmation state machine, read-only MCP tools, device-local interface, tentative ICS export and 20 regression/integration tests. GitHub contributor: EazyHood. Repository and contribution URL: https://github.com/EazyHood/borrowback . No external maintainer acceptance or merged PR is claimed.
