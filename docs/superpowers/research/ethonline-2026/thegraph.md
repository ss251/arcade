# The Graph — ETHOnline 2026 research for ARCADE

Researched 2026-09-04. Every claim carries a source URL. Nothing from memory.

---

## 0. Headline findings (the two that change the plan)

1. **Arc IS in The Graph's networks registry — mainnet AND testnet.** `arc-testnet`, `caip2Id: "eip155:5042002"`, alias `evm-5042002`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`, `nativeToken: "USDC"`, deploy service `https://api.studio.thegraph.com/deploy`.
   Source: `https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json` (registry version `0.7.118`, `updatedAt 2026-09-02T18:38:14.348Z`) — this JSON is what `https://thegraph.com/docs/en/supported-networks/` renders.
   Caveats from the same record: `issuanceRewards: false`, and `services` contains **only** `subgraphs` — **no `substreams`, no `firehose`, no `sps`, no `tokenApi`**. Compare `base`, which lists `sps`, `firehose`, `substreams`, `tokenApi` and `issuanceRewards: true`. So: Arc subgraphs are **Subgraph Studio–deployable and Studio-queryable**, but not publishable to the decentralized network for indexer rewards, and **Substreams on Arc is not available**.

2. **The Graph's x402 gateway is Base-only.** Mainnet `https://gateway.thegraph.com/api/x402` pays USDC on **Base**; testnet `https://testnet.gateway.thegraph.com/api/x402` pays USDC on **Base Sepolia**. **No Arc option.**
   Source: `https://github.com/graphprotocol/docs/blob/main/website/src/pages/en/subgraphs/tooling/x402-payments.mdx` (fetched raw via `gh api`).

