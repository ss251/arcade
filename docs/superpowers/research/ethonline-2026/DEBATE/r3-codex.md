# Codex — Final Build Brief: ARCADE, the bounded market for agent labor

**Final opinion:** submit **Arc + The Graph + ENS**. Lead with conditional settlement and bounded subcontracting: ARCADE verifies a buyer authorization, executes privately, validates output, then broadcasts settlement; failure produces no settlement transaction (`apps/hub/src/pipeline.ts:17-26,132-151`). The continuity baseline is commit `57183db`—112 pre-event commits ending August 7—not “a marketplace built this week” (`00-dossier.md:7,21-24`).

## 1. Ranked eight-day plan

| Day | Priority and deliverable | Exact files/packages | Acceptance test or observable | Fallback |
|---|---|---|---|---|
| **Sept 5** | **P0: authenticated lineage.** Add the hub-issued hiring capability, server-derived lineage, cycle/depth refusal, exact-input validation before payment verification, and schemas. Current `JobAssignment` cannot carry a parent capability and the paid path verifies before parsing input (`packages/core/src/protocol.ts:113-120`; `apps/hub/src/server.ts:791-828`). | `packages/core/src/{job,protocol,receipt}.ts`; `apps/hub/src/{server,pipeline}.ts`; `packages/runner/src/{daemon,hire-broker}.ts`; `packages/buyer/src/{fetch-with-payment,hire}.ts`; new `packages/core/test/lineage.test.ts`, `apps/hub/test/lineage.test.ts`. | `bunx vitest run packages/core/test/lineage.test.ts apps/hub/test/lineage.test.ts packages/runner/test/hire-broker.test.ts packages/buyer/test/fetch-with-payment.test.ts`; forged, expired and cross-hub capabilities refuse; `A→B→A` refuses before dispatch. | Drop receipt visualization, never authentication, cycle refusal or input validation. Ship depth one if deeper traversal causes trouble. |
| **Sept 6** | **P0: atomic tree budget and signed receipts.** Add durable reservations and a live two-sibling race test. The current runner increments spend only after an awaited purchase, so it is not a hub-wide concurrent invariant (`packages/runner/src/hire-broker.ts:162-202`). | `apps/hub/src/{store,store-sqlite,pipeline,ui}.ts`; `apps/hub/test/{store,lineage}.test.ts`; `apps/hub/test/store-sqlite.bun.test.ts`; new `scripts/e2e-lineage.sh`. | A root cap of `100000` atomic with two concurrent `60000` children accepts exactly one; restart preserves committed totals; the live receipt exposes two independently inspectable payer/recipient edges. | If the transactional ledger slips, retain authenticated lineage/cycle refusal but delete every “tree budget” claim and show only per-job runner caps. |
| **Sept 7** | **P0: Arc mainnet readiness.** Replace imported testnet constants with injected configuration and boot assertions; parameterize deployment and smoke scripts. Arc’s public mainnet is scheduled for September 16 and its current RPC page still publishes testnet parameters separately ([Arc announcement](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026), [RPC docs](https://docs.arc.io/arc/references/rpc-endpoints)). | New `packages/core/src/chain-config.ts`, `config/chains/{arc-testnet,arc-mainnet}.json`, `scripts/{chain-check,mainnet-smoke}.ts`; update `packages/core/src/chain.ts`, `packages/payments/src/{eip3009,gateway}.ts`, `packages/buyer/src/{mcp,cli}.ts`, `apps/hub/src/server.ts`, `apps/web/src/lib/{sign,wallet}.ts`, `scripts/deploy-splitter.ts`, `docs/mainnet-runbook.md`. | `bun run scripts/chain-check.ts --network arc-testnet`; `--network arc-mainnet` must refuse while `status:"pending"`. Then `bun run typecheck && bun run test && bun run web:build`; these are the repository’s canonical checks (`package.json:6-17`). | EIP-3009-only configuration; leave Gateway explicitly unavailable rather than inventing mainnet addresses. |
| **Sept 8** | **P1: Graph skill.** Build deterministic `agent-trust-brief`, paying The Graph on Base and synthesizing a decision rather than proxying GraphQL; Graph requires live, load-bearing data, meaningful processing and README/SKILL documentation (`prizes-page-2026-09-04.txt:171-175`). | New `skills/agent-trust-brief/{arcade.json,run.ts,SKILL.md,README.md,queries/agent.graphql,test/run.test.ts}`; root `package.json`, `bun.lock` for pinned `@graphprotocol/client-x402`. | Unit fixtures cover active/inactive, untrusted feedback and missing payment evidence; real Base invocation returns `source.subgraphId`, structured evidence and an x402 payment response. | Use the same pinned query through a Studio API key only for debugging; do not submit until the x402 paid path works. |
| **Sept 9** | **P1: make Graph failure load-bearing; prove third-party interoperability.** Inject DNS, unfunded-wallet, GraphQL-error and null-agent failures; then pay an ARCADE endpoint with Circle CLI. | `skills/agent-trust-brief/run.ts`; `apps/hub/test/pipeline.test.ts`; `scripts/e2e-graph-cogs.sh`; documentation only for Circle CLI. | Killing Graph access yields an Arc receipt with `settled:false`, no `settleTx`, and unchanged buyer USDC. Then: `circle services pay "$URL" --address "$WALLET" --chain ARC-TESTNET --max-amount 0.05 -X POST -d "$INPUT"`; this is Circle’s documented command shape ([Circle CLI](https://developers.circle.com/agent-stack/circle-cli/command-reference)). | Native `arcade-buy` recording if CLI wallet provisioning—not protocol parsing—blocks. Do not divert into Gateway. |
| **Sept 10** | **P2: ERC-8004 receipt publication.** Register one featured skill and publish best-effort settlement feedback. | New `apps/hub/src/erc8004.ts`, `scripts/erc8004-register.ts`; update `packages/core/src/manifest.ts`, `apps/hub/src/{server,pipeline,store-sqlite,ui}.ts`, `apps/web/src/components/sidebar.tsx`; relevant tests. | Arcscan shows `Registered`; after one settled job, `getLastIndex(agentId,attester)==1`; a failed job leaves it unchanged. The page labels it “ARCADE-attested settlement,” not “reputation.” | Keep registration and display; cut feedback automation before touching Graph or lineage. |
| **Sept 11** | **P2: ENSv2 functional payment authority.** Create one parent and two skill subnames; enforce ENS-resolved payment terms in native and web buyers. | New `packages/buyer/src/ens-policy.ts`, `scripts/{ens-setup,ens-demo}.ts`; update `packages/core/src/manifest.ts`, `packages/buyer/src/fetch-with-payment.ts`, `apps/web/src/routes/api.quote.ts`, `apps/web/src/components/confirm.tsx`; tests. | Resolve every record on Sepolia; delegated price update succeeds; after revocation it reverts; tampered 402 `payTo` is rejected before signing. | Compress to one subname while retaining delegation, revocation and `payTo` enforcement; cut ENSIP-25 only if ERC-8004 registration slipped. |
| **Sept 12** | **Packaging.** Freeze features by noon; run complete tests, rehearse, record, upload and submit a draft before sleeping. ETHGlobal requires a 2–4 minute, ≥720p, real-voice video and an explicit continuity split (`00-dossier.md:21-24`). | `README.md`, `docs/architecture.{md,excalidraw,png}`, `docs/mainnet-runbook.md`, `docs/ethonline-2026-build-log.md`, skill READMEs, video assets. | Clean-clone instructions succeed; all links and transaction hashes open; video is 2–4 minutes; partner selections are Arc, Graph and ENS. | Remove Arc-Agent0 footage, animations and secondary UI polish. Sept 13 morning is upload/link-repair buffer only. |

## 2. Resolved lineage wire and data design

The request header is:

```text
x-arcade-hire-capability: <base64url(payload)>.<base64url(hmac_sha256)>
```

Canonical payload:

```json
{
  "v": 1,
  "aud": "arcade-hire",
  "iss": "https://arcade-hub-production.up.railway.app",
  "parentJobId": "job_…",
  "expiresAtMs": 1789…,
  "nonce": "16-byte-hex"
}
```

The MAC is `HMAC(ARCADE_HUB_SECRET, "arcade-hire-v1:" + canonicalJSON(payload))`. It contains no client-asserted ancestors or remaining balance. `JobAssignment` gains exactly `hireCapability?: string`; the runner broker passes it on both probe and paid retry. This is separate from the buyer’s `job_token`, which currently protects result access (`apps/hub/src/server.ts:290-315,848-865`).

Jobs gain:

```text
rootJobId
parentJobId?
hop
ancestorSkillIds[]
maxDescendantSpendAtomic
```

Root: `rootJobId=id`, `hop=0`, empty ancestors. Child values are derived from the authenticated parent: `hop=parent.hop+1`, ancestors append `parent.skillId`. Refuse if the requested skill is already present or the resulting hop exceeds `ARCADE_MAX_HOPS=2`. Omitting the header creates an ordinary new root call; therefore the honest scope is **one hub and compliant ARCADE runner/broker**, not prevention of two parties voluntarily making unrelated purchases (`docs/architecture.md:72-84`).

The 402 advertises—but does not trust—this informational extension:

```json
{
  "extra": {
    "arcade": {
      "settlement": "on-validated-output",
      "lineage": {
        "rootJobId": "job_…",
        "parentJobId": "job_…",
        "nextHop": 1,
        "ancestorSkillIds": ["counterparty-brief"],
        "maxDescendantSpendAtomic": "20000",
        "remainingAtomic": "10000"
      }
    }
  }
}
```

SQLite gains `lineage_reservations(id,root_job_id,parent_job_id,child_job_id,amount_atomic,state,expires_at_ms)`, with `state ∈ {reserved,committed,released}`. On a child’s paid retry, one `BEGIN IMMEDIATE` transaction checks:

```text
SUM(reserved + committed) + childPrice <= root.maxDescendantSpendAtomic
```

then inserts `reserved`; settlement changes it to `committed`; every non-settling terminal outcome or expiry changes it to `released`. Committed rows never reopen. The runner’s existing per-job cap remains a second, local constraint (`packages/runner/src/hire-broker.ts:223-230`).

`Receipt` gains exactly:

```text
rootJobId, parentJobId?, hop, ancestorSkillIds[],
authorizationNonce, childJobIds[],
treeMaxSubSpendAtomic, treeReservedAtomic, treeCommittedAtomic,
hubAttester, hubSignature
```

`hubSignature` is EIP-191 over ordered canonical fields from `"arcade-receipt-v1"` through `reason` and `settleTx`. The attester key is `ARCADE_ATTESTER_KEY`, distinct from the settlement facilitator. Arcscan verifies each disclosed payer, recipient, amount, nonce and transaction success; the signature attests parentage. It does **not** prove completeness because the deployed splitter event contains no parent/root commitment (`contracts/FeeSplitter.sol:101-103,145-183`).

## 3. ERC-8004

The seller identity key—the same address that signs the runner Hello—calls `IdentityRegistry.register(agentURI)` once for `agent-trust-brief`; do this explicitly, never automatically on every runner start. Arc documents IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e` and ReputationRegistry `0x8004B663056A597Dffe9eCcC1965A193B7388713` on testnet ([Arc tutorial](https://docs.arc.io/arc/tutorials/register-your-first-ai-agent)).

`agentURI` is `/listings/agent-trust-brief/agent-registration.json`; it declares `active:true`, `x402Support:true`, the web service endpoint, ENS name and Arc registration. After a settled receipt is durable, `ARCADE_ATTESTER_KEY` calls:

```solidity
giveFeedback(
  agentId, 1, 0,
  "arcade-settled", skillId, endpoint,
  receiptURI, keccak256(feedbackJSON)
)
```

The feedback JSON includes `agentRegistry`, `agentId`, `clientAddress`, timestamp, value/tags and `proofOfPayment:{fromAddress,toAddress,chainId:"5042002",txHash}`—the standardized fields ([ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)). Failure is queued for retry and never reverses a successful settlement.

Display: registry/agent ID, owner, registration transaction and count filtered to this attester. **Not claimed:** quality score, generic Sybil resistance, buyer-authored review, escrow, validation-registry proof, or proof that advertised capabilities are safe; the ERC itself makes payments orthogonal and warns that registrations do not guarantee functional or non-malicious capabilities ([ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)).

## 4. The Graph and Arc-Agent0 gate

Use Base Agent0 subgraph ID `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`. Keep Base Sepolia ID `4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u` as a disabled fallback until its host returns a live 402 (`thegraph.md:117-132,224-229`). Production endpoint:

```text
https://gateway.thegraph.com/api/x402/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb
```

The Graph officially supports x402 USDC payment on Base and `@graphprotocol/client-x402` ([Graph x402 docs](https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/)). Pin this query:

```graphql
query AgentEvidence($id: ID!, $attester: Bytes!) {
  agent(id: $id) {
    id chainId agentId owner agentURI totalFeedback lastActivity
    registrationFile {
      name description active x402Support supportedTrusts
      mcpEndpoint mcpTools a2aEndpoint a2aSkills ens agentWallet
    }
    feedback(
      where: { clientAddress: $attester, isRevoked: false }
      first: 20
      orderBy: createdAt
      orderDirection: desc
    ) {
      score tag1 tag2 clientAddress createdAt
      feedbackFile {
        text skill task
        proofOfPaymentFromAddress proofOfPaymentToAddress
        proofOfPaymentChainId proofOfPaymentTxHash
      }
    }
  }
}
```

The skill produces identity consistency, advertised interfaces, trusted-attester settlement evidence, contradictions, missing evidence, warnings and `verdict: allow|manual-review|refuse`; it never averages global feedback. Any x402/payment/network/GraphQL/null/schema failure exits without schema-valid output, causing `shouldSettle=false`, so the Arc authorization is never broadcast (`packages/core/src/job.ts:95-135`; `apps/hub/src/pipeline.ts:132-151`).

`SKILL.md` contains install and secret setup, both IDs, the exact query, input/output examples, trust rules, Base-COGS/Arc-revenue explanation, fail-closed behavior, test command and live evidence links.

**Arc Agent0 stretch gate:** only after the Base path and failure test pass, spend at most four hours porting `agent0lab/subgraph` with Arc chain `5042002` and the three registry addresses. Success means Studio syncs and returns the featured Arc registration plus attester feedback; otherwise delete the experiment and do not mention it. Arc is Studio-subgraph-capable but not an x402 Graph gateway (`thegraph.md:9-16,191-197`).

## 5. ENSv2

Layout:

```text
arcade-ss251.eth
├── agent-trust.arcade-ss251.eth
└── usdc-flow.arcade-ss251.eth
```

Deploy one UserRegistry under the parent through the VerifiableFactory, then register both children; ENSv2’s hierarchy and `unregister(uint256 anyId)` semantics are documented in `ens.md:179-265`.

Parent records: `agent-context` and `agent-endpoint[web]`. Each child records `agent-context`, `agent-endpoint[web]`, `arcade.payTo`, `arcade.chain=eip155:5042002`, `arcade.asset=<USDC>`, and `arcade.priceAtomic`. The ERC-8004 child also sets `agent-registration[<ERC-7930 Arc IdentityRegistry>][<agentId>]="1"` as ENSIP-25 specifies ([ENSIP-25](https://docs.ens.domains/ensip/25/)); ENSIP-26 standardizes the context and endpoint keys ([ENSIP-26](https://docs.ens.domains/ensip/26/)).

The parent owner keeps registrar, resolver and unregister administration. The daemon receives only `authorizeTextRoles(dnsName,"arcade.priceAtomic",daemon,true)`; hub and buyer receive no roles. Per-key grant/revoke semantics are explicit in the [Permissioned Resolver docs](https://docs.ens.domains/ensv2/permissioned-resolver/).

Two demo beats: revoke price authority and show the daemon’s next `setText` revert; separately tamper 402 `payTo` and show buyer refusal before signing. Delisting calls `UserRegistry.unregister(labelhash(skill))`, removes the hub listing, and updates the ERC-8004 registration file to `active:false`.

## 6. Arc readiness and Circle decision

Configuration is:

```ts
interface ChainConfig {
  id: "arc-testnet" | "arc-mainnet"
  status: "ready" | "pending"
  chainId: number
  caip2: `eip155:${number}`
  rpcHttp: string[]
  explorerBaseUrl: string
  usdc: { address: `0x${string}`; decimals: 6; eip712Name: string; eip712Version: string }
  erc8004?: { identity: `0x${string}`; reputation: `0x${string}`; validation: `0x${string}` }
  gateway: null | { wallet: `0x${string}`; domain: number; facilitatorUrl: string; minValiditySeconds: number }
}
```

Boot refuses `pending`; probes `eth_chainId`, bytecode, USDC `name/version/decimals`, facilitator balance, and each announced FeeSplitter’s bytecode, seller, treasury and fee basis points. `docs/mainnet-runbook.md` covers discovering official parameters, updating the manifest, redeploying/verifying each seller’s immutable splitter, funding keys, canary failure/success calls, Circle CLI interoperability, rollback and evidence capture. Arc’s prize requires deployment or deployment-readiness by September 30 (`prizes-page-2026-09-04.txt:517-543`).

**Decision (opinion): Circle CLI wins; Gateway is cut.** CLI demonstrates standards interoperability against the judged EIP-3009 rail. Gateway remains testnet-specific, unproven here and unusable while mainnet configuration is unpublished; do not spend scarce time proving a second rail (`packages/payments/src/gateway.ts`; `r2-codex.md:80-84`).

## 7. Video and README

| Time | Script and screen |
|---|---|
| **0:00–0:15** | “ARCADE already sold self-hosted agent labor. This week adds bounded subcontracting, paid Graph intelligence and ENS-controlled payment identity.” Show baseline `57183db` and event commits. |
| **0:15–0:42** | Force invalid output. “The hub holds a valid authorization, but broadcasts only after valid work.” Show `settled:false`, unchanged balance, no Arcscan transaction. |
| **0:42–1:20** | Successful root and child. “Hop two spends the seller’s working-capital wallet—not the original buyer’s funds.” Open both Arc transactions, signed parent fields and totals; trigger `A→B→A` refusal. |
| **1:20–1:58** | Run `agent-trust-brief`. Show Base Agent0 query, x402 payment evidence, synthesis, then Arc settlement: “Labor settles on Arc; the seller buys facts on Base.” |
| **1:58–2:15** | Break Graph access. Show no schema-valid answer and no Arc settlement. |
| **2:15–2:35** | Show Arc ERC-8004 ID and one attester-filtered settlement. Say: “This is ARCADE settlement evidence, not a universal reputation score.” |
| **2:35–3:05** | ENS child resolves payment terms; delegated price update; revoke and show update failure; tamper `payTo` and show buyer refusal. |
| **3:05–3:25** | Circle CLI pays the unchanged x402 endpoint. |
| **3:25–3:40** | Show pending mainnet manifest, boot refusal and Sept 16–30 runbook. End: “Failed work has no settlement; subcontracting has a bounded, inspectable lineage.” |

README structure:

```text
## ETHOnline 2026 continuity declaration
### Pre-existing through 57183db
### New work, Sept 4–12
### Unchanged reused components
### AI assistance and committed planning artifacts
## What the product guarantees
## What it does not guarantee
## Arc integration and transaction evidence
## The Graph: Base COGS, query, failure semantics, SKILL.md
## ERC-8004: named-attester settlement evidence
## ENSv2: hierarchy, records, authority and delisting
## Reproduce locally / clean-clone commands
## Mainnet launch runbook, Sept 16–30
## Partner-prize eligibility matrix
```

## 8. Remaining disagreements

- Against Claude: registration should be explicit and limited to one featured skill, not repeated implicitly by `arcade start`, because ERC-721 registration is durable while runner starts are routine (`r1-claude.md:23-27`); **confidence 0.88**.
- Against Claude: Circle CLI interoperability is higher-value than a Gateway proof because the judged mainnet path cannot currently depend on unpublished Gateway parameters (`r2-claude.md:12,43`; `r2-codex.md:82`); **confidence 0.79**.
- Against Grok: exact-input validation belongs before `rail.verify`, not as an optional after-verify add-on, because the current ordering accepts malformed input only after verifying an authorization (`r2-grok.md:96`; `apps/hub/src/server.ts:791-808`); **confidence 0.96**.
- Against both: the Arc Agent0 smoke belongs after the Base Graph prize path is green, not on day one, because a four-hour speculative deployment must not interrupt the only load-bearing Graph integration (`r2-claude.md:39`; `r2-grok.md:90`; `r2-codex.md:76`); **confidence 0.86**.
