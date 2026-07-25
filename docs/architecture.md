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

## Deviations from the plan

- **`Bun.serve` instead of `@effect/platform` HttpApi.** Runners need a real websocket server; Bun provides it natively with fewer moving parts, and all logic remains Effect. OpenAPI is still derived from the same Effect Schemas (`JSONSchema.make` at `/openapi.json`), so the discovery surface cannot drift from the domain model.
- **Server-rendered HTML instead of the React SPA at commit 1.** `apps/web` (TanStack Start) lands Jul 29; until then `apps/hub/src/ui.ts` is the real surface, showing live listings and the receipt feed.
