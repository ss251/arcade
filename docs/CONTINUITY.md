# ARCADE continuity: inherited foundation and ETHOnline changes

This is a checkpoint at `f300b79` (September 5, 2026), not a claim that every planned feature or production deployment is finished. The [approved scope](superpowers/specs/2026-09-04-ethonline-continuity-design.md) names nine product moves; the [execution index](superpowers/plans/2026-09-04-02-execution-index.md) divides them into plans A–I. Plans describe intent. The status and evidence below describe what actually landed.

## The two boundaries

The earlier Encode × Circle Programmable Money hackathon build (the prior Arc build) spans July 25–August 7, 2026, from `aa466f2` through `57183db` (112 commits). It already had paid Arc testnet endpoints, a pull-model seller runner and private/public manifest boundary, bounded execution, schema validation before settlement, buyer SDK/CLI/MCP surfaces, discovery, one-hop subcontracting and the original web chat/confirm flow. Its existing settlement, two-machine and earlier demo evidence belongs to that run.

`6f38178`, dated September 4, 2026 at 22:01:18 IST, added the ETHOnline research/specification/plans on top of `57183db`. It is the execution baseline, not the start of ARCADE. Product changes after it are the continuation described here. Shared foundational files have been extended; their presence in a diff does not make the whole original product new.

## Nine moves, implementation and evidence

“Live verified” below means the documented, bounded testnet run succeeded. It does not mean a durable public deployment or mainnet operation exists.

| Move | Plan | Status at this checkpoint |
| --- | --- | --- |
| M1 — Publish anything: skill, MCP and OpenAPI adapters | B | Adapter/publish implementation and evidence harness landed. Two-adapter live partial run and a separate $0.01 paid FX call passed. Full three-adapter B13 live proof remains pending; the subsequent free-route safety work is not yet merged. |
| M2 — Settlement core: input gate, lineage, tree ledger and FeeSplitterV2 commitment | A | Implemented and live verified: root $0.30 plus $0.05 and $0.01 descendants, committed tree evidence and cycle refusal before payment. Total $0.36 plus gas. |
| M3 — Pay-tested listings and automatic delisting | C | Implemented and live verified: two distinct $0.01 scheduled purchases bracket three durable jobless failures; reconnect alone does not clear delisting; a new paid pass restores discovery. |
| M4 — ERC-8004 identity, validation and settlement feedback on Arc | D | Implemented and live verified: identity mint, explicitly approved operator grant, one $0.01 settlement, request/response/feedback events and exact persisted document commitments. |
| M5 — ENSv2 namespaces, hiring by name, expiry and payee lock | E | Implemented, opt-in and live verified on Sepolia with a by-name Arc testnet purchase. Price update/revocation, unsigned mismatch refusals and true passive-expiry removal passed; independent post-cleanup state/owner-authority checks passed. |
| M6 — Gateway Nanopayments sessions | F | The single approved F1 gate passed deposit, verification, accepted transfer and buyer debit; recipient credit is pending batch. F2–12 code work is unblocked, but the session product and its separate live evidence are not complete. |
| M7 — The Graph ledger subgraph and Base cost-of-goods skill | G | Planned; no completed subgraph deployment, `counterparty-graph` listing or paid Graph evidence is claimed. |
| M8 — Marketplace, receipt-tree views, dashboards and publish wizard | H | Planned. The inherited chat and E's ENS-aware confirm-card improvements are present; they are not the planned multi-page marketplace/dashboard/wizard. |
| M9 — Chain configuration, boot checks, mainnet runbook, Circle CLI interop and mainnet transition | A + I | A's ChainConfig, boot checks and mainnet runbook landed. Circle CLI interop and mainnet execution remain pending. Mainnet configuration fails closed while pending. |

Plan I is cross-cutting packaging as well as part of M9: continuity, architecture/README updates, interop, new capture/video, check-ins and submission evidence. This checkpoint is not completion of those remaining deliverables.

### Dated follow-up — September 5, 2026, 08:57 UTC

M1's free-route follow-ups are now merged through `c6f6676` in three atomic Codex-attributed commits. The full B13 local live script passed all three adapters (`succeeded / end_turn`, exit 0); the [dated execution record](superpowers/sdd/2026-09-04-B-publish-adapters/free-route-integration.md) separates that result from dummy-provider tests and the earlier paid FX call. It is not hub output-schema, payment or independently verified provider-billing proof. The frozen table and attribution counts in this document retain their original `f300b79` checkpoint rather than silently changing history. Plans F–I are not made complete by this follow-up.

### Dated Plan J follow-up — September 8, 2026

The original nine-move checkpoint above remains frozen; this is a later
owner-approved extension, not a rewrite of inherited history. Plans now execute
A–B–C–D–E–F–G–H–J–I. At c5fdb47, the following J code is on main:

| Plan J addition | Implemented and evidenced | Not established |
| --- | --- | --- |
| Circle-shaped discovery and buyer rail selection | Shared ordered root accepts and registry-shaped metadata; bounded buyer allow-list and Gateway credit selection | Circle CLI live inspect/pay; public Circle marketplace membership |
| Owner-delegated Unified Balance funding | Explicit source/delegate/amount, durable journal and guarded SDK/CLI; offline integration | Live grant/deposit/delivery/purchase, paused at the unchanged read/signing deadline |
| Root ERC-8183 escrow | Pinned source/hook, guarded hub/runner pipeline, buyer SDK/CLI/MCP, exact proof and gas-inclusive budget checks | Deployment: approved implementation exceeds EIP-170; owner treasury checkpoint; Task10 live settlement/refund proof |
| Escrow index/web | Inactive mapping templates with actual Matchstick tests; declared rail filter and qualified public terminal receipt UI with native browser checks | Live source activation/Studio redeploy, public create/fund history, browser escrow signer or independent chain verification |

