# GPT/Codex — Round 2: server-derived lineage, chain-auditable receipts

My revised position: ship **Arc + Graph + ENS**. P0 is a hub-issued parent capability, hub-derived lineage, atomic tree reservations, cycle/depth refusal, and signed receipt trees. Do not make nonce commitments or signed preflights mandatory. ERC-8004 registration plus settlement feedback is in; the Arc Agent0 subgraph is a time-boxed stretch. Commit to a Circle CLI buyer; time-box Gateway proof.

## Cross-examination: Claude

1. > “It does not need to be trusted, because the hub assigns lineage from the parent job it already knows.” (`r1-claude.md:15`)

The principle is right; the described plumbing does not yet exist. The runner’s hiring token is `HMAC(runner-local secret, jobId)` and cannot be verified by the hub (`packages/runner/src/hire-broker.ts:103-114`). Conversely, the hub’s result token is created under `ARCADE_HUB_SECRET` (`apps/hub/src/server.ts:297-309`) but is returned to the buyer, not placed in `JobAssignment`, whose current fields contain no parent capability (`packages/core/src/protocol.ts:113-120`).

The buildable design is therefore complementary, not either/or: the hub sends a domain-separated `hireCapability` with the parent assignment; a child request presents only that opaque capability; the hub verifies it and derives `rootJobId`, parent, ancestors, hop and cap from persisted jobs. Never trust lineage fields supplied by the broker.

2. > “The hub can sum descendant `priceAtomic` and refuse the hop that would exceed the root’s declared ceiling.” (`r1-claude.md:12`)

That overclaims concurrency safety. Two siblings can both observe the same remaining amount before either settles. The current broker illustrates the race: it calculates remaining at `hire-broker.ts:162-180`, awaits the purchase, and increments spending only afterward at `:191-202`.

The enforceable invariant requires a transactional root ledger:

`committed + reserved + childPrice <= maxAggregateSubSpendAtomic`

Reserve on accepting the child’s paid retry, commit after settlement, release on failure/expiry. A decreasing scalar—even MACed—is insufficient.

3. > “A stranger opens the root settle tx on Arcscan, follows the child tx hashes, and checks the sum.” (`r1-claude.md:13`)

A stranger can check the **disclosed transactions**, not prove the tree. Today `Receipt` has no parent, child or commitment fields (`packages/core/src/receipt.ts:16-58`), while `FeeSplitter.Settled` exposes buyer, total, split and nonce—but no root or parent commitment (`contracts/FeeSplitter.sol:101-103,145-183`). Arcscan therefore cannot prove causality, completeness, ancestor refusal or that an omitted child does not exist.

The honest artifact is a **hub-signed, chain-auditable receipt tree**. Arcscan verifies each listed edge’s payer, destination, amount, nonce and success; the hub signature attests the edges’ claimed relationship. Trustless completeness would require a lineage-aware on-chain event or Merkle root, which is out of scope.

4. > “Feedback that costs a settled USDC payment is the sybil-resistance-by-economics…” (`r1-claude.md:26`)

Too strong. ERC-8004 permits any non-owner/non-operator client to call `giveFeedback`; proof-of-payment is data in the referenced feedback file, not a condition the registry contract validates (`r1-claude.md:88`; [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)). By contrast, ARCADE’s local rating gate explicitly checks a settled receipt and recovers the buyer’s signature (`apps/hub/src/server.ts:728-750`).

Hub-written feedback is useful, but it is **ARCADE settlement evidence from a named attester**, not generic Sybil-resistant reputation. Consumers must filter `clientAddress == ARCADE_HUB_ATTESTER` and verify the referenced settlement transaction.

### What I concede to Claude

Claude is right that the root buyer pays only the root price and descendant sellers spend independent working-capital wallets (`docs/architecture.md:72-84`). He is also right to register/write ERC-8004 rather than read global scores, and right that ENSIP-25 closes the cross-chain identity loop (`docs/superpowers/research/ethonline-2026/ens.md:504-529`).

I retract two R1 requirements: nonce commitment is not necessary for enforcement, and a signed executable preflight is not P0.

## Cross-examination: Grok

1. > “Caps only shrink because the MAC binds the number the hub wrote.” (`r1-grok.md:32`)

A MAC prevents alteration, not double reservation. Concurrent siblings can reuse the same valid remaining value. Grok’s wire format needs the atomic root-ledger reservation above; otherwise it enforces only `each child <= previously observed remaining`, not an aggregate ceiling.

2. > “Root calls have no header; hub issues the token on `store.putJob` and returns it with the 202. The broker must present it on `/hire`.” (`r1-grok.md:31`)

The returned token is presently the buyer’s result-reading capability (`apps/hub/src/server.ts:848-865`); the broker never receives it. The broker instead receives a separate runner-local token through `daemon.ts:217-225`. Reusing HMAC code is easy, but reusing the existing token flow is not. Add a separate hub-issued hiring capability to `JobAssignment`, keeping result access and spending authority domain-separated.

3. > “Writing `giveFeedback` with the Arc `settleTx` in `evidenceURI` is a half-day.” (`r1-grok.md:19`)

