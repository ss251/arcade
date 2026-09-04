# ARC / Circle research for ETHOnline 2026 (Continuity track) — ARCADE

Compiled 2026-09-04. Every claim carries a URL. Nothing from memory.

---

## 0. Prize wording (ETHGlobal ETHOnline 2026)

Source: https://ethglobal.com/events/ethonline2026/prizes

- **Best DeFi or Agentic Application (Continuity) — $1,666.** For *existing* projects adding Arc
  integration; must "show substantive new work" beyond prototyping. Deliverables: functional MVP,
  demo video, GitHub repo, Continuity Track registration.
- **Launch on Arc Testnet & Push to Mainnet (Continuity) — $1,500.** For teams extending existing
  projects with Arc integration. Non-continuity sibling prize ($3,500, 1st $2,500 / 2nd $1,000)
  states the project must be "deployment-ready by September 30".
- Resources named on the prize page: Arc Docs (https://docs.arc.io/), App Kit
  (https://docs.arc.io/app-kit), Circle Dev Docs (https://developers.circle.com/), Agent Stack
  Starter Kits (https://github.com/circlefin/agent-stack-starter-kits).

> Note: the prize page also lists non-Continuity Arc prizes ("Best Agentic Economy Application with
> Circle Agent Stack — $1,667") whose criteria (working frontend/backend, architecture diagram,
> demo video) read as the same rubric ARCADE should target.

---

## 1. Circle Agent Stack

**Definition.** https://developers.circle.com/agent-stack — "Wallets, nanopayments, and a service
marketplace for AI agents." Five components (all listed in https://developers.circle.com/llms.txt):

| Component | Doc | One-line |
|---|---|---|
| Circle CLI | https://developers.circle.com/agent-stack/circle-cli | "Terminal and agent interface for wallets and payments" |
| Agent Wallets | https://developers.circle.com/agent-stack/agent-wallets | "Programmatic USDC wallets for agents" |
| Agent Nanopayments | https://developers.circle.com/agent-stack/agent-nanopayments | "Pay per request with gasless USDC" |
| Agent Marketplace | https://developers.circle.com/agent-stack/agent-marketplace | "Curated catalog of 600+ x402 services that accept USDC" |
| Circle Skills | https://developers.circle.com/ai/skills · repo https://github.com/circlefin/skills | open-source agent skills |

Launch history (https://developers.circle.com/release-notes/agent-stack-2026):
- **2026.05.11** — Agent Stack product line debuts.
- **2026.05.12** — Agent Nanopayments docs.
- **2026.07.31** — **Agent Marketplace debuts**: curated catalog of x402 services accepting USDC,
  with a *public Discovery API* for agents and a path for API owners to list and get paid per call.
- **2026.08.13** — **Circle CLI 1.0.0**; Eco deposit command now uses "quoted, single-use deposit
  vaults"; version-compatibility checks added.
- No September 2026 entries as of 2026-09-04.

Press: https://www.circle.com/pressroom/circle-launches-ai-infrastructure-to-power-the-agentic-economy
(Agent Stack launch, initial products = Circle CLI, Agent Wallets, Agent Marketplace, Nanopayments;
live at https://agents.circle.com).

### 1a. `circlefin/agent-stack-starter-kits`

Repo: https://github.com/circlefin/agent-stack-starter-kits — default branch **`master`**,
26 stars, description "Runnable examples integrating Circle Agent Stack with LangChain, Claude Agent
SDK, OpenAI Agents SDK, Vercel AI SDK and Google ADK."

Commit history (`gh api repos/circlefin/agent-stack-starter-kits/commits`), only four commits:

| Date | SHA | Message |
|---|---|---|
| 2026-08-28T17:59:26Z | `3996330` | Enhance project with licensing, payment fixes, and user interaction improvements (#5) |
| 2026-07-07T21:37:55Z | `fb4f4c7` | Add Apache 2.0 License and copyright notices (#3) |
| 2026-07-02T21:47:18Z | `6a04ec5` | Initial commit (#1) |
| 2026-06-11T21:21:34Z | `3ad8627` | Initial commit |

**Last push 2026-08-28.** Directory tree (`gh api .../git/trees/master?recursive=1`):

```
kits/claude-agent-sdk   kits/google-adk   kits/langchain
kits/mastra             kits/openai-agents kits/vercel-ai
packages/kit-core  packages/circle-tools  packages/agent-cli
```
Root: `README.md`, `SECURITY.md`, `LICENSE`, `bun.lock`, `bunfig.toml`, `tsconfig.base.json`,
`demo.gif`.

**What each starter does** (README, https://github.com/circlefin/agent-stack-starter-kits#kits) —
all six are the *same* demo in a different framework: an Ink terminal chat where the agent is given
a shell + file reader + grep, installs Circle's skills from
https://agents.circle.com/skills/setup.md into `~/.agents/skills`, then bootstraps a wallet and pays
for a Marketplace service. They differ only in where the human approval gate lives:

| Kit | Framework | Approval hook |
|---|---|---|
| `kits/langchain` | LangChain Deep Agents | `interruptOn` (per-tool) |
| `kits/claude-agent-sdk` | Claude Agent SDK | `canUseTool`; tools are the SDK's own `Bash/Read/Grep/Glob` (no `tools.ts`) |
| `kits/mastra` | Mastra | in-tool; adds `workflow.ts` |
| `kits/openai-agents` | OpenAI Agents SDK | `needsApproval` as a function of the command |
| `kits/vercel-ai` | Vercel AI SDK | in-tool; adds `retry.ts` (two-provider fallback) |
| `kits/google-adk` | Google ADK | `beforeToolCallback` |

Shared packages: `packages/kit-core` (tool bodies, shell, approval gate at
`packages/kit-core/src/approval.ts`, skill discovery, theme), `packages/circle-tools` (CLI wrappers:
`auth.ts`, `chains.ts`, `cli.ts`, `gateway.ts`, `services.ts`, `wallet.ts`), `packages/agent-cli`
(Ink chat UI + retry).

Gated commands (README, "A gate on the command, not the tool"): `services pay`, `wallet transfer`,
`bridge transfer`, `gateway deposit`, `wallet sign`, and spending-cap changes.

Prereqs: Node 22.15+, Bun 1.2+, `bun add -g @circle-fin/cli`. Legal disclaimer at README bottom:
"intended for **Arc testnet use only**, and not production-ready."

### 1b. The `circle` CLI agent wallet

- Package `@circle-fin/cli`, **latest 1.0.0, published 2026-08-13T18:58:39Z**
  (`https://registry.npmjs.org/@circle-fin/cli`).
- Command groups (https://developers.circle.com/agent-stack/circle-cli/command-reference):
  `wallet`, `services`, `gateway`, `bridge`, `blockchain`, `transaction`, `contract`, `skill`,
  `terms`, `telemetry`.
- What the wallet *is* (https://developers.circle.com/agent-stack/agent-wallets): built on
  **Circle user-controlled wallets** with **2-of-2 MPC**; "key shares are never exposed to the
  agent. The user retains custody, and Circle cannot unilaterally move funds without their
  involvement. All transfers are screened against sanctions controls before submission onchain."
- Policies: transfer limits, recipient allowlists, contract blocklists, per wallet —
  https://developers.circle.com/agent-stack/agent-wallets/wallet-operations/custom-policies
- **Supported chains** (https://developers.circle.com/agent-stack/agent-wallets/supported-blockchains):
  Arbitrum, **Arc Testnet (`ARC-TESTNET`, testnet only — no mainnet identifier)**, Avalanche, Base,
  Ethereum, Monad, Optimism, Polygon PoS, Unichain. Verbatim: "Agent Wallets support the following
  blockchains on both mainnet and testnet, **except Arc Testnet (testnet only)**."
- Non-interactive auth path for agents:
  https://developers.circle.com/agent-stack/agent-wallets/wallet-operations/authenticate#non-interactive-scripts-and-ai-agents

**Relation to ARCADE:** the CLI agent wallet is the *buyer* identity Circle expects. ARCADE's buyer
SDK is a competing/complementary rail; wiring `circle wallet` / `circle services pay` as an
alternate ARCADE buyer would put ARCADE directly on the Agent Stack surface the prize names.

---

## 2. Nanopayments

**What it is** (https://developers.circle.com/gateway/nanopayments): "gas-free USDC nanopayments
down to $0.000001, powered by Circle Gateway batched settlement." Flow, verbatim from that page:

1. Buyer deposits USDC into a Gateway Wallet contract (one-time onchain tx).
2. Buyer requests a paid resource.
3. Seller responds `402 Payment Required`.
4. Buyer signs an **EIP-3009 payment authorization** (offchain, zero gas).
5. Buyer retries with the signed authorization.
6. Seller verifies and serves immediately.
7. Gateway settles in batches onchain, crediting the seller's Gateway balance.

**x402 compatibility — yes, explicitly.**
https://developers.circle.com/gateway/nanopayments/concepts/x402: "Nanopayments uses the `exact`
scheme with a custom EIP-3009 `TransferWithAuthorization` signature against the
**`GatewayWalletBatched`** domain, enabling gasless payments from the buyer's Gateway balance."

**SDK.** `@circle-fin/x402-batching` — "Gasless, batched settlement for x402 payments via Circle
Gateway." **Latest 3.4.0, published 2026-08-24T16:25:34Z**
(https://registry.npmjs.org/@circle-fin/x402-batching). Recent versions: 3.0.3, 3.0.4, 3.1.2, 3.2.0,
3.3.0, 3.4.0. Peer packages: `@x402/core`, `@x402/evm`, `@x402/express`.

**Seller API** (https://developers.circle.com/gateway/nanopayments/howtos/x402-seller,
https://developers.circle.com/gateway/nanopayments/quickstarts/seller,
https://developers.circle.com/agent-stack/agent-marketplace/become-a-seller):

```ts
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
const gateway = createGatewayMiddleware({
  sellerAddress: "0xYOUR_WALLET_ADDRESS",
  facilitatorUrl: "https://gateway-api-testnet.circle.com", // testnet
});
app.get("/premium-data", gateway.require("$0.01"), handler);
```
To accept vanilla onchain x402 *as well*, run `x402ResourceServer` with
`HTTPFacilitatorClient` + `BatchFacilitatorClient` and register `GatewayEvmScheme`, which
**extends `ExactEvmScheme`** so standard onchain payments keep working and the `extra`
(`verifyingContract`) metadata needed for EIP-712 signing is preserved:
`server.register("eip155:*", new GatewayEvmScheme()); await server.initialize();`
Successful wiring shows `extra.name === "GatewayWalletBatched"` in the 402 `accepts[]`.

**Buyer API** (https://developers.circle.com/gateway/nanopayments/howtos/x402-buyer):
- Option A (recommended): `new CompositeEvmScheme(new BatchEvmScheme(signer), new ExactEvmScheme(signer))`
  then `client.register("eip155:*", composite)` — auto-routes Gateway vs onchain.
- Option B: `registerBatchScheme` onto existing schemes with onchain fallback.
- Option C: `GatewayClient` directly (`deposit`, `pay(url)`, `withdraw`, `getBalances`) —
  https://developers.circle.com/gateway/nanopayments/references/sdk. Chain config via
  `CHAIN_CONFIGS['arcTestnet' | 'baseSepolia' | ...]`.
- `supports()` checks whether a given server accepts Gateway payments.

**Status / networks — the load-bearing finding.**
https://developers.circle.com/gateway/references/supported-blockchains (raw `.md`) lists the row
verbatim as **"Arc (testnet only) | 26 | — | `arcTestnet`"** and states "Gateway supports
nanopayments on all blockchains except Solana." So:
- Nanopayments is **not testnet-only in general** — Gateway mainnet exists on Arbitrum, Avalanche,
  Base, Ethereum, HyperEVM, OP, Polygon, Sei, Sonic, Unichain, World Chain. Gateway release notes
  record **2026.04.29 "Updated nanopayments documentation reflecting mainnet launch support"**
  (https://developers.circle.com/release-notes/gateway-2026).
- **Nanopayments is testnet-only *on Arc*.** Arc has no mainnet `SupportedChainName` and no mainnet
  Gateway contract (see §5).
- Deposits and payments must be on the **same** blockchain
  (https://developers.circle.com/gateway/nanopayments/supported-networks). Arc Testnet deposit
  finality is **~1 block / ~0.5 s**, vs ~13–19 min on Base/Ethereum/Arbitrum — Arc is by far the
  fastest Gateway deposit chain.
- Gateway contracts on Arc Testnet (domain 26,
  https://developers.circle.com/gateway/references/contract-addresses):
  GatewayWallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`,
  GatewayMinter `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`.

**Changes since 2026-08-01** (https://developers.circle.com/release-notes/gateway-2026):
- **2026.08.05** — ERC-1271 support: smart contracts / SCAs can authorize burn intents with their
  own signature-validation logic.
- **2026.08.26** — *breaking*: filtering x402 transfers by status now requires at least one of
  `from`, `to`, or `nonce` in the same request (timeout mitigation).
- (2026.07.10 — nonce support added to x402 transfer APIs; `nonce` and `txHash` in responses.)
- `@circle-fin/x402-batching` 3.3.0 → 3.4.0 shipped 2026-08-24.

---

## 3. Paymaster on Arc

Two distinct things — do not conflate them.

**(a) Roll-your-own ERC-4337 paymaster on Arc** —
https://docs.arc.io/integrate/relayers-and-paymasters/deploy-a-paymaster
- Arc supports ERC-4337; **EntryPoint v0.7** at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`.
- Deploy to chain id `5042002`, then `entryPoint.depositTo(paymaster)` — **the deposit is in
  18-decimal native USDC wei**, not 6-decimal ERC-20 units (10 USDC = `10 * 10^18`). This is the
  same dual-decimal trap ARCADE's CLAUDE.md already flags.
- Verify: `cast code <addr> --rpc-url https://rpc.testnet.arc.io` non-empty;
  `entryPoint.balanceOf(paymaster)` non-zero; a test UserOperation through Pimlico.
- **Minimum base fee on Arc is 20 Gwei**; own bundlers must set `maxFeePerGas >= 20 Gwei`. Pimlico
  configured for Arc handles it. https://docs.arc.io/arc/references/gas-and-fees
- Parent page https://docs.arc.io/integrate/relayers-and-paymasters: "Arc uses USDC as its native
  gas token… Fund your signing account or paymaster contract with USDC and Arc handles the rest."
- AA providers on Arc (Biconomy, Pimlico, ZeroDev, Circle Wallets):
  https://docs.arc.io/arc/tools/account-abstraction

**(b) Circle Paymaster (the hosted product)** —
https://developers.circle.com/paymaster/addresses-and-events
- Permissionless contract letting SCAs pay gas in ERC-20 rather than the native asset.
- v0.7: Arbitrum, Base + their Sepolias. v0.8: 7 mainnets + 8 testnets; all v0.8 mainnet deployments
  share `0x0578cFB241215b77442a541325d6A4E6dFE700Ec`, all v0.8 testnets
  `0x3BA9A96eE3eFf3A69E2B18886AcF52027EFF8966`.
- **Arc testnet Paymaster support was announced** in
  https://developers.circle.com/release-notes/w3s-2025 (2025.10.27: "Expanded Paymaster support to
  include Arc testnet", pointing at /paymaster/addresses-and-events), but the current
  addresses-and-events page fetch did not surface an Arc row. **Verify by fetching that page's raw
  `.md` before relying on a Circle-hosted paymaster on Arc.** Note Arc's native gas token *is* USDC,
  so the usual Paymaster value prop ("pay gas in USDC instead of ETH") is largely moot on Arc — the
  useful case is a *third party* sponsoring a user's gas, i.e. ARCADE sponsoring buyer-agent gas.

**(c) Related, cheaper for ARCADE:** EIP-3009 relayer on Arc —
https://docs.arc.io/integrate/relayers-and-paymasters/eip-3009-relayer. Confirms the exact EIP-712
domain ARCADE already uses: `name "USDC"`, `version "2"`, `chainId 5042002`,
`verifyingContract 0x3600000000000000000000000000000000000000`; `nonce` is a random `bytes32`, not
an account nonce; `transferWithAuthorization` ≈ **65,000 gas**; set `maxPriorityFeePerGas` 0 Gwei
(1 Gwei under load), `maxFeePerGas` floor 20 Gwei.

**Arc gotcha worth knowing for ARCADE's settle path**
(https://docs.arc.io/integrate/exchanges): "A USDC meta-transaction (`transferWithAuthorization`)
that fully drains a brand-new deposit address **reverts**… Initialize any deposit address with a
prior transaction before sweeping it using a meta-transaction. A protocol fix is planned."

---

## 4. App Kits

Docs: https://docs.arc.io/app-kit — "App Kit is a suite of SDKs for constructing multichain payment
and liquidity workflows."

| Kit | Package | npm latest (published) |
|---|---|---|
| App Kit (all-in-one) | `@circle-fin/app-kit` | **1.14.0**, 2026-09-02T23:57:21Z |
| Bridge Kit | `@circle-fin/bridge-kit` | **1.14.1**, 2026-09-02T23:57:19Z |
| Unified Balance Kit | `@circle-fin/unified-balance-kit` | **1.6.0**, 2026-09-02T23:59:57Z |
| Viem adapter | `@circle-fin/adapter-viem-v2` | **1.17.1**, 2026-09-02T23:57:19Z |
| Circle Wallets adapter | `@circle-fin/adapter-circle-wallets` | **1.7.2**, 2026-09-02T23:57:19Z |
| Solana adapter | `@circle-fin/adapter-solana` | (used in docs quickstarts) |

(Versions from `https://registry.npmjs.org/<pkg>`. All shipped **two days ago** — this is Circle's
most actively released surface.)

Modules: **Bridge Kit** (USDC across chains via CCTP), **Swap Kit**, **Send Kit**, **Unified Balance
Kit** (chain-abstracted balance, instant spend).

**Directly relevant to ARCADE — cross-chain funding of a buyer wallet.** The docs' flagship Unified
Balance quickstart *is literally* "deposit from Base Sepolia + Solana Devnet, spend on Arc Testnet":
https://docs.arc.io/app-kit/quickstarts/unified-balance-deposit-and-spend

```ts
import { AppKit } from "@circle-fin/app-kit";
import { ArcTestnet, BaseSepolia } from "@circle-fin/app-kit/chains";
const kit = new AppKit();
await kit.unifiedBalance.deposit({ from: { adapter, chain: "Base_Sepolia" }, amount: "2.00", token: "USDC" });
await kit.unifiedBalance.getBalances({ sources: [...], networkType: "testnet", includePending: true });
await kit.unifiedBalance.spend({
  amount: "2.50", token: "USDC",
  from: [{ adapter: evmAdapter }, { adapter: solanaAdapter }],
  to: { adapter: evmAdapter, chain: "Arc_Testnet", recipientAddress },
});
```
Auto-allocation rule (https://docs.arc.io/app-kit/tutorials/unified-balance/select-source-blockchains):
"prefers the destination blockchain first, then pulls from your other blockchains from highest
balance to lowest. Ethereum mainnet is the exception: it is always last."
Both a **browser-wallet** path (EIP-6963 discovery + `createViemAdapterFromProvider`) and a
**Circle Wallets** path (`createCircleWalletsAdapter({ apiKey, entitySecret })`) are documented.
Also available: custom spend fees, fee estimation, Forwarding Service, `removeFund` (trustless
recovery, 7-day delay). Bridge Kit needs **no kit key** for bridge operations.

---

## 5. Arc mainnet — the decisive section for the "push to mainnet by Sept 30" prize

**Arc public mainnet launches 2026-09-16** — 14 days before the Sept 30 deadline.
- https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026 — public mainnet, transition
  from private mainnet; permissioned validator set; at launch Circle unveils "a composable app
  framework for common onchain workflows", AI-powered app/contract tooling, tokenized RWA
  deployment, and interfaces for developers, users and agents.
- https://www.circle.com/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch
  — founding validators reported as BlackRock, DTCC, Galaxy, Global Payments, ICE, Mastercard,
  MoneyGram, SBI Group, Standard Chartered, Sumitomo, Visa.
- https://community.arc.io/public/blogs/arc-public-mainnet-launches-september-16-2026-2026-08-06

**But the docs have not published mainnet parameters yet (as of 2026-09-04):**

| Fact | Status | Source |
|---|---|---|
| Deployment phases | Public Testnet **Live**; Private Mainnet **Upcoming**; Public Mainnet **Upcoming** | https://docs.arc.io/arc/concepts/deployment-model#deployment-phases |
| Chain id | **5042002 is testnet.** No mainnet chain id published anywhere in docs.arc.io | https://docs.arc.io/arc-chain#network-details, https://docs.arc.io/arc/references/rpc-endpoints |
| RPC | Only `https://rpc.testnet.arc.io` / `wss://rpc.testnet.arc.io` | https://docs.arc.io/arc/tools/node-providers |
| USDC mainnet address on Arc | **Not listed.** Circle's mainnet USDC table has no Arc row; Arc appears only under Testnet as `0x3600000000000000000000000000000000000000` | https://developers.circle.com/stablecoins/usdc-contract-addresses |
| Gateway on Arc mainnet | **No.** "Arc (testnet only)"; no Arc row in mainnet GatewayWallet/GatewayMinter tables | https://developers.circle.com/gateway/references/supported-blockchains, /gateway/references/contract-addresses |
| Agent Wallets on Arc mainnet | **No.** "except Arc Testnet (testnet only)" | https://developers.circle.com/agent-stack/agent-wallets/supported-blockchains |
| Circle Contracts on Arc mainnet | **No.** "Arc (testnet only)" | https://developers.circle.com/contracts/supported-blockchains |
| EIP-3009 on Arc | Yes on testnet, documented end-to-end; the USDC predeploy is the same address by construction, but **the mainnet domain (chainId) is unpublished** | https://docs.arc.io/integrate/relayers-and-paymasters/eip-3009-relayer |

**Reading for the prize.** The prize says "deployed **or deployment-ready** on Arc mainnet by
September 30." Given mainnet goes live Sept 16 but no mainnet chain id / RPC / Gateway is published
today, the defensible play is:

1. Make ARCADE **chain-config-driven** (chain id, RPC, USDC address, Gateway wallet, facilitator URL
   all in one config module, no literals), so flipping to mainnet is a config change plus a redeploy.
2. Ship the **EIP-3009 rail** as the mainnet-ready path — it needs only a chain id, the USDC
   predeploy and a funded relayer, all of which exist the moment mainnet does. The Gateway/
   Nanopayments rail *cannot* run on Arc mainnet at launch (no Gateway contracts there).
3. Document that explicitly in the submission: "the 3009 rail is mainnet-ready; the Gateway rail
   follows Circle's Arc-mainnet Gateway deployment."

**Doc drift to fix in ARCADE's own CLAUDE.md:** the docs now use **`https://rpc.testnet.arc.io`**
everywhere (docs.arc.io/arc/tools/node-providers, /integrate/infrastructure, MetaMask setup tables);
ARCADE's CLAUDE.md still says `https://rpc.testnet.arc.network`. Also, the CAIP-2 / faucet facts
check out (chain id 5042002; faucet https://faucet.circle.com), and CCTP domain 26 = Gateway domain
26 is confirmed (https://docs.arc.io/integrate/infrastructure#chain-metadata).

---

## 6. Circle Wallets / Circle Contracts — agent-relevant bits

**Circle Wallets.** Agent Wallets are user-controlled wallets under the hood (2-of-2 MPC, user
custody, sanctions screening) — https://developers.circle.com/agent-stack/agent-wallets.
Developer-controlled wallets (https://developers.circle.com/wallets/dev-controlled) explicitly list
"**Exchange or marketplace infrastructure** — use programmatic wallets for deposits, withdrawals,
and settlement… settle marketplace or P2P trades without handing keys to end users" as a use case —
i.e. Circle's own framing for a hub like ARCADE's escrow/payout side.
- Arc testnet support across Wallets/Gas Station/Modular Wallets was added 2025.10.27
  (https://developers.circle.com/release-notes/w3s-2025); API enum `ARC-TESTNET` on
  `POST /developer/wallets`, `POST /transactions/transfer`, `POST /developer/sign/typedData`, etc.
- **Gas Station policies** (https://developers.circle.com/wallets/gas-station/policy-management):
  per-network policy with max spend/day, max spend/tx, max ops/day, blocked addresses — a
  ready-made "sponsor the buyer agent's first transaction" lever, with documented failure reasons
  (`PAYMASTER_POLICY_EXCEED_MAX_SPEND_USD_PER_TX`, etc.,
  https://developers.circle.com/w3s/asynchronous-states-and-statuses).
- Wallets API rate limits: 5 RPS default, 20 RPS for GETs
  (https://developers.circle.com/wallets/api-rate-limits) — relevant if ARCADE's hub proxies wallet
  calls per job.

**Circle Contracts (SCP).** https://developers.circle.com/contracts — deploy from bytecode or
pre-audited templates (ERC-20/721/1155/Airdrop), interact, and **event monitoring**
(https://developers.circle.com/contracts/scp-event-monitoring). Supported on **Arc (testnet only)**
(https://developers.circle.com/contracts/supported-blockchains). If `FeeSplitter.sol` ever ships,
SCP deploy + event monitoring is the low-code path; note Arc's EVM differences first
(https://docs.arc.io/arc/tutorials/porting-contracts-to-arc — no WUSDC wrapper, native vs ERC-20
decimal traps, SELFDESTRUCT moves the contract's USDC, `balanceOf` truncates below 1e-6).

---

## 7. What Circle shipped for agents, 2026-07-01 → 2026-09-04

| Date | What | Source |
|---|---|---|
| 2026-07-02 / 07-07 | agent-stack-starter-kits initial public commits + Apache-2.0 | https://github.com/circlefin/agent-stack-starter-kits/commits/master |
| 2026-07-10 | Gateway: nonce support on x402 transfer APIs (`nonce`, `txHash` in responses) | https://developers.circle.com/release-notes/gateway-2026 |
| **2026-07-31** | **Agent Marketplace launches** — curated x402 catalog + public Discovery API + seller listing | https://developers.circle.com/release-notes/agent-stack-2026 |
| 2026-08-05 | Gateway: ERC-1271 support (SCAs authorize burn intents) | https://developers.circle.com/release-notes/gateway-2026 |
| **2026-08-13** | **Circle CLI 1.0.0** (npm, and release notes: Eco quoted single-use deposit vaults, version-compat checks) | https://registry.npmjs.org/@circle-fin/cli · https://developers.circle.com/release-notes/agent-stack-2026 |
| 2026-08-13 | `circlefin/skills` last push (145 stars) | https://github.com/circlefin/skills |
| 2026-08-24 | `@circle-fin/x402-batching` **3.4.0** | https://registry.npmjs.org/@circle-fin/x402-batching |
| 2026-08-26 | Gateway *breaking*: x402 transfer status filter now requires `from`/`to`/`nonce` | https://developers.circle.com/release-notes/gateway-2026 |
| 2026-08-28 | Starter kits: "licensing, payment fixes, and user interaction improvements" (#5) | https://github.com/circlefin/agent-stack-starter-kits/commit/3996330 |
| 2026-09-02 | App Kit / Bridge Kit / Unified Balance Kit / adapters all released (1.14.0 / 1.14.1 / 1.6.0 / 1.17.1 / 1.7.2) | npm registry |
| **2026-09-16** | Arc public mainnet (announced, not yet live) | https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026 |

No September 2026 Agent Stack release-notes entries yet.

---

## 8. Agent Marketplace — the listing path (ARCADE's distribution channel)

- **Discovery API**: `GET https://api.circle.com/v2/x402/discovery/resources`, **public, no API key,
  no account** — https://developers.circle.com/agent-stack/agent-marketplace/discovery-api.
  Filters: `query` (free text), `network` (structured — use this for chain, not `query`), `category`,
  price. Categories: `SOCIAL_INTELLIGENCE`, `FINANCIAL_ANALYSIS`, `WEB_SEARCH_RESEARCH`,
  `PREDICTION_MARKETS`, `CREATIVE`, `INFRASTRUCTURE`. Every listing carries structured payment
  requirements + JSON Schema, plus `supportsVanillax402` and `supportsCircleGateway` flags on
  `accepts[]`. OpenAPI: https://agents.circle.com/.well-known/openapi.json ·
  A2A card: https://agents.circle.com/.well-known/a2a.json · llms.txt: https://agents.circle.com/llms.txt
- **Get listed**: https://developers.circle.com/agent-stack/agent-marketplace/get-listed —
  prerequisites: service returns 402 when unpaid; **published OpenAPI spec**; a payout wallet
  address. Submit the intake form https://forms.gle/7YFzvdmMcn1JH5tF6 with endpoint URL, payout
  wallet, description. "Listings are reviewed and approved manually today. A self-serve, automated
  submission flow is coming." Payout wallet is **sanctions-screened** during review; approved
  listings are **continuously health-checked** and stay listed only while reachable.
- **Become a seller**: https://developers.circle.com/agent-stack/agent-marketplace/become-a-seller —
  also notes the `accept-agent-payments` Circle Skill scaffolds the whole thing:
  `circle skill install --tool claude-code --name accept-agent-payments`.

---

## 9. Open items to verify before relying on them

1. **Circle Paymaster on Arc testnet** — announced 2025.10.27 in the w3s release notes but not
   visible in the current addresses-and-events fetch. Re-fetch
   `https://developers.circle.com/paymaster/addresses-and-events.md` raw before designing around it.
2. **Arc mainnet chain id / RPC / USDC address** — unpublished as of 2026-09-04. Watch
   https://docs.arc.io/arc/references/rpc-endpoints and
   https://developers.circle.com/stablecoins/usdc-contract-addresses after Sept 16.
3. **Gateway on Arc mainnet** — watch https://developers.circle.com/gateway/references/supported-blockchains
   for the `—` in the Arc mainnet column to become a `SupportedChainName`.
