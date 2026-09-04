# Grok 4.6 — Round 2 cross-examination

Same spine as Round 1: failed-job-first, hub-enforced hop lineage, Graph as Base x402 cost-of-goods, Arc+Graph+ENS. Three corrections after reading Claude and Codex against the code.

---

## Claude — five overclaims

**1. “A forged header buys nothing… the broker passes the parent `jobId` + job token, the hub looks the parent up.”** (`r1-claude.md`)

Two different tokens exist. The hub job token is `HMAC(ARCADE_HUB_SECRET, "arcade-job:"+jobId)` and is a *buyer* read capability on `GET /jobs/:id/result` (`apps/hub/src/server.ts:301-312`, `:852-865`). The hire token is `HMAC(runnerSecret, jobId)` over a Unix socket and is never sent to the hub (`packages/runner/src/hire-broker.ts:107-114`, `:136-142`; `packages/buyer/src/hire.ts:88-102`). `JobAssignment` carries only `{jobId, skillId, skillVersion, input, timeoutSec}` (`packages/core/src/protocol.ts:113-120`). The runner therefore cannot “pass the hub job token” unless we leak the buyer’s result capability onto the child `POST /x/…`. Parent-job lookup without a hub-issued MAC also fails open: job ids are public on `/receipts` (`packages/core/src/receipt.ts:17`; `apps/hub/src/server.ts:700-704`), so a stranger can claim any in-flight parent. Hub-derived ancestors are the *source of truth after authentication*; they are not the authentication.

**2. “A stranger opens the root settle tx on Arcscan, follows the child tx hashes, and checks the sum.”** (`r1-claude.md`)

`Receipt` today is a flat row: `settleTx?`, no children (`packages/core/src/receipt.ts:16-58`). `FeeSplitter.Settled` emits `(buyer, total, sellerAmount, feeAmount, nonce)` (`contracts/FeeSplitter.sol:101-103`, `:183`) — one hop, no parent pointer. Disclosed child hashes are inspectable; omitted children are not. Codex is right on completeness. Video language cannot be “verify the tree on Arcscan.”

**3. “Deploy Agent0… discovery surfaces read settled-feedback counts… a listing with zero settled 8004 feedback is capped at a first-call amount.”** (`r1-claude.md`)