The standardized parameter is `feedbackURI`, and proof-of-payment belongs inside its referenced JSON; Agent0 indexes that off-chain feedback file (`docs/superpowers/research/ethonline-2026/thegraph.md:113-134`). A robust integration also needs registration, persisted `skillId → agentId`, a stable receipt URI/hash, self-review protection, post-settlement retry behavior and tests. “Half-day” is optimistic.

Still, one featured skill is achievable and in scope. The write must be best-effort after settlement: failure to publish reputation cannot undo or conceal a successful payment.

4. > “Live revoke, next Arc call 402s.” (`r1-grok.md:102`; similarly `:120`)

Revoking `authorizeTextRoles` removes permission to update that key; it does not erase its existing value. ENS’s documented flow uses the same function with `false`, after which the delegated wallet’s next `setText` fails (`docs/superpowers/research/ethonline-2026/ens.md:398-421,654-664`). An unchanged `arcade.payTo` should continue matching the 402.

The correct demo has two related beats:

- Grant price-only authority, update price, revoke it, and show the next daemon update revert.
- Resolve `arcade.payTo` and `arcade.chain`, then tamper the hub’s 402 and show buyer refusal on mismatch (`ens.md:672-683,737-742`).

For revocation that actually disables purchasing, call `unregister()` or clear the authoritative records—not merely revoke the price editor.

### What I concede to Grok

Grok correctly prioritizes Base-mainnet Graph x402 COGS, rejects aggregate 8004 score gating, treats Subgraph MCP as optional composition, and chooses ENS over World. He also correctly insists that each hop is an independent EIP-3009 authorization, not delegated buyer funds (`r1-grok.md:13,38`).

## Resolved positions

**Lineage within two days.** Implement hub-issued capability plus hub-derived lineage and an atomic reservation ledger. Store parent/root/hop/ancestor commitments in jobs and receipts; refuse cycles and depth overflow before dispatch. Add an EIP-191 hub signature over the canonical receipt tree. Defer nonce commitment: EIP-3009 signs only six transfer fields (`packages/payments/src/types.ts:43-54`; `packages/payments/src/eip3009.ts:87-96`), and making a custom nonce mandatory would exclude ordinary x402 clients. A nonce commitment is later audit polish, not enforcement.

**Arc Agent0 subgraph.** **Stretch, four-hour hard cap**, after Graph COGS works. Arc Studio deployment is plausible, but it is Studio-only, not network-publishable and has no x402 endpoint (`thegraph.md:191-197`). Base x402 COGS directly satisfies “load-bearing,” live data and meaningful work (`prizes-page-2026-09-04.txt:171-175`). If the smoke test succeeds, query Arc identities plus hub-attested feedback; otherwise cut without weakening the Graph entry.

**ERC-8004.** In, but for one featured skill—not automatic registration of every seller. Register on Arc under the seller identity, persist the agent ID, and have a distinct funded hub attester publish `arcade-settled` feedback after settlement. Never gate on global summaries.

**Signed preflight.** Cut. Add exact-input schema validation and current-runner status to the existing free probe. Today the hub verifies authorization before even parsing input (`apps/hub/src/server.ts:780-808`), but failure still remains uncharged. A signed `quoteId` adds state and expiry races without improving the core non-capture guarantee.

**Gateway versus Circle CLI.** Commit the **Circle CLI buyer**. It proves third-party x402/Agent Stack interoperability; the canonical payload was already corrected against Circle CLI behavior (`packages/payments/src/types.ts:57-64`). Time-box a true Gateway payment round-trip to two hours only. Gateway is Arc-testnet-only and unavailable for the required mainnet launch path (`arc-circle.md:181-198,315-338`), whereas the CLI supports Arc Testnet agent wallets and `services pay` (`arc-circle.md:108-126`).

**ENS versus World.** ENS. World offers $3,500 but requires AgentBook, Sandbox App testing and a feedback document (`prizes-page-2026-09-04.txt:570-584`), with unresolved Sandbox/AgentBook compatibility (`world.md:185-191`). ENS is only $500, but directly secures payment routing, delegated updates and ERC-8004 identity. That coherence is worth more than speculative prize EV.

| topic | my R2 position | confidence | what would change my mind |
|---|---|---:|---|
| lineage enforcement | Hub-issued capability + server-derived lineage + atomic reservations | high | A simpler design passes concurrent-sibling and forged-lineage tests |
| EIP-3009 nonce commitment | Defer; audit polish, not enforcement | high | Arcscan demo is required to prove causal linkage without trusting a hub signature |
| Arc Agent0 subgraph | Four-hour stretch | high | A trivial Arc Studio deployment and Agent0 port succeed immediately |
| ERC-8004 | One seller registration + hub-attested settlement feedback is in | medium-high | Deployed ABI differs from the verified ERC or feedback writes prove operationally expensive |
| ENS demo | Price-role revoke plus separate payTo-tamper refusal; unregister for delisting | high | Resolver revocation is shown to clear records, contrary to its documented semantics |
| signed preflight | Cut; validate exact input on the free probe | medium-high | Real testing reveals paid waits/dead runners materially damage conversion despite non-capture |
| Circle integration | Circle CLI buyer committed; Gateway live payment time-boxed | high | Gateway round-trip works immediately and remains compatible with delayed settlement |
| ENS vs World | ENS | medium-high | World supplies a verified Sandbox-compatible AgentBook path and an extra build day |
