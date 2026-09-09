# R2 — Claude Fable 5.1: cross-examination

Read both R1s in full, re-verified the code they cite. Concessions first, because there are several.

## What I concede

1. **My ENS revoke demo was wrong (Codex).** Revoking the daemon's price-only role leaves every existing record intact; the next Arc call would proceed normally. Verified against the semantics in `../ens.md` §3.3 (`authorizeTextRoles` grants/revokes *write* permission on one key; it does not clear the record). Correct demo, adopted: (a) revoke → daemon's next `setText(price)` reverts on Sepolia; (b) separately tamper the hub's 402 `payTo` → buyer SDK refuses because ENS still resolves the locked `arcade.payTo`. Two beats, both real.
2. **"Verify the tree on Arcscan" was an overclaim (Codex, Grok).** Arcscan can verify each *disclosed* child edge; it cannot prove the hub disclosed *every* child. Verified: `Receipt` is flat (`packages/core/src/receipt.ts:16-58`) and the nonce is an unrelated timestamp hash (`packages/payments/src/eip3009.ts:404`, `keccak256(toHex(\`arcade-${now}-…\`))`). Adopted wording: **hub-signed, chain-auditable receipt tree**, not trustless proof.
3. **The buyer's cap does not compose (both).** Already retracted in my R1; Grok's line is the right video sentence: "hop 2 is the seller's sub-buy wallet, not nested buyer funds."
4. **Hub verifies payment before parsing input (Codex).** Verified at `apps/hub/src/server.ts:797-808`: `rail.verify` runs, then `const input = await req.json().catch(() => ({}))`, and no `inputSchema` check happens on that path. Malformed input becomes `{}` and a job is created against a verified authorization; whether the buyer is charged then depends only on the seller's output validating. This is exactly the "paid, got 400" class we claim to have deleted, one layer in. It must be fixed in P0: validate `inputSchema` **before** `rail.verify`, refuse with 400 and no job.
5. **Runtime Subgraph MCP as a hard dependency is fragile (Codex).** Pin the subgraph id and GraphQL document for the paid path; use the MCP for *discovery during development* and mention it in SKILL.md. Adopted.
6. **Gateway proof over `circle` CLI (Grok).** The Arc rubric names Nanopayments; a live `GatewayLive` settle is worth more than a second buyer client. Adopted as the day-2 afternoon slot, with the `circle` CLI as the fallback if Gateway's Arc facilitator refuses.

## Where I rebut Grok

**G1. "Do not deploy an Agent0 subgraph on Arc as P1 … a Studio playground URL is how continuity entries get a polite zero."** Partly wrong on the rules. The Graph prize text says live data may come from "querying Subgraphs with an API key from Subgraph Studio" (`../prizes-page-2026-09-04.txt`, Graph continuity requirement 2) — a Studio deployment *is* a qualifying provider. Grok is right that it has no x402 endpoint and cannot be network-published (`../thegraph.md` §0). So the Arc subgraph does not replace the Base cost-of-goods hop; it adds a second Graph product on our own chain. I move it from "P1 load-bearing" to **stretch, gated by a 4-hour day-1 smoke test**, which is Codex's position. Concede half.

**G2. "A marketplace-events subgraph has almost nothing ARCADE-specific to index."** Wrong once ERC-8004 registration and hub-written feedback exist: the Arc IdentityRegistry `Registered` events and ReputationRegistry `NewFeedback` events for ARCADE agents *are* ARCADE-specific, and FeeSplitter emits `Settled(from, value, sellerAmount, feeAmount, nonce)` (`contracts/FeeSplitter.sol:101,183`). That is three event surfaces on Arc worth indexing. Grok's own R1 endorses the 8004 write ("half a day"), so the premise of G2 contradicts its own §2(a).

**G3. "Client-supplied ancestors[] is forgeable … enforcement has to be a hub-issued HMAC token."** Agreed on the conclusion, but my R1 never proposed trusting a client header: the hub *derives* lineage from the parent `jobId` + parent job token the broker presents, and looks the parent up in `store.getJob`. Both designs make the hub the source of truth. Difference: Grok's token carries `remainingCapAtomic` as a decreasing scalar; Codex correctly notes concurrent sibling hires can double-spend a scalar. Resolution below.

**G4. "MAX_HOP … ship 3."** Opinion vs opinion; I'd ship 2 because the only real chain today is depth 1 (`skills/wallet-risk-note/arcade.json` hires `usdc-flow-check`, which has no capabilities) and a demo of `A→B→C` refused at depth 3 is a config flag away. Low stakes.

## Where I rebut Codex

