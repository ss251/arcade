# GPT/Codex — Round 1: conditional capture first, identity second

## Position

**Opinion:** ARCADE should lead with one defensible distinction: it verifies an authorization, runs a self-hosted skill, validates its output, and only then broadcasts settlement. That ordering already exists in `apps/hub/src/pipeline.ts:18`, while paid output is withheld unless the receipt settled in `apps/hub/src/server.ts:872`.

I agree with the conductor that failed-job-first, causal lineage, Graph as cost of goods, and mainnet configuration are the right spine. I disagree that the proposed “caps only shrink” tree or Arcscan proof is currently honest, that runtime Subgraph MCP is necessary, or that revoking an ENS price permission would itself make the next payment fail.

## 1. Builder: lineage, budgets, receipts

`maxSubSpendUsd` currently bounds one runner job; every descendant opens a fresh ledger from its own manifest, so `A→B→A` remains possible (`docs/threat-model.md:181`; `packages/runner/src/hire-broker.ts:223`). Each child payment also comes from that seller’s independent `ARCADE_SUBBUY_KEY`, not from the root buyer’s authorization (`packages/runner/src/hire-broker.ts:192`; `docs/architecture.md:84`).

**Opinion:** lineage is P0; “the buyer’s tree budget” is the wrong claim. The honest claim should be:

> Within one ARCADE hub and compliant runner/broker, the hub bounds the aggregate value of settled ARCADE descendant calls in one causal job tree. The root buyer pays only the root price; descendant calls spend independently funded seller wallets, each still protected by its own per-job cap.

That is policy composition, not conservation of the buyer’s money, not delegated authority, and not a cross-hub guarantee.

**Proposed request/402 design (opinion):** carry `X-ARCADE-LINEAGE` on both probe and paid retry as a hub-signed token containing:

```text
v
hub
rootCallId
parentCallId
hop
ancestors[] = keccak256(seller || skillId || version)
maxAggregateSubSpendAtomic
reservationId
reservedAtomic
childPayer
childSeller
childSkillId
expiresAt
salt
hubSignature
```

The hub must atomically reserve the child price against a root ledger before issuing the child 402, commit it on settlement, and release it on failure or expiry; merely passing a decreasing scalar permits concurrent siblings to spend the same “remaining” amount.

Do not merely put this object in `PaymentRequirements.extra`. EIP-3009 signs only `{from,to,value,validAfter,validBefore,nonce}` (`packages/payments/src/types.ts:46`; `packages/payments/src/eip3009.ts:87`), and ARCADE’s verifier currently validates value, recipient, time, signature, nonce state and balance without binding arbitrary `accepted.extra` (`packages/payments/src/eip3009.ts:217`). Change `signAuthorization` to accept a nonce override and set:

```text
nonce = keccak256(canonicalLineageToken || salt)
```

Today it generates an unrelated nonce internally (`packages/payments/src/eip3009.ts:400`; `packages/payments/src/eip3009.ts:415`).

**Proposed receipt node (opinion):**

```text
callCommitment, rootCallId, parentCallId, hop, ancestors[]
treeCapAtomic, reservedAtomic, committedTotalAtomic, remainingAtomic
payer, payTo, authorizationNonce, amountAtomic, settleTx
children[{callCommitment, nonce, amountAtomic, settleTx|null, settled}]
hubReceiptSignature
```

A stranger could then recompute each nonce commitment and verify `from`, `to`, amount and nonce against Arcscan; `FeeSplitter` already emits buyer, total and nonce in `Settled` (`contracts/FeeSplitter.sol:101`; `contracts/FeeSplitter.sol:183`).

**Inference:** the conductor overclaims “verify the tree on Arcscan.” Arcscan can verify disclosed monetary edges, but the present contract and flat receipt cannot prove that the hub disclosed every child (`packages/core/src/receipt.ts:16`). Completeness requires an on-chain tree/Merkle commitment or a lineage-aware `FeeSplitter` event. Without that, call it a **hub-signed, chain-auditable receipt**, not a trustless proof.

