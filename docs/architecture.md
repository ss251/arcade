# Architecture

## The one-sentence version

A buyer agent pays per call in USDC on Arc; the seller's skill executes on the seller's own machine and the platform never receives the code, the prompts, or the credentials.

## Trust order

```
verify payment  →  execute in sandbox  →  validate output  →  settle
```

This ordering is the product's core guarantee in both directions:

- **The buyer never pays for a failure.** Settlement happens only after the output passes. A refusal, timeout, bounds breach, empty result or schema mismatch means the signed authorization is simply never broadcast. There is no refund flow because there is nothing to refund.
- **The seller never works unpaid.** Verification — signature, funds, validity window, replay — happens *before* the job is dispatched.

### Why this rules out Circle's Express middleware

`createGatewayMiddleware` settles the payment inside the HTTP request. Our jobs return `202 {job_id}` immediately and finish anywhere from two seconds to seven minutes later, so settlement must happen from a background fiber long after the response was sent. Express middleware structurally cannot express that. We therefore drive `verify()` / `settle()` directly — which is also what Circle's own documentation prescribes for production.

That decision is why the hub is `Bun.serve` + Effect rather than Express, and it removed the only reason Express was in the design.

## The secrecy boundary

`packages/core/src/manifest.ts` defines two projections of a seller's `arcade.json`:

| PublicListing (published) | SkillManifest (stays local) |
|---|---|
| id, version, serviceName, description, tags, iconUrl | `engine.adapter`, `engine.entry`, `engine.systemPrompt` |
| price, replaces, bounds | `secrets[]` (names only, never values) |
| inputSchema, outputSchema | `egress[]`, `workdir` |

`toPublicListing` **constructs** a `PublicListing` from named public fields. It is not a filter that deletes keys — the public type has nowhere to put a prompt or an entry path, so a future private field cannot leak by omission. Two mechanisms back this up:

1. `packages/core/test/secrecy.property.test.ts` generates arbitrary manifests stuffed with canary values and asserts none reach the wire.
2. The runner is **pull-model**: it opens an outbound websocket and receives jobs. There is no inbound connection and no code path that transmits manifest internals, so the guarantee is architectural rather than procedural.

## Rails

`Rail` is a `Context.Tag` service with three complete `Layer` implementations:

| layer | what |
|---|---|
| `EIP3009Live` | `transferWithAuthorization` on Arc USDC. Proven on-chain. Buyer signs offline (~5ms, zero gas); the facilitator broadcasts and pays ~0.00218 USDC. |
| `GatewayLive` | Circle Gateway Nanopayments. Gas-free both sides, $0.000001 minimum, batched settlement inside a TEE. Arc is Circle's canonical example chain. |
| `RailTest` | In-memory, same semantics, real balance movement. Lets the entire settle pipeline be tested with no chain, faucet or network. |

All three are held to one conformance suite (`packages/payments/test/rail.conformance.test.ts`), so the non-default rail cannot rot, and switching is a wiring change the compiler checks.

## Arc specifics that shape the code

- **USDC is both the native gas token (18 decimals) and an ERC-20 (6 decimals) at the same address** (`0x3600…0000`). Every price, payment and receipt in this codebase is 6-decimal atomic units; `packages/core/src/money.ts` speaks nothing else, and gas math is kept separate.
- **The public RPC rate-limits.** viem's default receipt polling triggers `-32011 request limit reached`. We poll one receipt per tick with exponential backoff and never use `waitForTransactionReceipt`.
- **Gateway requires ≥7 days of authorization validity**, so all rails advertise the same `maxTimeoutSeconds` (604900) and a buyer can sign once for either.
- **Circle's spending policies are mainnet-only**, so buyer-side caps (`--max-amount`) are ours.

## Discovery and the buyer surface

Three documents, all generated from the live listing set so none can advertise a skill nobody is serving:

| endpoint | for | contains |
|---|---|---|
| `/openapi.json` | any OpenAPI client | one concrete `POST /x/<seller>/<skill>` per listing, with input schema, documented `402`, and price in dollars and atomic units |
| `/.well-known/x402` | clients that speak the protocol and not OpenAPI | the same payment envelope the paid endpoints return |
| `/skill.md` | an agent's context | the catalogue as markdown, deliberately short because every line costs the reader |

`accepts[]` in the OpenAPI document is derived from the `PaymentRequirements` schema the rail itself constructs, not hand-written — the first live probe caught a hand-written version documenting `maxAmountRequired`, an x402 v1 field name this rail does not emit.

The buyer side is an **MCP server** (`packages/buyer/src/mcp.ts`, `bunx arcade-mcp`): list → describe → quote → call, over stdio because the process holds a spending key. Its tool arguments are Effect Schemas, with `JSONSchema.make` producing what the agent reads and `Schema.decodeUnknownEither` enforcing what its call is held to, so the advertised contract and the runtime check cannot disagree. Two spending ceilings and the result-fencing rule are covered in [`threat-model.md`](./threat-model.md) T-SPEND-001 and T-EXEC-003.

## The chain

A skill declaring `hire-skills` gets `hire()` from `@arcade/buyer` inside its sandbox, surfaced to the model as a `hire_skill` tool the **runner** supplies — so the fencing of the hired result cannot be forgotten by a seller. Three variables are granted, none reachable through `secrets` because `ARCADE_` is a reserved prefix:

```
ARCADE_HIRE_SOCKET   the runner's broker socket
ARCADE_JOB_ID        which job is asking
ARCADE_JOB_TOKEN     HMAC(secret, jobId) — useless elsewhere, revoked at job end
```

**No key.** The runner holds the sub-purchase wallet and performs the buy; `packages/runner/src/hire-broker.ts` keeps the per-job ledger and enforces `maxSubSpendUsd`. The point is which process is bounded: an earlier version handed the key to the sandbox and checked the budget there, so the code holding the key was the code being limited, and the budget was advisory. Now the limit is enforced by a process the agent cannot reach. Both sides use `node:http` over a Unix socket rather than `Bun.serve`/`fetch({unix})`, so the enforcement path is identical under Bun and Node and is tested under both.

One buyer action can therefore produce several settlements: the buyer pays the parent skill, and the parent pays whoever it hired. Each hop is an independent x402 call with its own verification, its own validation and its own receipt — there is no nested-payment concept, which is what keeps it simple. Sub-spend is folded into the parent's reported `costUsd` so a receipt shows the seller's real margin, while `maxCostUsd` stays an inference bound and `maxSubSpendUsd` a hiring one.

Why it matters structurally: an API never buys another API, so an API marketplace has two populations to recruit. An agent marketplace has one — every seller is a buyer whenever its work needs something it cannot produce.

## Deviations from the plan

- **`Bun.serve` instead of `@effect/platform` HttpApi.** Runners need a real websocket server; Bun provides it natively with fewer moving parts, and all logic remains Effect. OpenAPI is still derived from the same Effect Schemas (`JSONSchema.make` at `/openapi.json`), so the discovery surface cannot drift from the domain model.
- **Server-rendered HTML instead of the React SPA at commit 1.** `apps/web` (TanStack Start) lands Jul 29; until then `apps/hub/src/ui.ts` is the real surface, showing live listings and the receipt feed.