**C1. Nonce commitment `nonce = keccak256(canonicalLineageToken || salt)` with `signAuthorization` accepting a nonce override.** Clever and verified feasible: the FeeSplitter path exposes the nonce on-chain (`contracts/FeeSplitter.sol:183`) and the plain USDC path exposes it in `AuthorizationUsed(authorizer, nonce)` per EIP-3009. But it changes the buyer SDK, the web signer (`apps/web/src/lib/sign.ts`), the `circle` CLI compatibility (a third-party x402 client will never set our nonce), and the conformance suite, for a property that only holds when the *client* cooperates. A hub-issued lineage token bound into the **hub's receipt signature** gives auditability without breaking "any x402 client can buy" (`docs/narration/beat-5.txt`: "Circle's own CLI reads our 402"). Position: nonce commitment is **optional for ARCADE-native clients** (broker + SDK), never required; the receipt tree is the primary artifact. Confidence medium; Codex may show the override is smaller than I think.

**C2. Atomic reservations against a root ledger, commit on settle, release on failure/expiry.** Correct in principle; too big for 2 days *if* built as a general reservation system. The existing per-job ledger (`hire-broker.ts` `ledgers` map) already serializes hires within one job because the sandbox awaits each `hire()` call. Concurrent siblings only arise if a skill fires parallel `hire_skill` calls, which the current engines do not (tool calls are sequential in `claude-api.ts`). Ship: hub-side `rootJobId → reservedAtomic` map, reserve at 402-issue, release at terminal receipt. That is a Map and two lines in `pipeline.ts`, not a system. Concede the principle, shrink the build.

**C3. "Signed executable preflight … reserve capacity … hub-signed quoteId required by the paid retry."** Half in scope. The input-schema check before verify (concession 4) and a `runner connected` check are two lines each and belong in P0. A signed `quoteId` that the paid retry must carry is a protocol change every client must follow, which again breaks third-party x402 clients. Position: make the preflight **available and free** (`GET /x/:seller/:skill/preflight?` or the existing probe returning `runnerOnline`, `inputSchemaOk`), never **required**. ARCADE's promise is "no ARCADE-specific client" (`README.md` Discovery).

**C4. "Both, if the Arc Agent0 smoke test succeeds within four hours" ranked above COGS alone.** Agree, and note it converges with my adjusted G1.

**C5. Codex's P0 at 3.0 days including reservations + preflight + ChainConfig.** With C2/C3 shrunk, P0 fits 2 days, matching Grok. The recovered day goes to Gateway proof (Grok) and the 8004 write (both).

## Resolutions

- **Lineage mechanism:** hub-issued, HMAC-signed lineage token (Grok) carrying `{rootJobId, parentJobId, hop, ancestors[]}`; the hub also *derives and cross-checks* it from the parent job (mine), so a stale or forged token is refused either way. Remaining tree budget is a **hub-side reservation map keyed by rootJobId** (Codex, shrunk), not a scalar in the token. Nonce commitment optional for native clients. What a stranger verifies on Arcscan: each disclosed child settle tx, `from` = the hiring seller's sub-buy wallet, `to` = hired seller/FeeSplitter, amount = listed price; the receipt tree is hub-signed. Say "chain-auditable", not "trustless".
- **Arc Agent0 subgraph:** stretch, 4-hour smoke test on day 1; if green, deploy on day 4 pointing at the three Arc registries + FeeSplitter; discovery reads settled-feedback counts from it.
- **ERC-8004 on Arc:** **in.** `IdentityRegistry.register(agentURI=/listings/:id)` on `arcade start`; hub attester `giveFeedback(agentId, 1, 0, "arcade-settled", skillId, endpoint, receiptURI, hash)` only on settled receipts, receipt file carries the settle tx in the proof-of-payment block (ERC text verified in my R1 addendum). Query only `clientAddress == hub attester`. Never a score gate.
- **ENS demo:** Codex's two-beat version.
- **Preflight:** input-schema-before-verify + runner-online, free and optional; no required quoteId.
- **Gateway vs circle CLI:** Gateway live-proof first, half a day; CLI fallback.
- **ENS vs World:** ENS, with ENSIP-25 pointer to the Arc 8004 id (all three R1s converge).

| topic | my R2 position | confidence | what would change my mind |
|---|---|---|---|
| Lineage mechanism | hub-issued HMAC token + hub cross-check; reservation map for tree cap; nonce commitment optional | high | a ≤40-line nonce override that keeps third-party clients working |
| Arcscan claim | "hub-signed, chain-auditable receipt tree" | high | an on-chain Merkle commitment shipped in ≤1 day |
| Arc Agent0 subgraph | stretch after 4h smoke test | medium | Studio rejects `arc-testnet` → cut |
| 8004 identity + settlement feedback on Arc | in, ~0.5–1 day | high | Arc deployment ABI differs from the ERC |
| Graph primary | Base x402 cost-of-goods skill, pinned subgraph id | high | testnet gateway comes back → use Base Sepolia |
| Input-schema-before-verify | in P0 | high | nothing |
| Signed preflight/quoteId | free optional preflight only | medium | judges value it over third-party-client compatibility |
| Gateway proof vs CLI | Gateway first | medium | Gateway facilitator refuses Arc in <1h → CLI |
| ENS vs World | ENS with ENSIP-25 | medium | 8004 registration gets cut → World |
| MAX_HOP | 2 | low | any argument |