The [full pinned Circle checkout preview](evidence/J/circle-full-source-preview.md)
subsequently recognized18 source skill folders and previewed the two selected
listings without executing instructions or spending. This extends the earlier
excerpt evidence, not proof of two live paid listings. The [rail runbook](runbook.md#plan-j--rails-circle-dialect-and-evidence)
keeps amounts, fees, custody and evidence categories distinct. No Plan J live
payment approval was replayed, no validity/cap/replay rule was widened, and no
mainnet operation or GitHub push is claimed by this follow-up. Plan I packaging,
owner acceptance/capture and submission remain separate.

### Dated follow-up — September 8, 2026

The frozen table above is kept as written; this section supersedes its **M6, M7 and M8**
rows, which were accurate at `f300b79` and are no longer. It covers `c5fdb47..977e860`
(38 commits) — the Plan G Graph lane, Plan I packaging, and the fixes and deployment that
followed.

| Move | Status at `977e860` | Not established |
| --- | --- | --- |
| M6 — Gateway Nanopayments sessions | Session product merged; the F1 gate remains the only live evidence (deposit, verification, accepted transfer, buyer debit). | Recipient credit still pending batch; no separate live session-product evidence. |
| M7 — The Graph ledger subgraph and Base cost-of-goods skill | Merged. `arcade-ledger-arc-testnet` is deployed on Subgraph Studio and indexing Arc testnet; ledger mappings, hub index reads and the cost-of-goods skill are on main, with the paid-query lane journalled and replayable offline. | No paid Graph purchase is claimed as independent live evidence. |
| M8 — Marketplace, receipt-tree views, dashboards and publish wizard | Merged and deployed. The live web app serves the marketplace, listing and receipt pages, the seller dashboard and the publish wizard. | Escrow UI remains inactive pending the ERC-8183 deployment. |

Also in this range: Plan I packaging (architecture diagram, video shot list and narration
draft, submission checklist, partner feedback), the reproducible continuity snapshot script
used by the README block, a cold-install fix for `@circle-fin/unified-balance-kit`, and a
test-timeout fix. ETHGlobal check-in #1 was submitted on September 8 and is recorded at
[superpowers/checkins/2026-09-08.md](superpowers/checkins/2026-09-08.md).

**Deployment, September 8.** The hub and web services were redeployed from `977e860` and
both verified live: `https://arcade-hub-production.up.railway.app` (`/healthz`,
`/openapi.json`, `/listings`, a real HTTP 402 challenge) and
`https://arcade-web-production-8dc4.up.railway.app` (marketplace, buyer, chat, publish,
seller and listing routes). The production seller runner was restarted on current `main`,
which raised the live catalogue from four listings to nine across five adapter types, and
the **ENS production re-point executed**: Sepolia tx
[`0x95536ac0…`](https://sepolia.etherscan.io/tx/0x95536ac0df37ec691aee6a82e3465ad76e2abe021983ac0c42bfa196c9e50b54),
block 11662373. `usdc-flow-check.scf821769ed.arcade.eth` now names the production hub and
web hosts, with payee, chain and price untouched. Guarded resolution of that name remains
absent because the leaf is expired; reviving it is a separate owner RENEW that has not been
requested.

No mainnet operation, no new live payment approval and no video are claimed by this
follow-up.

## Evidence and limits

The [runbook](runbook.md) records the actual hashes, amounts, refusal observations, cleanup and deviations: [lineage](runbook.md#plan-a--evidence-lineage), [adapter evidence](runbook.md#plan-b--evidence-publish-adapters), [pay-tests](runbook.md#plan-c--evidence-automatic-delisting-and-recovery), [ERC-8004](runbook.md#plan-d--erc-8004-identity-and-settlement-evidence) and [ENS](runbook.md#ens-namespaces-sepolia). Use those measured amounts rather than the plan's earlier demo estimates.

These demonstrations used owned, temporary services that were stopped after their runs. D's registration URI still refers to its stopped loopback service, and its explicitly approved blanket ERC-721 operator grant remains in place. E's loopback URLs are not production endpoints: the demonstrated name is expired, its raw price is 11,000 atomic while the untouched context still describes 10,000, and its scoped daemon price permission remains revoked. Production re-pointing, another owner revival, price restoration and scoped regrant are separate pending owner actions. The first failed ENS supervisor run remains failed; its separately approved continuation is the successful run, with both histories preserved.

On-chain payment/event proofs, off-chain catalogue observations and unsigned synthetic refusal tests are identified separately. Private keys, registration secrets, journals, SQLite stores and owner handoffs are not public evidence exports. No mainnet settlement, full Gateway session, paid Graph workflow or new ETHOnline submission/video is claimed here.

## AI collaboration attribution

Codex: executor. Claude: conductor/planner. GPT/Grok: debate.

This is the user's attribution of the workflow, not a claim that a single model authored every line of the inherited repository. Existing per-commit credits are preserved: the 77 commits after `6f38178` through `f300b79` include 65 Codex co-author trailers and 12 early Plan A commits with Claude co-author trailers. This statement neither rewrites those credits nor attributes the inherited build to the current executor.

## Reproduce the repository comparison

```bash
# Prior build, then the documentation/planning execution baseline.
git show -s --format=fuller aa466f2 57183db 6f38178
git rev-list --count 57183db
git diff --stat 57183db 6f38178

# New product work at this frozen checkpoint, excluding the baseline docs commit.
git log --reverse --oneline 6f38178..f300b79
git diff --stat 6f38178 f300b79
```