That is score-gating with extra steps. ERC-8004 itself says unfiltered `getSummary` is Sybil-open and callers MUST pass trusted `clientAddresses` (https://eips.ethereum.org/EIPS/eip-8004, Security Considerations). The Graph Continuity bar is already met by a live Studio/gateway query plus meaningful work (`prizes-page-2026-09-04.txt:171-174`). Graph x402 is Base-only (https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/). Making `GET /listings` depend on a Studio subgraph that cannot be network-published (`thegraph.md:9-11`) is a reliability regression, not a prize requirement.

**4. Video beat: “revoke the role → next call refuses.”** (`r1-claude.md`)

`authorizeTextRoles` gates *who may write* a text key. Revoking the daemon’s price role leaves the existing `payTo` record intact (`ens.md` §0; https://docs.ens.domains/ensv2/permissioned-resolver). Next Arc call still pays. Codex’s split demo is the one that matches the prize text (`prizes-page-2026-09-04.txt:770`).

**5. “The hub can sum descendant `priceAtomic` and refuse the hop that would exceed the root’s declared ceiling.”** as if `maxSubSpendUsd` were already a hub invariant (`r1-claude.md`)

`maxSubSpendUsd` is opened per job on the *seller runner* (`packages/runner/src/daemon.ts:217-226`; `hire-broker.ts:223-227`). The hub’s paid path never reads it (`apps/hub/src/server.ts:770-828`). A remaining-cap scalar in a MAC is also racy under parallel `hire_skill` calls. The invariant is real only after a hub-side reservation row keyed by `rootJobId`.

---

## Codex — five overclaims

**1. `nonce = keccak256(canonicalLineageToken || salt)` as the binding that makes lineage enforceable.** (`r1-codex.md`)

EIP-3009 signs exactly `{from,to,value,validAfter,validBefore,nonce}` (`packages/payments/src/types.ts:46-54`). `signAuthorization` mints an unrelated nonce (`packages/payments/src/eip3009.ts:400-415`). `verify` checks value, `payTo`, window, typed-data recovery, `authorizationState`, balance — not `accepted.extra` (`eip3009.ts:217-283`). That is all true. Binding lineage into the nonce is still the wrong P0: the repo’s interop bar is Circle CLI’s canonical payload (`types.ts:60-64`). A custom nonce in `extra` is a dialect those clients will not speak. Gateway’s rail does not share that nonce (`packages/payments/src/gateway.ts`). Enforcement of T-SPEND-003 is a hub check on a MAC the *runner* presents, not a property of USDC. Buildable in an afternoon; not what makes the hop refuse `A→B→A`.

**2. “The single highest-value addition is a signed executable preflight… `quoteId` required by the paid retry.”** (`r1-codex.md`)

`arcade_quote` already probes the 402, signs nothing, charges nothing (`packages/buyer/src/mcp.ts:150-163`, `:301-308`). `arcade_describe_skill` already returns hub-computed `ObjectiveStats` (`mcp.ts:290-296`; `receipt.ts:71-82`). Output schema is what `shouldSettle` checks (`packages/core/src/job.ts:96-135`; `apps/hub/src/pipeline.ts:132-138`). Input schema is advertised in OpenAPI and **not** validated on the paid path (`server.ts:802-808`; `apps/hub/src/validate.ts:1-28` is output-only) — Codex is factually right there. A `quoteId` mandate on retry re-breaks Circle CLI the same way a custom nonce does. The X complaint “paid, got 400” (https://x.com/revettr_x402/status/2093339762786447506) is already the product’s never-broadcast path. Preflight does not beat that on camera.

**3. P0 as 3.0 days of signed lineage + nonce commitment + atomic reservations + signed preflight + ChainConfig.** (`r1-codex.md`)

T-SPEND-003’s own stated fix is “a header, one check at the paid endpoint, and pass-through in the hire broker” (`docs/threat-model.md:188`). HMAC job tokens already exist (`server.ts:301-305`). That plus a SQLite reservation and receipt children is two days, not three. Preflight and nonce-binding are how P0 misses Graph.

**4. “ENSIP-25 explicitly defines that bidirectional registry/name verification.”** (`r1-codex.md`)

ENSIP-25 specifies one direction: construct `agent-registration[<ERC-7930 registry>][<agentId>]` and resolve a non-empty text record (https://docs.ens.domains/ensip/25/). The other direction is an ENS service entry in the 8004 registration file (https://eips.ethereum.org/EIPS/eip-8004). Useful flourish if 8004 register ships; not a second prize mechanism.

**5. Completeness “requires an on-chain tree/Merkle commitment or a lineage-aware `FeeSplitter` event” as if that were in the two-day set.** (`r1-codex.md`)

The honest naming is right. The implied build is not. Redeploying `FeeSplitter` (seller is immutable — `packages/payments/src/rail.ts` comments at `:19-26`; `docs/architecture.md:19-26` on per-seller splitters) plus a Merkle root is a contract project, not an 8-day continuity patch. Do not block lineage on it.

---

## Concessions (and what they change)

From Codex, I take three things.

- **Arcscan completeness.** A stranger verifies disclosed edges: parent `settleTx` (root buyer → parent `payTo` / splitter) and each listed child `settleTx` (sub-buy wallet → hired seller), matching `FeeSplitter.Settled` nonce/amount (`FeeSplitter.sol:183`). They cannot prove the hub listed every child. Video line becomes “hub-attested receipt, chain-auditable edges,” not “trustless tree.” This was the weakest sentence in my R1.
- **Concurrent siblings.** Remaining-cap inside the MAC is not atomic. Hub SQLite: `reserved += childPrice` where `reserved + childPrice ≤ rootCeiling`, released on failure. Fits in the same two days because it is one table next to `putJob` (`server.ts:817-828`).
- **ENS demo.** Revoke price role → daemon `setText` reverts; separately tamper 402 `payTo` → buyer refuses because ENS still resolves the locked address. I retract “live revoke, next Arc call 402s.”
- **“Cannot capture” vs “does not broadcast.”** The hub holds a valid authorization until `validBefore` (`pipeline.ts:136-138`; `eip3009.ts:235-239`). Codex’s video sentence is the honest one. Never-capture remains the *family*; the claim is policy of this facilitator, not an on-chain lock.
- **Agent0.** I over-cut. Codex’s four-hour Studio smoke is the right gate. Success → video flourish querying hub-filtered feedback. Failure → cut. Not P1. Not load-bearing discovery.
- **Gateway vs Circle CLI.** I overweight Gateway as a day-2 pillar. Nanopayments is named (`prizes-page-2026-09-04.txt:440`) but both are garnish. Lineage first. If hours remain: GatewayLive round-trip on Arc testnet *or* `circle services pay`, not both, not P0.

From Claude, I take two.

- **Hub derives ancestors.** After the MAC authenticates, `store.getJob(parent)` is the ancestor set. Do not trust `ancestors[]` in the header. My R1 HMAC body still *carries* those fields for the runner; the hub must recompute them.
- **8004 write is cheap and on-mission.** IdentityRegistry `register(string)` and ReputationRegistry `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` are documented on Arc (https://docs.arc.io/arc/tutorials/register-your-first-ai-agent). Hub facilitator is not owner/operator, so it may write (https://eips.ethereum.org/EIPS/eip-8004). I upgrade this from “optional +0.5d” to **in, after Graph COGS, cuttable**. Still no `getSummary` in the buyer path. Still no first-call cap from feedback counts.

I do **not** concede: Agent0 as the Graph prize; signed `quoteId`; nonce-commitment as P0; World over ENS; client-supplied lineage; “buyer’s cap composes.”

---

## Resolved disagreements

**Lineage (enforceable and ≤2 days, one person).** Hybrid: hub-issued HMAC *plus* hub-derived ancestors. Concrete wire:

1. On `store.putJob`, hub computes `{rootJobId, parentJobId, hop, ancestors[]}` from the store, not the client. `mac = HMAC(ARCADE_HUB_SECRET, canonical(fields))` — same primitive as `jobToken` (`server.ts:303-305`).
2. Put `{parentJobId, lineageMac}` on `JobAssignment` (extend `protocol.ts:113-120`). That is the only path a runner is guaranteed to see; the 202 goes to the *payer*, which for hop 0 is the buyer, not the seller daemon.
3. Broker sends `x-arcade-lineage` on the child `POST /x/…` (probe and paid retry). Hub verifies MAC, recomputes ancestors from `store.getJob`, refuses if `listing.id ∈ ancestors` or `hop ≥ 3`, then reserves `parsePrice(listing.price)` against `rootJobId` in SQLite.
4. Receipt gains `parentJobId?`, `rootJobId?`, `hop`, `childSettleTxs[]`. `/jobs/:id/result` returns the tree to the token holder.

Omit-the-header still looks like a root buy. That is honest: a hostile runner speaking raw `POST /x/` is a new customer (`docs/architecture.md:84`). T-SPEND-003 is the *automatic* loop through `hire-broker`. Compliant runners cannot omit; that is the High residual the threat model actually named (`docs/threat-model.md:181-188`).

Nonce-commitment: out of P0. If leftover, advertise `authorization.nonce` on the receipt so a stranger can match `FeeSplitter.Settled` — matching, not hashing the token into the nonce.

**What a stranger verifies on Arcscan.** Open parent tx, open each listed child tx, confirm from/to/value; confirm splitter `Settled` nonce matches the receipt. Sum of disclosed children vs the root listing’s `maxSubSpendUsd`. Not completeness. Not “the buyer’s USDC funded hop 2.”

**Arc Agent0 subgraph.** Stretch, four-hour smoke, not P1, not a hard cut. Graph prize is won by the Base x402 COGS skill (`prizes-page-2026-09-04.txt:120-121,171-174`; live 402 at $0.01 USDC on Base, `thegraph.md:226-229`). Pin subgraph id + GraphQL document; runtime Subgraph MCP is bonus, not a paid-path dependency (agree with Codex).

**ERC-8004 identity + hub-written settlement feedback.** In, after COGS, half-day, cuttable. `register(agentURI)` with `agentURI = hub /listings/:id`; `giveFeedback` only when `receipt.settled` (`server.ts:728-730`) with `proofOfPayment.txHash = settleTx`. Read path: filter `clientAddress == ARCADE_HUB_ATTESTER`. Never gate payment on a score.

**ENS demo.** Codex’s. One parent, two skill subnames, resolve the live Sepolia set at runtime (`ens.md` §1.2), price-only `authorizeTextRoles`, buyer refuses hub `payTo` ≠ ENS `payTo`, revoke shows `setText` revert, tamper shows buyer refuse. ENSIP-25 pointer only if 8004 register shipped.

**Signed preflight/quote.** Out of scope. Optional two-hour add: run `validateOutput`’s sibling on `inputSchema` *after* verify and *before* dispatch, so garbage input never reaches the seller. Not a `quoteId`.

**Gateway live-proof vs Circle CLI buyer.** Neither is P0. Prefer Gateway if leftover hours because the Arc rubric names Nanopayments (`prizes-page-2026-09-04.txt:440`) and `GatewayLive` is code-complete (`packages/payments/src/gateway.ts:20-33`) but unproven. Circle CLI is already the wire-shape test (`types.ts:60-64`). Cut both before Graph COGS or hop tokens.

**ENS vs World.** ENS. World’s $3,500 is real (`prizes-page-2026-09-04.txt:570`) and so is the Sandbox/AgentBook verification split (`world.md:185-188`). Mars already spent World ID on a skills marketplace (https://ethglobal.com/showcase/mars-ua1qc). Coherence > EV.

Cut order, updated: World; Circle Marketplace form; 8004 *score* gating; signed quoteId / nonce-binding; Agent0 if smoke fails; Gateway prove; 8004 writes; ENS compressed to four hours. Never cut: hub-issued hop MAC + hub-derived ancestors + reservation ledger; failed-job demo; Graph COGS; continuity README.

---

| topic | my R2 position | confidence | what would change my mind |
|---|---|---|---|
| Lineage mechanism | Hub-issued HMAC on `JobAssignment` + hub-derived ancestors + SQLite reservation; no EIP-3009 nonce bind | 0.86 | Proof that Circle CLI / x402 `exact` already honors a server-supplied nonce in `extra` |
| Arcscan claim | Disclosed edges + splitter `Settled`; not completeness | 0.92 | A lineage field in `FeeSplitter` already deployed at `0xf95c…` |
| Agent0 subgraph | Stretch; 4h smoke; not P1 | 0.80 | Studio `arc-testnet` deploy + sync in <4h *and* Graph judges saying x402-on-Base is insufficient |
| 8004 register + hub `giveFeedback` | In after COGS, cuttable; no score gate | 0.78 | `giveFeedback` on Arc reverts for a non-owner that isn’t the buyer; or gas makes it a day-two sink |
| ENS demo | Revoke ≠ payment fail; payTo-lock + tamper refusal | 0.90 | PermissionedResolver deletes the text value on role revoke (it doesn’t in current docs) |
| Signed preflight | Out; optional input-schema check only | 0.84 | Judges/Grill treating never-broadcast as insufficient without a signed quote |
| Gateway vs Circle CLI | Neither P0; Gateway if leftover | 0.73 | Arc continuity rubric scoring Nanopayments as mandatory rather than “where relevant” |
| ENS vs World | ENS | 0.81 | World confirms Sandbox proofs register on canonical AgentBook this week |