## 2. Builder: ERC-8004 and The Graph

Arc officially documents the three ERC-8004 registries, including IdentityRegistry `0x8004A818…BD9e` and ReputationRegistry `0x8004B663…8713`, on Arc testnet ([Arc ERC-8004 tutorial](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent)). The Graph registry permits Studio-hosted Arc subgraphs but not Arc Substreams or decentralized-network issuance (`docs/superpowers/research/ethonline-2026/thegraph.md:9`).

The Sybil result is a reason not to use a global average, not a reason to abandon ERC-8004. The ERC itself warns that Sybil inflation is possible and requires `getSummary` callers to supply trusted `clientAddresses` (`https://eips.ethereum.org/EIPS/eip-8004`, Reputation Registry and Security Considerations). The empirical study reports widespread invalid endpoints and Sybil reviewers ([arXiv 2606.26028](https://arxiv.org/abs/2606.26028)).

**Opinion:** register each runnable skill-agent with `IdentityRegistry.register(agentURI)`, owned by the same seller address that signs ARCADE’s runner Hello. After—and only after—settlement, a distinct hub attester should call:

```solidity
giveFeedback(
  agentId,
  1,
  0,
  "arcade-settled",
  skillId,
  endpoint,
  receiptURI,
  keccak256(receiptJSON)
)
```

That exact ABI is standardized, and owners/operators cannot review their own agent ([ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)). Query only feedback where `clientAddress == ARCADE_HUB_ATTESTER`; call it “ARCADE settlement evidence,” never generic reputation.

**Opinion/ranking for Graph judges:**

1. **Both**, if the Arc Agent0 deployment smoke test succeeds within four hours.
2. **Base-mainnet x402 cost-of-goods skill alone.**
3. **Arc Agent0 subgraph alone.**

The Graph’s x402 gateway takes USDC on Base/Base Sepolia and recommends `@graphprotocol/client-x402`; it does not settle on Arc ([The Graph x402 docs](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/)). The live conductor probe found the available Base route charging $0.01 while the documented testnet hostname did not resolve (`docs/superpowers/research/ethonline-2026/thegraph.md:224`).

Build a counterparty-due-diligence skill that pays the Base Agent0 subgraph, interprets endpoints and proof-of-payment feedback, and returns a structured decision. If Graph payment/query fails or returns no usable data, the Arc parent must not settle. That is plainly load-bearing.

I agree with cutting **score gating**. I disagree with cutting 8004 entirely. Also cut runtime Subgraph MCP unless it proves useful: pin the audited subgraph ID and GraphQL document so a schema-discovery dependency cannot break every paid call.

## 3. User: what must exist before payment?

ARCADE already performs an unpaid probe, applies a local maximum, and refuses a second signature attempt (`packages/buyer/src/fetch-with-payment.ts:55`; `packages/buyer/src/fetch-with-payment.ts:82`). However, the hub verifies payment before it parses the exact input, and no input-schema validation occurs on that path (`apps/hub/src/server.ts:802`; `apps/hub/src/server.ts:808`).

**Opinion:** the single highest-value addition is a **signed executable preflight**, not another reputation badge. Before signing, it should:

- validate the exact input and return `inputHash` plus `schemaHash`;
- confirm a current runner heartbeat and briefly reserve capacity;
- bind `network`, `asset`, `amount`, `payTo`, skill version and expiry;
- return a hub-signed `quoteId` required by the paid retry.

That directly targets “paid, got 400/dead endpoint.” Sen reported that 93% of tracked endpoints lacked verification from an actual paid purchase ([post](https://x.com/sen_buidl/status/2093549214878048730)); Revettr reported 99 paid calls answered with 400 ([post](https://x.com/revettr_x402/status/2093339762786447506)).

**Opinion:** buyer priority is executable preflight, ENS-locked `payTo`, ARCADE-settlement history, then human backing. A signed sample can be stale; an ERC-8004 score can be Sybil; World proves a human relationship, not endpoint correctness.

For sellers, the strongest reasons to list are that code, prompts and credentials stay on their machine (`docs/architecture.md:24`), the runner opens the outbound connection (`packages/core/src/protocol.ts:8`), payment is verified before execution (`docs/architecture.md:16`), and the spending key remains outside the sandbox (`packages/runner/src/hire-broker.ts:23`). Circle’s marketplace already manually reviews and continuously health-checks listings, so health alone is not differentiation (`docs/superpowers/research/ethonline-2026/arc-circle.md:408`).

## 4. Market: differentiation and trust family

Mars already won Arc’s NYC 2026 agentic prize with audited skills, Arc escrow/x402 and a cross-chain audit trail ([ETHGlobal showcase](https://ethglobal.com/showcase/mars-ua1qc)). AgentForge already shipped an Arc skill marketplace with autonomous x402 calls and ratings in April ([GitHub](https://github.com/0xE1337/agentforge)).

**Opinion—one sentence:**

> ARCADE is the self-hosted skill market where failed work is never captured and subcontracting remains inside a signed, bounded causal receipt.

That avoids claiming marketplace novelty while naming two concrete differences.

**Opinion:** conditional non-capture wins the product argument; escrow wins the strongest cryptographic argument; off-chain refunds are weakest. ARCADE’s current `Rail` deliberately separates `verify()` and `settle()` (`packages/payments/src/rail.ts:49`). But the hub still holds a valid authorization until expiry, so “cannot capture” is too strong—the open-source hub **does not broadcast** unless output validates (`apps/hub/src/pipeline.ts:132`). The video should say:

> “We verify before work. We broadcast only after schema-valid output. On failure there is no settlement transaction—we did not send money back; the charge never landed.”

## 5. Prizes: ENS or World?

ENS continuity is $500 and requires functional ENSv2-on-Sepolia integration; World AgentKit continuity is $3,500 but requires AgentBook, the Sandbox App and a detailed feedback document (`docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:763`; `docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:570`).

**Opinion:** choose **Arc + Graph + ENS** by default. World has the larger ceiling, but its Sandbox-to-AgentBook path has unresolved compatibility and documentation conflicts (`docs/superpowers/research/ethonline-2026/world.md:185`). It also repeats ground Mars already covered with AgentKit ([Mars showcase](https://ethglobal.com/showcase/mars-ua1qc)).

ENS earns its day through the ENSIP-25 record:

```text
agent-registration[<ERC-7930 Arc IdentityRegistry>][<agentId>] = "1"
```

ENSIP-25 explicitly defines that bidirectional registry/name verification ([ENSIP-25](https://docs.ens.domains/ensip/25/)); ENSIP-26 supplies `agent-context` and `agent-endpoint[web|mcp]` ([ENSIP-26](https://docs.ens.domains/ensip/26/)).

The conductor’s revoke demo is wrong: revoking permission to modify `arcade.price` leaves the existing record intact. Correct demo: revoke, show the daemon’s next `setText` revert, then separately tamper with the hub’s 402 `payTo` and show the buyer refuse because ENS still resolves the locked address.

## 6. Mainnet credibility

Arc announces public mainnet for September 16 ([Arc](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026)), while current Arc documentation publishes only testnet parameters and says mainnet parameters will appear separately ([RPC documentation](https://docs.arc.io/arc/references/rpc-endpoints)). The repo currently hardcodes chain ID, RPC, explorer, USDC and Gateway addresses, and `EIP3009Live` imports viem’s `arcTestnet` object (`packages/core/src/chain.ts:10`; `packages/core/src/chain.ts:15`; `packages/payments/src/eip3009.ts:12`). The conductor’s “one-line flip” is therefore not true today.

**Opinion:** judges should see:

- `ChainConfig` injected through hub, buyer, web and both rails;
- separate checked-in testnet/mainnet deployment manifests;
- startup verification of `eth_chainId`, USDC `name`, `version`, `decimals`, EIP-3009 capability and funded facilitator;
- explicit rejection of Gateway when mainnet contracts are unavailable;
- FeeSplitter redeployment and verification per seller;
- a September 16–30 deployment checklist plus smoke/e2e commands.

The continuity launch prize requires deployment or deployment-readiness by September 30 (`docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:543`).

## 7. Ranked eight-day plan

**P0 — 3.0 days (Arc/security)**

- Signed lineage, ancestor/depth refusal, nonce commitment and tests.
- Atomic root aggregate-subspend reservations; if this slips, ship lineage/loop prevention and drop the tree-budget claim.
- Signed exact-input/liveness preflight.
- `ChainConfig` refactor and mainnet readiness checks.

**P1 — 2.25 days (Graph)**

- Graph-backed counterparty skill using `@graphprotocol/client-x402` on Base.
- Meaningful synthesis, Base payment evidence, and Arc non-settlement on Graph failure.
- Four-hour Agent0-on-Arc Studio smoke test; if successful, register one agent, write one settlement-tied feedback item and query it. Otherwise cut it.

**P2 — 0.75 day (ENS)**

- One parent and two skill subnames, ENSIP-25/26 records, locked `arcade.payTo`, price-only daemon permission, buyer mismatch refusal, revoke test.

**Packaging — 2.0 days**

- Continuity diff, AI attribution, architecture diagram, runbook, clean e2e recording, submission. The event requires a 2–4 minute real-voice video and explicit pre-existing/new work (`docs/superpowers/research/ethonline-2026/README.md:10`; `docs/superpowers/research/ethonline-2026/README.md:15`).

Cut order: Arc Agent0 deployment; runtime Subgraph MCP; Circle CLI buyer; ENS; aggregate tree cap. Never cut failed-job evidence, live Graph COGS, mainnet configuration, tests or submission documentation.

## Video: approximately 3:25

1. **0:00–0:20:** “Marketplace already existed; this week added causal budgets, Graph data and ENS authority.”
2. **0:20–0:50:** Deliberate schema failure; unchanged buyer balance; receipt says unsettled; no Arcscan transaction.
3. **0:50–1:20:** Successful call; output appears only after Arc settlement; open transaction and FeeSplitter event.
4. **1:20–1:55:** A hires B; show two payer wallets, two Arc settlements, signed lineage and `A→B→A` rejection.
5. **1:55–2:35:** Counterparty skill pays The Graph on Base; show Graph-derived reasoning, Base payment, then Arc parent settlement. Force Graph failure and show no Arc settlement.
6. **2:35–2:55:** If shipped, query the Arc Agent0 subgraph for the skill and hub-filtered settlement feedback.
7. **2:55–3:15:** Resolve ENSIP records; revoke price role and show update revert; tamper 402 `payTo` and show buyer refusal.
8. **3:15–3:25:** Mainnet config validation and September 16–30 runbook.

## Minimum credible prize entries

- **Arc:** working frontend/backend/diagram; real Arc EIP-3009 success and failure paths; bounded agent-to-agent hop; conditional settlement; configurable mainnet rail and runbook. Arc asks for programmable/multi-step USDC settlement and a functional MVP (`docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:459`; `docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:483`).
- **The Graph:** one live, paid Graph query that the product cannot complete without; meaningful structured interpretation; parent non-settlement on Graph failure; runnable `SKILL.md`/README and video. Those are explicit qualification requirements (`docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:172`).
- **ENS:** real ENSv2 Sepolia writes and reads; ENSIP-25/26 records; PermissionedResolver delegation; buyer-enforced `payTo` match; live revocation/tamper demo. Cosmetic naming does not qualify (`docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:766`; `docs/superpowers/research/ethonline-2026/prizes-page-2026-09-04.txt:770`).
