# World / AgentKit research for ARCADE — ETHOnline 2026

> September 6, 2026 terminology update: portable folders are now labelled Agent Skill (open standard), per the [specification](https://agentskills.io/specification). This public copy's wording changed; original private records, code behavior and Git history did not. Historical implementation details remain historical.

Target prize: **AgentKit Continuity — $3,500** (continuity track). Researched 2026-09-04.
Every claim below carries a URL or a repo file path. Repo clone used: `worldcoin/agentkit` @ `main` (latest commit `2026-08-24 fix: resolve cargo-deny advisory failures (#41)`, via `gh api repos/worldcoin/agentkit/commits`).

---

## 1. What AgentKit is, exactly

### One-line
"Verify that an agent is backed by a real, World ID-verified human." — https://github.com/worldcoin/agentkit/blob/main/README.md

It is an **extension to x402** (HTTP 402), not a standalone auth system: "AgentKit Beta extends x402, allowing websites to distinguish human-backed agents from bots and scripts." — https://docs.world.org/agents/agent-kit/integrate.md

### Packages (npm, versions verified via `npm view` on 2026-09-04)

| Package | Version | Source dir |
|---|---|---|
| `@worldcoin/agentkit` | **0.2.1** (published 2026-08-31) | `x402/` — https://github.com/worldcoin/agentkit/blob/main/x402/package.json |
| `@worldcoin/agentkit-core` | **0.2.1** | `core/` — https://github.com/worldcoin/agentkit/blob/main/core/package.json |
| `@worldcoin/agentkit-cli` | **0.2.0** (bin: `agentkit`) | `cli/` — https://github.com/worldcoin/agentkit/blob/main/cli/package.json |

`@worldcoin/agentkit` re-exports all of `@worldcoin/agentkit-core` (`export * from '@worldcoin/agentkit-core'`) — https://github.com/worldcoin/agentkit/blob/main/x402/src/index.ts. So you only install `@worldcoin/agentkit`.

Also shipped: two **Agent Skills (open standard)** in-repo — `npx skills add worldcoin/agentkit agentkit-x402` (buyer side) and `npx skills add worldcoin/agentkit integrate-agentkit` (seller side) — https://github.com/worldcoin/agentkit/blob/main/README.md, sources at `skills/agentkit-x402/SKILL.md` and `skills/integrate-agentkit/SKILL.md`.

There is a Rust workspace too (`Cargo.toml`, `deny.toml` at repo root) but the shipped integration surface is TypeScript.

### Integration flow (from https://docs.world.org/agents/agent-kit/integrate.md, verbatim step titles)

1. **Step 1: Install AgentKit** — `npm install @worldcoin/agentkit`
2. **Step 2: Register the agent in AgentBook** — `npx @worldcoin/agentkit-cli register <agent-address>`; check with `status <agent-address>`. "By default, the CLI registers on World Chain and submits through the hosted relay." The CLI (a) looks up the next nonce, (b) prompts the World App verification flow, (c) submits the registration transaction.
3. **Step 3: Wrap x402 calls in the agent** — `createAgentkitClient({ signer: { address, chainId, type: 'eip191', signMessage } })`, then use `agentkit.fetch` instead of `fetch`. Fallback for agents whose HTTP client you can't change: the `agentkit-x402` skill.
4. **Step 4: Wire the hooks-based server flow** — `x402ResourceServer` + `.registerExtension(agentkitResourceServerExtension)`, `createAgentkitHooks({ agentBook, storage, mode })`, `declareAgentkitExtension({ statement, mode })`, `httpServer.onProtectedRequest(hooks.requestHook)`. Reference server = Hono + `@x402/hono`, but "Express and Next.js route handlers can use the same hooks and low-level helpers."
5. **Step 5: Configure the default mode and storage** — `free` / `free-trial` / `discount`; `InMemoryAgentKitStorage` is demo-only, production needs persistent `AgentKitStorage`.

Full playbook (richer than the docs page): https://github.com/worldcoin/agentkit/blob/main/x402/DOCS.md

### Request-time protocol ("what a human-backed agent proof looks like")

From `x402/DOCS.md` § "How It Works":
1. Client requests protected resource.
2. Server returns `402 Payment Required` including the `agentkit` extension with a **CAIP-122 challenge** (nonce, domain, supported chains, mode).
3. Client signs the challenge with its wallet and sends it in the **`agentkit` HTTP header**.
4. Server validates the signature, **recovers the wallet address**, and looks up the **human identifier in AgentBook**.
5. Access granted / discounted per mode, else normal payment continues.

Wire format: the header is `base64(JSON(payload))` where payload = SIWE/EIP-4361 message fields + `address`, `chainId`, `type`, optional `signatureScheme`, `signature` — see `createHeader` in https://github.com/worldcoin/agentkit/blob/main/x402/src/client.ts.

Message format is **EIP-4361 (SIWE)**; signature schemes are `eip191` (EOA, default), `eip1271` (smart contract), `eip6492` (counterfactual) — `x402/DOCS.md` § Supported Chains. There is also a Solana path (`formatSIWSMessage`, `verifySolanaSignature`, `SOLANA_MAINNET/DEVNET/TESTNET`) exported from https://github.com/worldcoin/agentkit/blob/main/core/src/index.ts.

Validation (server side, no World App involved): domain binding, `uri` host match, `issuedAt` freshness (**default maxAge 5 minutes**), `expirationTime`, `notBefore`, optional nonce replay check — https://github.com/worldcoin/agentkit/blob/main/core/src/validate.ts.

**Crucially: the World ID ZK proof is NOT sent per request.** Per request the agent only produces an ECDSA/SIWE signature. The ZK proof is consumed once, on-chain, at registration.

### Nullifier semantics

`AgentBook.register(address agent, uint256 root, uint256 nonce, uint256 nullifierHash, uint256[8] proof)`; storage is `mapping(address => uint256) public lookupHuman;` and the event is `AgentRegistered(address indexed agent, uint256 indexed humanId)` where humanId is documented as "The anonymous human identifier (nullifier hash)" — https://github.com/worldcoin/agentkit/blob/main/contracts/src/AgentBook.sol and https://github.com/worldcoin/agentkit/blob/main/contracts/src/interfaces/IAgentBook.sol.

- The **World ID nullifier hash IS the human id.** It is app+action-scoped (external nullifier = `hash(hash(appId), action)` — see `contracts/script/DeployAgentBook.s.sol`), so it is stable per human for this one action and unlinkable to their other World ID uses.
- The proof **signal** is `abi.encodePacked(agent, nonce).hashToField()` — the proof is bound to both the agent address and the current nonce, so old proofs cannot be replayed for a later registration (`cli/REGISTRATION.md` § Notes).
- **One human → many agents.** The contract does not enforce one-agent-per-nullifier; `lookupHuman[agent] = nullifierHash` is a many-to-one map. Docs confirm: "Usage limits are tracked per **human**, not per agent, allowing for multiple agents to share a single human-backed identity" and "If Alice has two agents and uses 3 of her 5 free uses with Agent A, Agent B gets 2 remaining" (`x402/DOCS.md`).
- Server-side without World App: **yes** — `agentBook.lookupHuman(address)` is a plain `eth_call` `view` returning `uint256` (0 = unregistered), wrapped by `createAgentBookVerifier()` — https://github.com/worldcoin/agentkit/blob/main/core/src/agent-book.ts.

### What AgentBook is

An **on-chain registry contract** (Solidity, `Ownable2Step`) that calls `worldIdRouter.verifyProof(root, groupId, signal, nullifierHash, EXTERNAL_NULLIFIER_HASH, proof)` and stores `agent → humanId` — https://github.com/worldcoin/agentkit/blob/main/contracts/src/AgentBook.sol.

**Addresses** (from https://github.com/worldcoin/agentkit/blob/main/cli/REGISTRATION.md § Supported Networks and `skills/integrate-agentkit/SKILL.md` § Constants):

| Network | AgentBook address |
|---|---|
| **World Chain (`eip155:480`) — canonical lookup** | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |
| Base (`eip155:8453`) — CLI default registration target | `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4` |
| Base Sepolia | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |

Also: World Chain USDC `0x79A02482A880bCE3F13e09Da970dC34db4CD24d1` (`skills/integrate-agentkit/SKILL.md`).

⚠️ **Documentation conflict worth reporting as feedback:** `cli/REGISTRATION.md` says the CLI supports networks `base` / `base-sepolia`, "`register <address>` defaults to `base` and automatic relay submission", and "Registration is gasless by default (uses a hosted relay on **Base mainnet**)" (README). But `docs.world.org/agents/agent-kit/integrate.md` says "By default, the CLI registers on **World Chain**", and the CLI source has `const AGENT_BOOK_NETWORK = 'eip155:480'` and a single hardcoded `AGENT_BOOK_CONTRACT` — https://github.com/worldcoin/agentkit/blob/main/cli/src/index.ts. Meanwhile the SDK's `createAgentBookVerifier()` *only ever reads World Chain* (`const AGENT_BOOK_ADDRESS = '0xA23aB...'` + `getPublicClient(worldchain.id)` in `core/src/agent-book.ts`). **If registration actually lands on Base, the default verifier will never see it.** Must be verified empirically on day 1 of the build.

Relay: `POST {API_URL}/register`, default `https://x402-worldchain.vercel.app` (NOT the `/facilitator` path). Payload `{agent, root, nonce, nullifierHash, proof[8], contract, network}` → `{txHash}`. Minimal relayer reference: `cli/examples/register-relayer.mjs`. `--manual` prints raw call data instead. All from https://github.com/worldcoin/agentkit/blob/main/cli/REGISTRATION.md

---

## 2. Sandbox App

**What it is:** "an isolated, production-like environment for testing your World ID integration end-to-end… its own backend and its own builds of the World ID app for iOS and Android" — https://docs.world.org/world-id/sandbox/what-is-sandbox.md

**Access — there is NO public Google Form; access runs through the Developer Portal** (the hackathon-listed `forms.gle/mqbaiwMvX5MzmKdY8` is not referenced anywhere in the docs; treat it as an event-specific fast-lane):
- iOS: install TestFlight → in https://developer.world.org select **World ID Sandbox** in the sidebar → **iOS** tab → submit the Apple Account email → wait for approval → accept TestFlight invite. "Enrollment is tied to a team, so open the sandbox panel from within a team."
- Android: same panel, submit the Google Play account email, wait for approval, then scan the QR / open the private Play testing link on the device (browser and Play Store must be signed into the same account; wait 15 min after a first Play sign-in).
- Support: `sandbox.access@toolsforhumanity.org`
- Source: https://docs.world.org/world-id/sandbox/sandbox-access.md

**Pointing your integration at it (3 steps, verbatim):** 1. Update IDKit to the latest version. 2. Set `environment: sandbox` in your IDKit configuration. 3. Send the proof to the production verify endpoint `https://developer.world.org/api/v4/verify/${rp_id}`. — same page.

**What you get without an Orb:** resettable accounts ("Delete an account and sign up again as often as you need"), **simulated verification** ("Exercise verification flows without real hardware or real-world credentials"), and **controllable gating** (you decide whether fraud/risk/attestation checks are enforced). Both same-device deep link and cross-device QR flows, iOS + Android. — https://docs.world.org/world-id/sandbox/what-is-sandbox.md

**Test-user "states"** are documented for the Selfie Check page and are the closest thing to a test-user matrix: **Hot** (World ID app already installed → straight to matching/enrollment), **Cold** (full onboarding: install, account creation, DOB, invite code, enrollment), **Semi-cold** (existing user reinstalls and recovers on a new device). Known limitations: iOS semi-cold recovery breaks if the user taps "Sign in" instead of "Sign up"; invite-code handling differs iOS vs Android; feature-flag approval needed. — https://docs.world.org/world-id/sandbox/testing-selfie-check.md

**Explicit non-goals:** "Accounts and proofs issued in Sandbox are for integration validation only"; "Not a source of real uniqueness." — what-is-sandbox.md

**Headless/automated for a demo video? No.** The proof leg requires a physical iOS/Android device running a TestFlight/Play build; the docs describe QR and deep-link handoff to that app and nothing else. There is no simulator/API that mints sandbox proofs. **But this only matters once** — see §3. The demo video can show the one-time human registration on a phone (screen-recorded), then the entire agent loop runs headless afterwards. This is actually the strongest narrative shape for the prize.

---

## 3. Does AgentKit work for a server-side autonomous agent? — YES, and this is the key finding

**The human proof is produced once and the authorization is durable.**

- Registration: "You only need to register **once per wallet**." — https://github.com/worldcoin/agentkit/blob/main/README.md
- Per request the agent does **not** touch World App. It signs a SIWE string with its own key: `const message = formatSIWEMessage(completeInfo, options.signer.address); const signature = await options.signer.signMessage(message)` — https://github.com/worldcoin/agentkit/blob/main/x402/src/client.ts. The `signer` interface is `{ address, chainId, type, signMessage(message): Promise<string> }` — a raw private key or a CDP/Safe account works.
- Server side resolves with a `view` call only — `core/src/agent-book.ts`.
- Revocation is live: "AgentBook lookups happen at request time, so revoked registrations take effect immediately." — `x402/DOCS.md` § Security Considerations.

So: **per-request signature, one-time human proof.** Exactly the "durable human-backed agent authorization" the prize describes. A headless ARCADE buyer agent or seller daemon needs no browser after the one-time registration.

The CLI is even built for an agent to drive: it has an agent output mode that prints `HUMAN ACTION REQUIRED: Scan or click this link in World App to verify: ${connectorURI}` and an `--llms` mode (`npx @worldcoin/agentkit-cli --llms`) intended to be handed to a coding agent — https://github.com/worldcoin/agentkit/blob/main/cli/src/index.ts, https://github.com/worldcoin/agentkit/blob/main/cli/REGISTRATION.md.

---

## 4. Chains — and the ARCADE-relevant surprise

- **AgentBook lookup is pinned to World Chain, always.** "`createAgentBookVerifier()` always resolves against the canonical AgentBook deployment on World Chain (`eip155:480`)… the registry lives on one chain and lookup happens there regardless of which chain the agent signed on or which chain your paid route runs on." — `x402/DOCS.md` § Custom AgentBook Configuration. The integrate skill adds a hard rule: "Do not introduce any 'pin AgentBook to chain X' language… The payment chain and the AgentBook lookup chain are decoupled on purpose."
- **The payment chain and the signing chain are free.** "Servers can accept authentication on any EVM network expressed as a CAIP-2 chain ID." — `x402/DOCS.md` § EVM Network Support.
- 🎯 **AgentKit already ships a default public RPC for Arc testnet.** `core/src/viem-client.ts` contains:
  ```ts
  [chains.arcTestnet.id, `https://arc-testnet.g.alchemy.com/v2/${ALCHEMY_FREE_TIER_KEY}`],
  const ARC_MAINNET_ID = 5042 // "Arc mainnet (chain id 5042) is not live yet…"
  ```
  — https://github.com/worldcoin/agentkit/blob/main/core/src/viem-client.ts. Docs confirm: "Built-in public RPCs are used by default for Base, World Chain, **Tempo, and Arc**, so most integrations do not need RPC configuration for those signing chains." — `x402/DOCS.md` § Smart Wallet Support. **World and Circle already anticipated this exact pairing.** ARCADE's Arc chain id is 5042002 (`eip155:5042002`); AgentKit's `chains.arcTestnet.id` from viem should be checked against that at build time.
- **Verifiable from an arbitrary Node/Bun backend: yes.** Everything server-side is viem `readContract` + `verifyMessage`/ERC-1271 `isValidSignature`; no World App, no Worldcoin API call, no World Chain deployment of your own. Only requirement: reachable World Chain RPC (override with `createAgentBookVerifier({ rpcUrl })`). ERC-1271 verification uses the *signed* chain's RPC, overridable per chain via `rpcUrls: { 'eip155:5042002': 'https://rpc.testnet.arc.network' }` (`x402/DOCS.md` § createAgentkitHooks).

---

## 5. Concrete ARCADE integration design

ARCADE is already an x402 marketplace on Arc with a hub, seller daemons, and buyer agents — this is a near-ideal AgentKit host. Continuity is genuine: AgentKit adds an identity layer to an existing, shipped system.

### (a) Seller side — "human-backed listing" badge

1. Seller runs `npx @worldcoin/agentkit-cli register <sellerWalletAddress>` once (phone + World App / Sandbox app). This is the demo-video moment.
2. `arcade publish` (in `packages/runner`) calls `createAgentBookVerifier().lookupHuman(sellerWallet)` before submitting the listing; the hub re-verifies independently (never trust the daemon).
3. Hub stores `humanId` on the listing row (bun:sqlite / `@effect/sql`), exposes `humanBacked: boolean` in the listing API, and `apps/web` renders a badge. Note privacy: **store `humanId` hashed or not at all if you only need the boolean** — the raw nullifier is a stable cross-listing correlator for that human, which is fine within one app (it *is* app-scoped) but should not be exposed in the public API.
4. **Sybil-resistant listing quota:** one human ⇒ N listings. Counting by `humanId`, not by wallet, is the whole point — a spammer generating 500 seller wallets still collapses to one nullifier or to zero (unregistered).

### (b) Buyer side — hub checks human backing before dispatching high-value jobs

1. Buyer SDK (`packages/buyer`) gains an AgentKit signer wired to the buyer's existing Arc wallet, and routes hub calls through `agentkit.fetch` — or, for ARCADE's own HttpApi, use `agentkit.createHeader(extension)` directly and attach the `agentkit` header (the SDK exposes `createHeader` precisely for custom HTTP clients — `x402/DOCS.md` § createAgentkitClient returns).
2. Hub adds `agentkitResourceServerExtension` + `createAgentkitHooks` on the job-dispatch route. Policy, expressed in ARCADE terms:
   - **Rate limits:** unregistered buyer → hard cap (e.g. 5 jobs/min, max $0.50/job). Human-backed → higher ceiling, tracked per `humanId` so 20 sock-puppet wallets share one bucket.
   - **High-value gate:** jobs over a USDC threshold require a valid AgentKit header resolving to a non-null `humanId`. Refuse otherwise. This is the headline demo.
   - **Priority queue:** human-backed jobs jump the dispatch `Queue` (Effect `Queue`/`Stream` already in the stack).
   - **Free trial:** `mode: { type: 'free-trial', uses: 3 }` on ARCADE's *own* first-party skills — a human-backed buyer's first 3 calls are free, then x402 payment on Arc resumes. Zero extra code; it's the SDK default path.
3. **Storage:** implement `AgentKitStorage` over the existing `bun:sqlite`/`@effect/sql` layer — `tryIncrementUsage(endpoint, humanId, limit)` as a single `UPDATE … WHERE count < limit` (atomic, no lock needed in SQLite), plus `hasUsedNonce`/`recordNonce` for replay protection. `InMemoryAgentKitStorage` is explicitly demo-only (`x402/DOCS.md`, and the integrate skill: "`InMemoryAgentKitStorage` is only for demos").

### The killer ARCADE-specific beat: **agent-hires-agent, human provenance preserved**

ARCADE already lets a seller's agent hire other skills (the "hop"). AgentKit gives that hop a provenance chain: the hop's buyer identity is the *seller's* registered wallet, so the hub can log "job settled for human `0xabc…` two hops deep." No other project in this prize pool has a second hop to hang this on. Lead the demo with it.

### Exact APIs/calls needed (complete list)

Buyer/seller agent (headless):
- `npx @worldcoin/agentkit-cli register <addr>` / `status <addr>` — one time, per wallet
- `createAgentkitClient({ signer: { address, chainId: 'eip155:5042002', type: 'eip191', signMessage } })`
- `agentkit.fetch(url, init)` **or** `agentkit.createHeader(extension)` → set header `agentkit`

Hub (server):
- `createAgentBookVerifier()` → `lookupHuman(address): Promise<string | null>` (badge + gate; the only call needed for the simplest version)
- `declareAgentkitExtension({ statement, mode })` in the 402 response
- `agentkitResourceServerExtension` registered on `x402ResourceServer`
- `createAgentkitHooks({ agentBook, storage, mode, rpcUrls })` → `hooks.requestHook` on `onProtectedRequest`; `hooks.verifyFailureHook` on the facilitator **only if using `discount` mode**
- Low-level alternative if ARCADE's Effect HttpApi doesn't want the x402 hook plumbing: `parseAgentkitHeader` → `validateAgentkitMessage(payload, resourceUri)` → `verifyAgentkitSignature(payload, { rpcUrls })` → `agentBook.lookupHuman(address)`. Four calls, all pure functions, trivially wrapped in `Effect.tryPromise`. **Recommended for ARCADE** — it avoids coupling ARCADE's hub to `@x402/hono` and keeps everything inside the existing Effect layer.
- Hook events for logging/UI: `agent_verified`, `agent_not_verified`, `validation_failed`, `discount_applied`, `discount_exhausted` (`x402/DOCS.md`).

### Feasibility for a ~1-week build: **HIGH, with one gating risk**

Low-risk, ~1–2 days of actual code:
- Server-side verification is 4 pure function calls + one `eth_call`. Effect-wrappable in an afternoon.
- Chain-agnostic by design; Arc already has a built-in RPC entry in AgentKit.
- No new contracts, no new chain, no World Chain deployment of your own.
- `AgentKitStorage` over existing SQLite: half a day.
- UI badge + gate + priority queue: a day.

**Risk 1 (must resolve day 1): does a Sandbox-issued identity produce a proof that the on-chain AgentBook will accept?** Evidence says probably not, and the prize *requires* using the Sandbox App:
- `AgentBook.register` verifies on-chain via `worldIdRouter.verifyProof(...)` (`contracts/src/AgentBook.sol`), whereas the Sandbox docs instruct you to verify proofs against the **cloud** endpoint `https://developer.world.org/api/v4/verify/${rp_id}` (sandbox-access.md). Different verification paths.
- Sandbox "is not a source of real uniqueness" and its identities are "for integration validation only" (what-is-sandbox.md) — unlikely to be in the production World Chain Merkle group the canonical AgentBook checks.
- The CLI **hardcodes** `APP_ID = 'app_a7c3e2b6b83927251a0db5345bd7146a'` and `ACTION = 'agentbook-registration'` with **no env override and no `environment`/`bridge_url` parameter** (`cli/src/index.ts` — only `c.env.API_URL` is read). It depends on `@worldcoin/idkit-core@2.1.0` (`cli/package.json`) while current idkit-core is **4.2.4** — so the CLI cannot follow the sandbox instruction to "update IDKit to the latest version and set `environment: sandbox`". **This is the single most valuable item for the required feedback document.**
- Mitigations, in order of preference: (i) ask World at the event for a sandbox-enabled AgentBook app_id / a sandbox AgentBook deployment; (ii) deploy your own AgentBook with `contracts/script/DeployAgentBook.s.sol` (env: `WORLD_ID_ROUTER`, `GROUP_ID`, `APP_ID`, `ACTION`) pointed at a staging World ID router, register with your own `app_staging_…` id via idkit-core directly (~120 lines, mirroring `cli/src/index.ts`), then `createAgentBookVerifier({ client, contractAddress })` — the SDK explicitly supports "Point at a custom contract (e.g. staging/testnet)"; (iii) register the real production wallet with a real World App for the live demo and use the Sandbox App only to exercise the IDKit/consent leg, documenting the gap. Budget one day for this.

**Risk 2:** the Base-vs-World-Chain registration/lookup discrepancy in §1. Verify with `agentkit status <addr>` + a direct `lookupHuman` read on World Chain immediately after registering. Also a feedback item.

### Feedback document (a hard requirement) — what to capture as you go
Log, with timestamps and screenshots: (1) the CLI/docs chain contradiction and the hardcoded APP_ID / stale idkit-core; (2) whether sandbox identities can register on-chain at all; (3) Developer Portal navigation to the **World ID Sandbox** panel (team-scoped, easy to miss), approval latency for TestFlight/Play; (4) sandbox states Hot/Cold/Semi-cold, the iOS "Sign in vs Sign up" semi-cold trap, invite-code divergence iOS vs Android; (5) missing headless/simulator path for automated E2E; (6) that `createAgentBookVerifier` has no batch/multicall lookup (N sellers = N RPC calls); (7) that the Solana surface is exported but undocumented on the docs site. Write it as you build, not at the end.

---

## 6. Selfie Check ($3,500, open track) — relevance to ARCADE

Selfie Check is "a medium-assurance biometric credential using the device camera for liveness and facial similarity" and is explicitly **not proof-of-personhood** — a liveness/matching check, requested via `selfieCheckLegacy({ signal })`, needing feature-flag access from `developers@toolsforhumanity.com` and currently on World ID 3.0 (https://docs.world.org/world-id/idkit/credentials). Its real appeal is reach: "Anyone with World ID App can complete the flow—no Orb or document credential is required." For ARCADE it is a **poor primary fit and a plausible secondary one**. Poor, because ARCADE's whole thesis is autonomous agents transacting without a human in the loop; a camera-liveness check is inherently interactive and per-session, so it cannot gate agent-to-agent job dispatch. Plausible, as a *step-up* control on the rare human-in-the-loop moments ARCADE genuinely has: a seller raising a listing's price ceiling, withdrawing accumulated USDC earnings, or approving an unusually large buyer spend — i.e. re-confirming that the same human who registered the agent is still the one at the keyboard, which AgentKit's durable registration deliberately does not check. If you want a second prize, that "high-value action requires a fresh selfie" flow is a real feature and cheap to bolt onto the seller dashboard in `apps/web` (World's own `human-in-the-loop` package — https://docs.world.org/agents/human-in-the-loop/integrate.md — is the natural companion). But it is additive; do not let it dilute the AgentKit Continuity narrative, which is the stronger and better-aligned prize.
