# Hedera x402 / Blocky402 research — for ARCADE (ETHOnline 2026)

Every claim below carries a URL. Verified 2026-09-04.

---

## 1. Blocky402 facilitator

**What it is.** "an open facilitator for the x402 protocol — pay-per-request APIs with stablecoins, cross-chain, zero intermediaries" — <https://blocky402.com/>. Self-described "Protocol-Native / Trust-Minimized / Open Source (MIT) / Multi-Chain". The Hedera blog calls it "an open source facilitator for the x402 protocol" and the primary Hedera facilitator — <https://hedera.com/blog/hedera-and-the-x402-payment-standard/>.

**Base URLs** (<https://blocky402.com/docs/api-reference/>):
- Testnet: `https://api.testnet.blocky402.com` (local dev `http://localhost:3002`)
- Mainnet: `https://api.blocky402.com/v1` — docs say "coming soon", but the Hedera PoC already points mainnet routes at `https://api.blocky402.com` (see §2).

**Endpoints** (all from <https://blocky402.com/docs/api-reference/>):

| Method | Path | Body / response |
|---|---|---|
| GET | `/supported` | `{ "kinds": [...], "extensions": [], "signers": {...} }` |
| POST | `/verify` | req `{ "x402Version": 2, "paymentPayload": {...}, "paymentRequirements": {...} }`; res `{ "isValid": true, "payer": "0.0.7326075" }` or `{ "isValid": false, "invalidReason": "InvalidSignature", "invalidMessage": "..." }` |
| POST | `/settle` | same req shape; res `{ "success": true, "transaction": "0.0.x@169...", "network": "hedera:testnet", "payer": "0.0.7326075" }` or `{ "success": false, "errorReason": "transaction_failed", "errorMessage": "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT", ... }` |
| GET | `/health` | `{ "status": "ok", "timestamp": ..., "version": "1.0.0" }` |

This is exactly the x402 v2 facilitator interface (spec §7, `POST /verify`, `POST /settle`) — <https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md>.

**x402 version: 2.** Every network row in <https://blocky402.com/docs/networks/> lists "x402 Version: 2"; the `/verify` body carries `"x402Version": 2`.

**Networks** (<https://blocky402.com/docs/networks/>):
- Hosted **testnet**: Polygon Amoy `eip155:80002` (USDC, USDT), Solana Devnet `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (USDC, USDT), **Hedera Testnet `hedera:testnet`** (HBAR native asset id `0.0.0`, plus HTS tokens).
- Hosted **mainnet**: **Hedera Mainnet `hedera:mainnet`** (HBAR + HTS).
- Self-host only: Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Avalanche Fuji, Ethereum Sepolia, and the corresponding mainnets — "implemented in the codebase" but need self-hosting config.
- **Arc (`eip155:5042002`) is not listed** on Blocky402 and does not appear anywhere in the x402 monorepo (`gh api "search/code?q=5042002+repo:x402-foundation/x402"` → `total_count: 0`).

**Schemes.** `exact` only, per network row. On Hedera the `exact` scheme is *not* EIP-3009 — it is a partially-signed Hedera `TransferTransaction` (full spec: <https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_hedera.md>):
- `PaymentRequirements.extra.feePayer` = the facilitator's Hedera account (`0.0.xxxx`); the client sets `transactionId.accountId` to it.
- Client builds `TransferTransaction`, signs (partially), base64-serializes it; payload is `{ "transaction": "AAAA...=" }`.
- Facilitator verifies (transfer-only, net sums zero, feePayer never a negative entry, exact amount to `payTo`, payer signature valid against the on-chain account key), then adds the feePayer signature and submits. So **the facilitator pays gas**, which is the analogue of ARCADE's gasless EIP-3009 flow.
- `asset` is `"0.0.0"` for HBAR (amount in **tinybars**, 1 HBAR = 10⁸) or an HTS fungible token id (amount in the token's smallest unit).
- `SettlementResponse`: `{ success, transactionId: "0.0.1235@1700000000.000000000", network, payer }`.

**Registration / cost.** No seller registration and no API key: "Blocky402 currently supports **testnet** with open access (no API key required)" — <https://blocky402.com/docs/quickstart/>. The homepage repeats "Testnet MVP Ready — Open Access, No API Key Required" (<https://blocky402.com/>). No pricing is published; testnet costs are just Hedera network fees paid by the facilitator's feePayer account.

**SDKs.** `@x402/hedera` (plus `@x402/evm` for `eip155:*`, `@x402/svm` for Solana), `@x402/core`, `@x402/fetch` — <https://blocky402.com/docs/quickstart/>, <https://blocky402.com/docs/examples/>. `npm view @x402/core version` → **2.24.0** (latest as of 2026-09-04). Docs point at repo <https://github.com/blockydevs/blocky402> — **note: `gh api repos/blockydevs/blocky402` returns 404**, i.e. the facilitator source is not publicly readable right now despite the MIT claim.

**Hedera USDC.** Yes, on testnet. Circle's contract-address page lists Hedera USDC **testnet `0.0.429274`**, **mainnet `0.0.456858`** — <https://developers.circle.com/stablecoins/usdc-contract-addresses>. Same ids are used in the Hedera PoC. Faucet: <https://faucet.circle.com> (Hedera Testnet). **HTS gotcha: both payer and receiver accounts must first associate the USDC token** (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` is a documented `/settle` error) — the PoC ships `scripts/associate-token.ts` for exactly this.

---

## 2. `hedera-dev/x402-inference-pay-per-request-poc`

Repo: <https://github.com/hedera-dev/x402-inference-pay-per-request-poc>. Last commit **`a56ad605`, 2026-07-15** ("Merge pull request #2 … adds issue and pr templates") — only 2 PRs, upstream of it is `narbs91/x402-inference-agent-kit-poc`.

Structure (`gh api repos/.../git/trees/main?recursive=1`):
```
packages/service/src/server.ts   4 payment-gated routes (testnet+mainnet × USDC+HBAR)
packages/service/src/x402.ts     resource-server factory, one per facilitator
packages/agent/src/server.ts     Express /api/chat, SSE payment status
packages/agent/src/x402-client.ts dual signers (testnet+mainnet) registered at startup
packages/agent/src/model.ts      per-network HederaAIToolkit → routes to service URL
scripts/associate-token.ts       USDC HTS association
```

**Seller side** is 17 lines (`packages/service/src/x402.ts`, verbatim):
```ts
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
...
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
return new x402ResourceServer(facilitatorClient).register('hedera:*', new ExactHederaScheme({}));
```
Default facilitator URLs: testnet `https://x402.org/facilitator`, mainnet `https://api.blocky402.com`. So **`x402.org/facilitator` also serves `hedera:testnet`** — a second free testnet option beside Blocky402.

**Buyer side**: `@x402/fetch` + `@x402/hedera` client with signers registered per network; on 402 it builds a `TransferTransaction`, signs with the agent's ECDSA key, retries with a base64 tx in the **`PAYMENT-SIGNATURE`** header. Price per chat message: $0.001.

Libraries (README table): `@x402/fetch`/`@x402/hedera`/`@x402/core` `^2.18.0` (client), `@x402/express`/`@x402/hedera`/`@x402/core` `^2.18.0` (server), `@hashgraph/hedera-agent-kit` `^4.0.0`, `@hashgraph/hedera-agent-kit-ai-sdk` `^1.0.0`, `@hiero-ledger/sdk` `^2.85.0`, `ai` `^6.0.86`, express, LM Studio for local inference.

---

## 3. `x402-foundation/x402`

<https://github.com/x402-foundation/x402> — "A payments protocol for the internet. Built on HTTP.", 6572 stars.

- **Current spec version is 2**: `specs/x402-specification-v2.md` states "**Protocol Version**: 2" and "`x402Version` … must be 2". v1 is retained (`specs/x402-specification-v1.md`, `specs/transports-v1/`).
- **Networks are declared as CAIP-2 strings** (`docs/core-concepts/network-and-token-support.mdx`): "`eip155:<chainId>` — any EVM chain is supported"; "**Hedera**: `hedera:<network>` (`mainnet` or `testnet`)". So Hedera has its own CAIP-2 namespace, not `eip155`.
- Transfer method per ecosystem (same doc): EVM → **EIP-3009 or Permit2**; **Hedera → "Hedera Transfer Transaction"** with "HBAR or any HTS fungible token". "Facilitators support **networks**, not specific tokens."
- **Arc is not a registered/default network.** Arc (`eip155:5042002`) appears nowhere in the repo (code search count 0) and is absent from the "Default Assets for Dollar-String Pricing" EVM table (which lists Base, Ethereum, Polygon, Arbitrum, Monad, Sei, Celo, XDC, …). ARCADE's Arc flow is protocol-legal ("x402 can support any `eip155:<chainId>` network at the protocol level") but has no registered default asset and no third-party facilitator — ARCADE self-facilitates, which the doc explicitly names as a valid "production settlement path".
- **Facilitator interface** (spec §7): HTTP REST, `POST /verify` (read-only, "MUST NOT commit payment state or write onchain state") and `POST /settle`, both taking `{ x402Version, paymentPayload, paymentRequirements }`. `GET /supported` returns `kinds`. This is precisely ARCADE's `Rail.verify` / `Rail.settle` split.
- Scheme catalog: `exact` (per-chain files incl. `scheme_exact_hedera.md`, `scheme_exact_evm.md`), `upto`, `batch-settlement`; transports v2 for `http`, `mcp`, **`a2a`** (`specs/transports-v2/a2a.md` — relevant to the "multi-agent negotiation via A2A" bonus).

---

## 4. Hedera Agent Kit JS

<https://github.com/hashgraph/hedera-agent-kit-js> (67 stars, pushed 2026-09-03). Monorepo of `@hashgraph/hedera-agent-kit` core + adapters: `-langchain`, `-ai-sdk`, `-elizaos`, `-mcp`, `-adk`, plus `create-hedera-agent` scaffold (README package table).

It is an **agent-tooling** kit — "send tokens, manage accounts, store data on Hedera Consensus Service" — not a payments/x402 kit. Code search for `x402` in the repo returns **1 hit, in `docs/MCP.md` only**; there is no x402 client or facilitator code. The PoC uses it as LLM middleware (`HederaAIToolkit` + `wrapLanguageModel`), with x402 handled entirely by `@x402/*`.

Directly useful bonus-point features: **Hooks and Policies** (`docs/HOOKS_AND_POLICIES.md`) — ships an `HCSAuditTrailHook` that "logs actions to an HCS topic, creating an easy to track audit trail", a `MaxRecipientsPolicy`, and a `RejectToolPolicy`; runnable `examples/ai-sdk/audit-trail-agent.ts` and `examples/ai-sdk/policy-enforcement-agent.ts`, `examples/langchain-v1/audit-trail-agent.ts`.

---

## 5. Agent identity + HCS audit trail

**HCS-14 (Universal Agent ID)** — spec <https://hol.org/docs/standards/hcs-14/>; draft discussion <https://github.com/hashgraph-online/hcs-improvement-proposals/discussions/135>; standards index <https://hol.org/docs/standards/>. Two DID methods: `uaid:aid` (deterministic, system-generated) and `uaid:did` (wraps an existing DID). An AID is a SHA-384 hash, base58-encoded, over a canonical JSON of six required fields — `registry`, `name`, `version`, `protocol` (a2a / hcs-10 / mcp / …), `nativeId`, `skills` (numeric enums) — rendered `uaid:aid:<base58>;<params>`. **No on-chain transaction and no central authority required**: "any party shall be able to derive the identifier from canonical public inputs without permission." Complementary: HCS-10 (agent communication), HCS-11 (profiles). Background posts: <https://hol.org/blog/hcs-14-universal-agent-ids>, <https://hol.org/blog/hcs-14-profiles-and-agent-aid-resolution>.

**ERC-8004** — EIP text <https://eips.ethereum.org/EIPS/eip-8004>; contracts <https://github.com/erc-8004/erc-8004-contracts>; awesome list <https://github.com/sudeepb02/awesome-erc8004>. Hashgraph Online runs a "Registry Broker" tutorial that combines ERC-8004 identity with HCS-14 UAIDs — <https://hol.org/blog/launch-erc-8004-agent-hol-registry/>. Caveat: that tutorial's own network table lists **Base Sepolia and Ethereum Sepolia active, Base mainnet "coming soon"**, and publishes **no contract addresses**; it requires a funded Hedera testnet account + the Standards SDK + an A2A endpoint, and its own registration calls can return 402 requiring broker credits. Treat "ERC-8004 live on Hedera testnet" as unverified — I could not find an address. HCS-14 is the safer, cheaper identity bonus.

**HCS audit trail.** JS SDK call (<https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message>):
```js
const transaction = await new TopicMessageSubmitTransaction()
  .setTopicId(newTopicId)
  .setMessage("Hello, HCS!");
const txResponse = await transaction.execute(client);
const receipt = await txResponse.getReceipt(client);
```
Cost: that page states ~**$0.0001 USD** baseline per message (~$0.05 if the topic has custom fees). The mainnet fee schedule page <https://docs.hedera.com/hedera/networks/mainnet/fees> lists base fees **ConsensusSubmitMessage $0.0008**, **ConsensusCreateTopic $0.01**, **CryptoTransfer $0.0001**, **TokenTransfer $0.001** (the two pages disagree on the submit fee; either way it is sub-cent, and testnet HBAR is free from <https://faucet.hedera.com>).

---

## 6. Open-source track: Hedera Harness + hedera-skills

**`hedera-dev/hedera-harness`** (<https://github.com/hedera-dev/hedera-harness>, pushed 2026-09-03). README: "TypeScript CLI that builds features into [scaffold-hbar](https://github.com/hedera-dev/scaffold-hbar) projects from a product brief you write. It drives a coding agent, validates what the agent produced, and repairs on failure… **The harness decides whether a run passed, not the agent.**" Four stages per attempt: GENERATE (coding agent) → ASSERT (files, static, secrets, commands) → SMOKE (dev server + Playwright routes) → EVALUATE (adversarial validator). Recipe lives in `.harness/` (`schemaVersion: 2`, `baseline.commands`, `agent: claude | cursor`).

Open work:
- Issue **#8** "Add an optional HOL Guard validator to the deterministic ASSERT stage" (open since 2026-08-13, unlabelled) — the only open issue; a well-scoped validator contribution.
- Open PRs: #37 `chore: release 2.0.0-rc.4`, #16 `feat: doctor verifies the chain operator on-chain before a run`, #15 `fix: let the ephemeral chain signer receive HTS tokens and still sweep`, #12 `Dev`.

**`hedera-dev/hedera-skills`** (<https://github.com/hedera-dev/hedera-skills>, pushed 2026-09-03). A Claude Code plugin marketplace: `/plugin marketplace add hedera-dev/hedera-skills`, then `agent-kit-plugin`, `system-contracts`, `oracles`, `cross-chain`, `native-services-js`, `hackathon-helper`, `hedera-harness`, `dev-intelligence`; also `npx skills add hedera-dev/hedera-skills`.

Open work:
- Issue **#17** "Add an HCS-14 agent-identity / registration + discovery skill" (open since 2026-07-25) — **this is the highest-leverage overlap**: it is both the open-source prize and the HCS-14 bonus for the Hedera payments prize.
- Open PRs already in flight (avoid duplicating): #28 `skill(x402-payments): document five silent failure modes`, #18 knowledge-passport, #16 mirror-node, #12 business-enablement, #1 hedera-solidity-guide. Note #28 means an **x402-payments skill already exists** in that repo — extend, don't recreate.

---

## 7. Feasibility: adding a `HederaRail` to ARCADE

**What ARCADE already has** (`packages/payments/src/rail.ts`): a three-method interface — `challenge(ChallengeInput) → PaymentRequirements`, `verify(payload, requirements) → VerifiedPayment`, `settle(verified) → SettledPayment` — behind `RailTag` (a `Context.Tag`), with `EIP3009Live`, `GatewayLive`, `RailTest` as the existing implementations. Consumers: `apps/hub/src/pipeline.ts`, `apps/hub/src/server.ts`, `apps/hub/test/pipeline.test.ts`. Buyer signing lives in `packages/buyer/src/fetch-with-payment.ts` (`signAuthorization`, probe → 402 → sign → retry, with a spend cap) and `apps/web/src/lib/sign.ts`.

The shape maps 1:1 onto the x402 v2 facilitator interface, so a `HederaRail` is mostly **glue, not redesign**.

**What actually has to be built:**

1. **`HederaLive` rail (hub side)** — `challenge` emits `{ scheme: "exact", network: "hedera:testnet", amount, asset: "0.0.429274" | "0.0.0", payTo: "0.0.SELLER", maxTimeoutSeconds, extra: { feePayer } }`. The `feePayer` must be fetched from the facilitator's `GET /supported` (`signers`) rather than hardcoded. `verify`/`settle` become `Effect.tryPromise` HTTP POSTs to `https://api.testnet.blocky402.com/verify` and `/settle` (or `https://x402.org/facilitator`). **Half a day.** The hub's verify-then-settle ordering is preserved exactly — the spec says `/verify` "MUST NOT … write onchain state", which is what settle-on-success (hard rule 5) needs.
2. **Buyer signing** — this is the real work, and it is *not* EIP-3009. The buyer must hold a Hedera ECDSA key, build a `TransferTransaction` with `transactionId.accountId = extra.feePayer`, sign, serialize, base64, and send `{ transaction }` in the payload. That means adding `@hiero-ledger/sdk` (or `@x402/hedera` client, which does it for you) to `packages/buyer` and branching `signAuthorization` on `requirements.network` namespace (`eip155:` vs `hedera:`). **~1 day**, less if you use `@x402/hedera` directly.
3. **HTS association preflight** — both buyer and seller accounts must associate USDC `0.0.429274` before any USDC payment, or `/settle` returns `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`. Copy `scripts/associate-token.ts` from the PoC. HBAR (`0.0.0`) needs no association — **demo with HBAR first, USDC second**. **~2 hours.**
4. **Receipts / listing schema** — `SettledPayment` currently assumes an EVM tx hash; Hedera returns `transactionId: "0.0.1235@1700000000.000000000"` and a HashScan URL rather than `testnet.arcscan.app`. Needs a rail-tagged receipt variant and an explorer-URL function. Listings need a per-rail price+payTo (Hedera account id, not an 0x address). **~half a day**, and it touches `packages/core`'s schema — do it carefully, the seller-secrecy boundary must not move.
5. **Decimals** — third distinct convention after Arc's dual 6/18: HBAR amounts are in **tinybars (10⁸)**, HTS USDC in the token's own decimals (6). Add explicit unit types.

**Honest estimate: 2–3 focused days** for a working "same listing, two chains" demo, with the buyer-side Hedera signing and the receipt/schema fan-out being the two places that eat time. Risks: (a) Blocky402's source is not actually reachable at the advertised repo (404), so you cannot self-host if the hosted testnet facilitator is down — mitigate by supporting `x402.org/facilitator` as a fallback, which the Hedera PoC already proves works for `hedera:testnet`; (b) `@x402/*` is at 2.24.0 and moving fast — pin exact versions; (c) Arc is not a registered x402 network, so don't claim "cross-chain x402" without noting ARCADE self-facilitates on the Arc side.

**Cheap bonus points, in order of value/effort:** HCS audit trail (write each settled job to a topic — sub-cent, ~30 lines, and `HCSAuditTrailHook` in the Agent Kit is a working template) → HCS-14 UAID for every listed agent (pure local hash, no chain tx, and it doubles as hedera-skills issue #17) → A2A transport (`specs/transports-v2/a2a.md`) → HTS custom fee schedules for the marketplace take-rate (a real alternative to `FeeSplitter.sol`) → ERC-8004 (skip unless a Hedera testnet registry address can be confirmed).