Consequence for ARCADE: a payment chain is still real, but it is **cross-chain**: buyer → seller in USDC on **Arc** (ARCADE's rail), seller → The Graph in USDC on **Base Sepolia** (x402). That is a legitimate and demoable "agent pays for its own inputs" story, and it is honest about which chain each leg settles on.

---

## 1. Subgraph MCP

### What it is
"A Model Context Protocol (MCP) server that allows LLMs to interact with Subgraphs available on The Graph Network."
Source: `https://github.com/graphops/subgraph-mcp` README (repo: `graphops/subgraph-mcp`, Rust, last push `2025-06-24T18:20:09Z` per `gh api repos/graphops/subgraph-mcp`).
Docs landing: `https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/` — "Subgraph MCP server is an open-source implementation of Anthropic's Model Context Protocol". Supports Claude, Cline, Cursor.
(Note: the older path `https://thegraph.com/docs/en/ai-suite/subgraph-mcp/introduction/`, linked from the hackathon-resources blog post, now 404s. Use the `subgraphs/tooling/` path.)

### How to connect (remote hosted — recommended)
From the README:
```json
{
  "mcpServers": {
    "subgraph-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "--header", "Authorization:${AUTH_HEADER}",
               "https://subgraphs.mcp.thegraph.com/sse"],
      "env": { "AUTH_HEADER": "Bearer YOUR_GATEWAY_API_KEY" }
    }
  }
}
```
Endpoint: `https://subgraphs.mcp.thegraph.com/sse`. **Auth: a Gateway API key from Subgraph Studio (`https://thegraph.com/studio`), sent as `Authorization: Bearer <key>`.** Local mode: clone + `cargo build --release`, env `GATEWAY_API_KEY`, optional `SUBGRAPH_REQUEST_TIMEOUT_SECONDS` (default 120s). Runs STDIO or SSE. Prometheus metrics on `/metrics`, default port `9091`.
Source: `https://github.com/graphops/subgraph-mcp/blob/main/README.md`.

### Tools exposed (verbatim names, from the README "Available Tools")
- `search_subgraphs_by_keyword`
- `get_deployment_30day_query_counts`
- `get_schema_by_deployment_id`
- `get_schema_by_subgraph_id`
- `get_schema_by_ipfs_hash`
- `execute_query_by_deployment_id`
- `execute_query_by_subgraph_id`
- `execute_query_by_ipfs_hash`
- `get_top_subgraph_deployments`

Also exposes MCP **prompts** for most tools, and one **resource** `graphql://subgraph` = "Subgraph Server Instructions" (a mandated workflow: keyword search → **mandatory** 30-day query-volume check → schema → query). The README warns Claude Desktop may not auto-load the resource; add it to context manually.
Source: same README.

### x402 pay-per-query for The Graph — exact mechanics
From `website/src/pages/en/subgraphs/tooling/x402-payments.mdx` (graphprotocol/docs):
- Endpoints: `POST /api/x402/subgraphs/id/{subgraph_id}` and `POST /api/x402/deployments/id/{deployment_id}`.
- Flow, quoted: "1. The client sends a GraphQL query to an `/api/x402/...` endpoint. 2. The Gateway responds with `402 Payment Required` and payment requirements (amount, network, asset, recipient). 3. The client signs a USDC payment payload and retries the request with the payment header. 4. The Gateway verifies the payment via a facilitator and returns the query result."
- Networks/tokens:
  | Environment | Base URL | Payment Network | USDC |
  |---|---|---|---|
  | Mainnet | `https://gateway.thegraph.com` | Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
  | Testnet | `https://testnet.gateway.thegraph.com` | Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
- "No API keys, accounts, or sessions: payment and access happen in a single HTTP round trip"; "Compatible with any x402 client, with first-class support via `@graphprotocol/client-x402`".
- The docs say the gateway "verifies the payment via a facilitator" but **do not name the facilitator or state a per-query price.** A third-party news write-up claims "$0.01 USDC on Base per query" (`https://www.cryptowisser.com/news/the-graph-gateway-now-accepts-x402-payments`) — treat as unverified; read the actual 402 body at runtime.

**SDK:** `@graphprotocol/client-x402` v1.0.0, "x402 payment protocol support for graph-client", published `2026-08-31T21:57:47Z`, deps `viem ^2.39.3`, `@x402/evm ^2.8.0`, `@x402/fetch ^2.8.0`. Repo `https://github.com/graphprotocol/graph-client` (package README at `packages/x402/README.md`). Source: `npm view @graphprotocol/client-x402`.

Three usage modes (README + docs):
```bash
export X402_PRIVATE_KEY=0xabc123...
npx @graphprotocol/client-x402 "{ pairs(first: 5) { id } }" \
  --endpoint https://gateway.thegraph.com/api/x402/subgraphs/id/<SUBGRAPH_ID> --chain base
```
```ts
import { createGraphQuery } from '@graphprotocol/client-x402'
const query = createGraphQuery({ endpoint: '.../api/x402/subgraphs/id/<ID>', chain: 'base' })
const result = await query('{ pairs(first: 5) { id } }')
```
Plus a typed-SDK mode via `.graphclientrc.yml` `customFetch: '@graphprotocol/client-x402'`. Env: `X402_PRIVATE_KEY`, `X402_CHAIN` (`base` | `base-sepolia`).

**Is there an x402 gateway on Arc?** No. Only `base` and `base-sepolia` are documented or accepted by the client (`X402_CHAIN`: "`base` (default) or `base-sepolia`"). **USDC on Arc is not supported by The Graph's x402 gateway.**

**Background/settlement:** The Graph's own explainer says agents' x402 payments to a gateway settle downstream to Indexers via **GraphTally** vouchers — `https://thegraph.com/blog/graphtally-micropayments-machine-economy/` and `https://thegraph.com/blog/understanding-x402-erc8004/`.

---

## 2. The two SKILL repos

### `graphprotocol/subgraphs-skills`
- `https://github.com/graphprotocol/subgraphs-skills` — "AI agent skills for developing, testing, and optimizing subgraphs with The Graph protocol". Not archived. `pushedAt 2026-08-08T01:19:46Z`; **latest commit on default branch `2026-04-09T21:02:06Z`** ("Rename project title…"). Source: `gh api repos/graphprotocol/subgraphs-skills` + `/commits`.
- Top level: `.claude-plugin/`, `bin/`, `examples/`, `openclaw/`, `scripts/`, `skills/`, `package.json`, `README.md`.
- Three skills under `skills/`: **`subgraph-dev`**, **`subgraph-optimization`**, **`subgraph-testing`**. Each is `SKILL.md` + `references/`. Dual-published in Claude Code plugin format (`skills/`) and OpenClaw format (`openclaw/`).
- `skills/subgraph-dev/SKILL.md` frontmatter (verbatim head): `name: subgraph-dev`, `version: 1.0.0`, description triggering on "develop, build, or create a subgraph… schema design, mapping handlers, subgraph.yaml manifests, AssemblyScript…". References: `schema-types.md`, `assemblyscript-api.md`, `subgraph-composition.md`, `subgraph-uncrashable.md`, `patterns.md`. `subgraph-optimization` → `performance-benchmarks.md` (pruning/indexerHints, `@derivedFrom`, immutable entities, Bytes as IDs, avoiding eth_calls, timeseries, grafting). `subgraph-testing` → `matchstick-api.md`, `subgraph-linter.md`, `common-errors.md`.
- Install: `claude plugins add PaulieB14/subgraphs-skills` (note the README's own install line points at the `PaulieB14` fork/origin).

### `streamingfast/substreams-skills`
- `https://github.com/streamingfast/substreams-skills` — "A collection of AI agent skills … for developing, testing, and deploying Substreams applications across any blockchain network." Not archived. `pushedAt 2026-08-17T19:50:28Z`; latest commit `2026-08-17T19:49:59Z` ("Preparing release of 1.6.0"). Source: `gh api repos/streamingfast/substreams-skills` + `/commits`.
- Top level includes `skills/`, `guides/`, `examples/`, `EVAL.md`, `SKILL_DEVELOPMENT.md`, `CHANGELOG.md`, `.claude-plugin/`.
- Skills (`skills/`): `substreams-dev`, `substreams-ethereum`, `substreams-solana`, `substreams-bitcoin`, `substreams-sql`, `substreams-sink`, `substreams-sink-deploy-local`, `substreams-hosted-sink`, `substreams-convert`, `substreams-testing`, **`thegraph-market-api`**.
- Notable: `thegraph-market-api` runs the **OAuth 2.0 Device Authorization Grant (RFC 8628)** against the StreamingFast Portal / The Graph Market to answer billing/usage questions and drive the full hosted-deployment lifecycle (`GetOrganizationSubscription`, `GetBillingDetails`, `GetUsageBilling`, `MultiServiceUsageSummaryByOrganization`, `UsageByOrganization`, `ActiveConnections`, plus `HostedService` deploy/scale/undeploy/reset).
- Install: `claude plugin marketplace add streamingfast/substreams-skills` then `claude plugin install substreams-dev@streamingfast-substreams`.
- These are the repos behind the prize's "Substreams SKILLs one-prompt deployment" featured idea.

---

## 3. Agent0 / ERC-8004

**ERC-8004 "Trustless Agents"** — `https://eips.ethereum.org/EIPS/eip-8004`. Standards Track, **Draft**. Three registries: **Identity** (ERC-721 + URIStorage; portable agent id resolving to a registration file of capabilities/endpoints), **Reputation** (post/fetch feedback signals, on-chain scores for composability), **Validation** (hooks for stake-secured re-execution, ZK proofs, TEE oracles). Functions incl. `register()`, `giveFeedback()`, `validationRequest()`, `getSummary()`; events `Registered`, `NewFeedback`, `ValidationRequest`, `ValidationResponse`. "Expected to be deployed with singletons per chain" — **no canonical addresses in the EIP**.

**Agent0 Subgraphs** — `https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/` (raw: `graphprotocol/docs` → `website/src/pages/en/subgraphs/existing-subgraphs/agent0.mdx`). "Built and maintained by [Agent0](https://sdk.ag0.xyz/docs) in partnership with The Graph." Open-source public good: `https://github.com/agent0lab/subgraph`.

Deployed (subgraph IDs, query as `https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>`):

| Network | Chain ID | Subgraph ID |
|---|---|---|
| Ethereum | 1 | `FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k` |
| Base | 8453 | `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb` |
| BSC | 56 | `D6aWqowLkWqBgcqmpNKXuNikPkob24ADXCciiP8Hvn1K` |
| Polygon | 137 | `9q16PZv1JudvtnCAf44cBoxg82yK9SSsFvrjCY9xnneF` |
| Monad | 143 | `4tvLxkczjhSaMiqRrCV1EyheYHyJ7Ad8jub1UUyukBjg` |
| Ethereum Sepolia | 11155111 | `6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT` |
| **Base Sepolia** | 84532 | `4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u` |
| BSC Chapel | 97 | `BTjind17gmRZ6YhT9peaCM13SvWuqztsmqyfjpntbg3Z` |
| Monad Testnet | 10143 | `8iiMH9sj471jbp7AwUuuyBXvPJqCEsobuHBeUEKQSxhU` |

Not deployed: Polygon Amoy (80002), Linea Sepolia (59141), Hedera Testnet (296), HyperEVM Testnet (998), SKALE Base Sepolia (1351057110). **Arc is not among them.**
"A single GraphQL schema is shared across all available deployments, so the same query works on every chain — only the endpoint URL changes."

**Entities / what's indexed** (from the same page): `Agent`, `AgentRegistrationFile`, `Feedback` + `FeedbackFile`, `Validation`, `protocolAgentStats`, `Protocol`. Fields that matter to ARCADE: registration file carries **`mcpEndpoint`, `mcpVersion`, `mcpTools`, `mcpPrompts`, `mcpResources`, `a2aEndpoint`, `a2aSkills`, OASF tags, `supportedTrusts`, `x402Support`, `ens`, `did`, agent wallet**; feedback carries score 0–100, tags, `clientAddress`, off-chain file (text, capability, skill, task, **proof of payment**), revocation + responses; validation carries validator, request/response URIs, score, status. Off-chain IPFS/HTTPS files are pulled in via **File Data Sources**, so JSON metadata is queryable inline. Agent ids are `"<chainId>:<agentId>"` (docs example `"8453:0"`).

Sample query from the docs:
```graphql
query GetMCPAgents {
  agentRegistrationFiles(where: { mcpEndpoint_not: null, active: true }, first: 100) {
    agentId name description mcpEndpoint mcpVersion mcpTools supportedTrusts
  }
}
```
Agent0 SDK (`https://sdk.ag0.xyz/docs`) wires these endpoints by default: `sdk.searchAgents(...)`, `sdk.searchFeedback(...)`.

**Is Arc indexed by The Graph?** Yes for subgraphs (see §0), no for Substreams/Firehose, and no Agent0/ERC-8004 deployment on Arc.

---

## 4. The Graph Market / Substreams

- `https://thegraph.market/` — built by StreamingFast; access to raw blockchain data across 90+ networks. Products: **Substreams** ("a gRPC based parallel streaming engine designed for fast, reliable, and scalable data indexing", 71 networks), **Firehose** (71 networks), **Token API** (by Pinax), **Subgraphs**. Free tier: "7M blocks & 5 GiB egress included — no credit card required." Access via **API key** from signup.
- **No x402 / pay-per-query on The Graph Market.** Its auth is an API key (streaming) plus the OAuth device-code Portal admin flow documented in `streamingfast/substreams-skills/skills/thegraph-market-api`. x402 pay-per-query exists only on the **Subgraph Gateway** (`/api/x402/...`), per §1.
- Streaming path: `substreams run`/`gui` against an endpoint + auth token (`substreams auth`); `https://docs.substreams.dev/getting-started`; module hub `https://substreams.dev/`.
- Composable Substreams for the second prize: `https://github.com/streamingfast/substreams-chain-modules`, `https://github.com/pinax-network/substreams-evm`.
- **Arc has no Substreams/Firehose endpoint** (registry, §0) — any Substreams work would be on another chain (e.g. Base), not Arc.

---

## 5. Prize rules and what qualifies

From `https://thegraph.com/blog/hackathon-resources/`: ETHOnline 2026, Sept 4–16 2026, $15,000 across two Graph tracks; Track 1 "Best AI Project" covers both tooling for AI environments and agents/apps using The Graph as live data; Track 2 "Best use of standardized schemas and reusable Substreams packages". Submission: public repo + 2–4 minute demo video + select The Graph as partner prize. The prize text supplied by the organizer additionally requires: Graph **load-bearing**; **live** data from a Graph provider (Studio API key, or The Graph Market for Substreams); meaningful work with the data; open-source with README/SKILL.md; pre-existing work documented.

Standardized subgraphs (Track 2): `https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/` — Messari's "open, reusable GraphQL schemas that normalize on-chain data across every protocol of the same type". Schemas: Generic 3.0.0, DEX AMM 1.3.2, DEX AMM Extended 4.0.1, Lending/CDP 3.1.0, Yield Aggregator 1.3.1, NFT Marketplace 2.1.0, Derivatives Perps 1.3.4, Derivatives Options 1.3.2, Bridge 1.2.0, Network 1.2.0. Repo `https://github.com/messari/subgraphs`, schema doc `https://github.com/messari/subgraphs/blob/master/docs/SCHEMA.md`.

---

## 6. Assessment of the three ideas

### (a) ARCADE seller skill wrapping The Graph — buyer→seller (Arc USDC) → seller→Graph (x402 Base Sepolia)
**Verdict: strongest fit. Build this.**
- Hits both halves of Track 1: it is *tooling* (a packaged, open-source ARCADE SKILL that any buyer agent can hire) **and** an *agent using The Graph as its live data source*.
- "Let your agent pay per query autonomously with x402" is literally in the prize text; this is the only idea that does that end-to-end.
- Load-bearing: the skill has no product without subgraph data. Live data: real gateway queries. Meaningful work: e.g. wallet due-diligence / token-flow synthesis, not a raw passthrough — **do not just proxy GraphQL**, the answer must be a synthesized report, otherwise "meaningful work with the data" is weak.
- Mechanics: `@graphprotocol/client-x402` v1.0.0 with `X402_CHAIN=base-sepolia` against `https://testnet.gateway.thegraph.com/api/x402/subgraphs/id/<ID>` (docs §1). Seller's Graph-payer key is a *second* key, funded with Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
- **Risks / constraints to respect:**
  - Cross-chain: the two legs are on different chains (Arc 5042002 vs Base Sepolia 84532). Present this as a feature ("the seller's cost of goods is denominated on the chain its supplier settles on"), not a bug. Do not claim Graph x402 runs on Arc — it does not.
  - ARCADE's CLAUDE.md rule 5 ("settle only on success") interacts badly with a paid upstream: the seller can pay The Graph and *then* fail its own schema check, eating the cost. Budget for that; it's a good talking point, not a blocker.
  - `X402_PRIVATE_KEY` is a raw private key in env — conflicts with the repo's Keychain rule. Read it inside the process from Keychain, never `.env`.
  - Verify at runtime that the testnet x402 gateway actually serves a 402 with a facilitator (docs don't name price or facilitator). Test early — this is the single highest-risk unknown.
  - Also mount the **Subgraph MCP** (`https://subgraphs.mcp.thegraph.com/sse`, Bearer Studio key) inside the seller's engine for *discovery* (`search_subgraphs_by_keyword` → `get_deployment_30day_query_counts` → `get_schema_by_subgraph_id`), then execute the paid query over x402. Discovery via API key + execution via x402 is a clean, defensible split and exercises both of The Graph's AI surfaces.

### (b) ARCADE reads ERC-8004 reputation from the Agent0 subgraph
**Verdict: excellent, cheap, high-signal complement. Do this too.**
- The Agent0 schema is uncannily aligned with ARCADE: `mcpEndpoint`, `mcpTools`, `a2aSkills`, `supportedTrusts`, **`x402Support`**, agent wallet, and feedback whose off-chain file includes **proof of payment**. Displaying seller reputation, and (better) *writing* ARCADE settlement outcomes back as ERC-8004 feedback, makes the marketplace part of the trustless-agent standard rather than a silo.
- Live data: yes, gateway queries against Base Sepolia `4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u` or Base mainnet `43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`.
- **Load-bearing test is the weak point**: a reputation badge in `apps/web` can be dismissed as decorative. Make it *gate a decision* — e.g. the buyer SDK refuses (or price-caps) a seller whose ERC-8004 aggregate score is below a threshold or who lacks `x402Support`. Then The Graph is load-bearing in the payment path, not the UI.
- Also qualifies for the **second $5,000 prize** (Agent0/ERC-8004 subgraphs are explicitly named as a composable/standardized Graph product). Two prizes, one integration.
- Cost to register ARCADE sellers as ERC-8004 agents: registration happens on a chain where the registries exist (Base Sepolia), not Arc. Scope carefully — registering agents is a separate contract interaction; reading is free.

### (c) Publish ARCADE's own marketplace events as a subgraph on Arc
**Verdict: feasible — more feasible than assumed — but do it third, and only via Studio.**
- The blocker you expected is gone: `arc-testnet` (`eip155:5042002`) is in the networks registry with `services.subgraphs: ["https://api.studio.thegraph.com/deploy"]`, so `graph deploy --network arc-testnet` to Subgraph Studio should work.
- Limits, from the same record: `issuanceRewards: false` and no `substreams`/`firehose` — you get a **Studio-hosted dev subgraph with a Studio query URL and rate limits**, not a decentralized-network publish, and therefore **no x402 endpoint for it** (the `/api/x402/subgraphs/id/...` path serves network-published subgraphs on `gateway.thegraph.com`). So ARCADE's own subgraph cannot itself be sold per-query over Graph x402.
- ARCADE must emit events worth indexing. If settlement is EIP-3009 `transferWithAuthorization` on the USDC precompile `0x3600...0000` with no ARCADE contract, there is little ARCADE-specific to index — you'd be indexing USDC transfers. `FeeSplitter.sol` shipping (per the repo layout) would change that. **Check whether ARCADE has an on-chain event surface before committing.**
- Value if it works: a live "ARCADE marketplace analytics" subgraph on Arc — per-skill revenue, agent-hires-agent payment graphs — is a genuinely novel demo (Arc + The Graph, likely first). Strong narrative, medium effort, and it makes The Graph load-bearing for the marketplace's own analytics.
- Verify early: deploy a trivial subgraph to `arc-testnet` on day 1. If Studio rejects the network despite the registry entry, drop this and lean on (a) + (b).

### Recommended shape
(a) as the centerpiece + (b) as the gating integration (also enters prize #2) + (c) as a stretch, validated by a day-1 deploy smoke test. Ship one repo, open-source, with a real `SKILL.md` for the Graph-backed seller skill (the prize explicitly wants SKILL.md), a README documenting ARCADE as **pre-existing work** and naming exactly what was built during the hackathon, and a 2–4 min video showing: buyer pays seller on Arc → seller pays The Graph over x402 on Base Sepolia → report returns → seller's ERC-8004 reputation updates.

---

## Source index
- Networks registry (authoritative supported-networks data): https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json
- Supported networks page: https://thegraph.com/docs/en/supported-networks/
- Subgraph MCP intro: https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/
- Subgraph MCP source + README: https://github.com/graphops/subgraph-mcp
- x402 payments docs: https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/ · raw https://github.com/graphprotocol/docs/blob/main/website/src/pages/en/subgraphs/tooling/x402-payments.mdx
- x402 client package: https://www.npmjs.com/package/@graphprotocol/client-x402 · https://github.com/graphprotocol/graph-client/blob/main/packages/x402/README.md
- x402 + ERC-8004 explainer: https://thegraph.com/blog/understanding-x402-erc8004/
- GraphTally: https://thegraph.com/blog/graphtally-micropayments-machine-economy/
- Hackathon resources: https://thegraph.com/blog/hackathon-resources/
- subgraphs-skills: https://github.com/graphprotocol/subgraphs-skills
- substreams-skills: https://github.com/streamingfast/substreams-skills
- Agent0 subgraphs: https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/ · https://github.com/agent0lab/subgraph · https://sdk.ag0.xyz/docs
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
- Standardized subgraphs: https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/ · https://github.com/messari/subgraphs
- The Graph Market: https://thegraph.market/
- Composable Substreams: https://github.com/streamingfast/substreams-chain-modules · https://github.com/pinax-network/substreams-evm

---

## 7. Live probe 2026-09-04 02:56 UTC (conductor, curl)

- `POST https://gateway.thegraph.com/api/x402/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb` → **HTTP 402**, header `payment-required` (base64 JSON):
  `{"x402Version":2,"accepts":[{"scheme":"exact","network":"eip155:8453","amount":"10000","payTo":"0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB","maxTimeoutSeconds":300,"asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","extra":{"assetTransferMethod":"eip3009","name":"USD Coin","version":"2"}}]}`
  → price is **10000 atomic = $0.01 USDC on Base mainnet**, EIP-3009, x402 v2. Same wire shape ARCADE already speaks.
- `testnet.gateway.thegraph.com` → **DNS does not resolve** (system resolver and 1.1.1.1). The documented Base Sepolia testnet path is not reachable today. Plan for Base mainnet USDC (cents) for the seller→Graph hop, and re-probe daily.
