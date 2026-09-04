# ARCADE — Secondary sponsor assessment (ETHOnline 2026, Continuity track)

Researched 2026-09-04. Every claim below carries a URL. Nothing here is from memory.

---

## A. Bazantic — $3,000 across three tracks

### What it is

Bazantic is a "unified gateway for AI agents. One install, one credential, many APIs. The
gateway brokers auth and payment, so the agent never holds a per-provider API key."
— <https://bazantic.com/skill> (the official `using-bazantic` SKILL.md, served as
`text/markdown`; also linked from <https://bazantic.com/llms.txt>).

The landing page positions it as making APIs agent-native with a "Hosted MCP Server", "LLM.txt
& Skills File", "Agent-Native Authentication", "Agentic Payment Rails" with "x402 / MPP
support", and OFAC compliance screening — <https://bazantic.com>.

Public surface confirmed from `https://bazantic.com/llms.txt`:

- Docs: <https://bazantic.com/docs>
- Gateway: <https://bazgateway.com/>
- MCP server: <https://bazgateway.com/mcp/>
- Skill: <https://bazantic.com/skill>
- Become a provider: <https://bazantic.com/become-a-provider>

**GitHub org exists but is empty.** `gh api users/bazantic` → `"type":"Organization"`,
`"public_repos":0`, created `2026-04-05`, updated `2026-08-26` —
<https://github.com/bazantic>. So there is no open-source client to read; the SKILL.md is the
authoritative spec.

### How a Gateway is created (from <https://bazantic.com/skill>)

```bash
npm i -g @bazantic/cli        # provides `baz`
baz login                     # device sign-in, browser approval required (human in the loop)
baz gateway add \
  --spec-url https://api.example.com/openapi.json \
  --endpoint https://api.example.com \
  --name "ARCADE" --json
```

Constraints, verbatim from the skill:

- `--spec-url` must be **OpenAPI or OpenRPC**, fetched **server-side**, so "reachable over
  public https — not localhost, not behind auth", declaring ≥1 operation. Caps: **200
  operations, 4 MB**.
- `--endpoint` must be **https only**.
- `--auth-type` is "How the gateway authenticates **to your API**: `api-key`, `basic`, or
  `x402-mpp` (default) for a service that needs no credential at all." Never `jwt` — "the
  gateway has no jwt branch, so the reloader drops and logs the service instead of routing it."
- **The CLI only gets you a registered draft.** Pasting a spec with no public URL, configuring
  the credential/delivery, and setting **per-method prices** are dashboard-only, via the
  `/gateways/new` three-step wizard (`ANALYZE → REVIEW → ACTIVATE`).
- The generated `mcpUrl` is always returned but an MCP server is only generated when spec
  format and detected protocol pair up (OpenAPI+REST, OpenRPC+JSON-RPC) — "confirm with a
  `tools/list` call before relying on it."

### The consumer side and the settlement chain — the critical finding

From the same skill:

- "Money is **USDC everywhere** — every price, cap and ceiling."
- Prices in a 402 are "**base units** of a 6-decimal token, so `10000` = `0.01`."
- Two payers: a **Grant** (capped, revocable, spends a Bazantic-hosted balance; `baz grant
  create --name agent-1 --cap 5`, requires browser approval by a human) or a self-custody
  wallet.
- **"Grants settle on Base. A grant minted on `base-sepolia` cannot pay a gateway that settles
  on `base`. Match them, or the call fails after the challenge."**

**There is no mention of Arc anywhere in the Bazantic skill** (grepped: only `base`/`base-sepolia`
appear as networks; `gateway.network` is a config key). Independent corroboration that the
x402/MPP tooling ecosystem is Base/Solana/Tempo-centric:
<https://github.com/cascade-protocol/x402-proxy> ("auto-pays any endpoint on Base, Solana, and
Tempo"). MPP = Machine Payments Protocol, an "open, payment-method agnostic protocol" over
HTTP 402 — <https://docs.codex.io/agents/x402-mpp>.

**Can it point at an existing x402 endpoint on Arc?** Not documented. The `x402-mpp` auth-type
is described only as "for a service that needs no credential at all", i.e. how Bazantic reaches
*your* upstream — the skill does not describe Bazantic settling an upstream 402 on your behalf,
and it does not describe Arc as a settlement network. Practical read: Bazantic would front
ARCADE with **its own** x402/MPP paywall settling on Base, and the upstream ARCADE endpoint
would need to be reachable without a second payment (e.g. a hub-authenticated internal route
or a free-tier variant). Assume double-payment or a bypass route is required, and verify by
probing before building on it.

### Prize requirements (verbatim, <https://ethglobal.com/events/ethonline2026/prizes>, Bazantic)

1. **Help an Agent Use Your Hackathon Project — $1,000 (2 × $500), continuity-only**: create a
   bazantic.com account; create an x402/MPP Gateway for your project; create a **Recipe** that
   explains when/why/how to use the service; run the same prompt/model twice (raw API vs
   Recipe); record a video of the difference; give your Bazantic username.
2. **Best Recipe that uses ETHGlobal Sponsor APIs — $1,000** (1st $500 / 2nd $300 / 3rd $200):
   combine ≥2 services in one repeatable flow, screen recording.
3. **Agentify a New API — $1,000** (same split): add a service not previously on Bazantic,
   working Gateway, recipe, screen recording.

### Blockers

- **"Recipe" is not documented anywhere public.** The word does not appear once in
  <https://bazantic.com/skill>, and `bazantic.com/docs/recipes` 404s / renders the dashboard
  shell. It is a dashboard feature you will have to discover live after signup.
- **Signup may be gated.** <https://bazantic.com/developers> shows a "Request Beta Access" form
  (name, email, company, problem) and the homepage offers "join the Waitlist for Bazantic for
  Developers" — <https://bazantic.com>. The skill assumes `baz login` works, so hackathon
  participants are presumably let through, but this is an unknown until you try. **Do this
  first — it gates all three tracks.**
- Two steps require a **human in a browser**: `baz login` and `baz grant create` (device
  fingerprint cross-check). Not agent-completable.

### Fit verdict: **STRONG** (highest expected value of the four)

ARCADE is literally an x402-paid API with a machine buyer — this is the sponsor's exact shape,
and tracks 1 and 3 both apply to the same work (register ARCADE's `/x/:seller/:skill` as a
Bazantic gateway = "agentify a new API" *and* "help an agent use your project"). Track 2 is
reachable by chaining a Bazantic-hosted sponsor API into an ARCADE skill. Three prize pools,
one integration. The A/B video (raw API vs Recipe) is a demo asset you'd want anyway.

**Effort: ~4–8 hours**, most of it non-code: signup/beta access, serve an OpenAPI 3 document
for the hub (ARCADE already has an `@effect/platform` HttpApi, which can emit OpenAPI), run
`baz gateway add --status draft`, finish auth+pricing in the dashboard wizard, author the
Recipe, record two runs + video. Main risk is beta-access latency and the undocumented Recipe
UI, not engineering.

---

## B. Chainlink — $500 continuity + $2,500 open (Confidential Workflows)

### Prize text (<https://ethglobal.com/events/ethonline2026/prizes>, Chainlink)

- **Best Chainlink-Powered Upgrade — $500, continuity-only.** Integrate CRE, Price Feeds, Data
  Streams, Proof of Reserve, or VRF; "The Chainlink integration must contribute to a state
  change on a blockchain."
- **Best Confidential Workflow — $3,000 total, up to 2 teams × $1,250, open.** Must "register
  and use a confidential TEE handler, such as `handlerInTee` in TypeScript or
  `cre.HandlerInTee` in Go"; the confidential portion must process ≥1 sensitive input inside
  the enclave; must be meaningfully integrated into core functionality. **Simulation is
  explicitly sufficient**: "A Confidential Workflow simulation using the CRE CLI or a live
  deployment on the CRE network."

### Does CRE support Arc?

**Yes — Arc Testnet is a listed CRE network.** From
<https://docs.chain.link/cre/supported-networks-ts> (fetched as
`https://docs.chain.link/cre/supported-networks-ts.md`, Last Updated 2026-08-26), Testnets
table:

```
| Arc Testnet                 | v1.0.7+  | v1.1.4+  | v1.3.1+  |
```

i.e. CRE CLI ≥ v1.0.7, Go SDK ≥ v1.1.4, TS SDK ≥ v1.3.1.

Chain-id corroboration: `smartcontractkit/chain-selectors` `selectors.yml` contains

```yaml
  5042002:
    selector: 3034092155422581607
    name: "arc-testnet"
    network_type: testnet
```

— <https://github.com/smartcontractkit/chain-selectors/blob/main/selectors.yml>. That is
ARCADE's exact chain id.

Caveats, from the same supported-networks page: chain IDs and forwarder addresses are **not**
published inline; "To see which chains and forwarder addresses are enabled for **your**
organization, run `cre workflow supported-chains` after `cre login`." Forwarder directory:
<https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory> (tables are
client-rendered; I could not confirm an Arc forwarder address from the static page — verify
with the CLI). Onchain write docs:
<https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts>.
Mainnet chains listed include Ethereum, Base, Arbitrum, OP, Polygon, Monad, MegaETH etc.;
Solana is **write-only**.

### CRE mechanics

Workflows are written in Go or TypeScript, compiled to WASM, and executed across a DON with BFT
consensus — <https://docs.chain.link/cre>. Simulation "compiles your workflows into WebAssembly
and runs them on your machine — but makes **real calls** to live APIs and public EVM
blockchains" (same page).

### Confidential Workflows

`cre.handlerInTee(trigger, fn, tees)` (TS) / `cre.HandlerInTee` (Go); `runtime.getSecret({id})`
inside the enclave; `runtime.usingTheDons()` to cross back for consensus operations —
<https://docs.chain.link/cre-templates/hello-confidential-workflows>. Templates:
<https://github.com/smartcontractkit/cre-templates/tree/main/starter-templates/confidential-workflows>
(TS + Go; AI Audit Firewall, Automated Liquidation Protection, Portfolio Rebalancing). Related
capability: Confidential HTTP keeps credentials, request-body fields and response bodies
confidential from node operators, with optional AES-GCM `EncryptOutput` —
<https://docs.chain.link/cre/capabilities/confidential-http-ts>.

**Access gate:** "Confidential Workflows is currently in private beta and is invite-only" —
<https://docs.chain.link/cre/account/confidential-workflows-access>. **But the same page says:
"After submitting your request, you don't need to wait for early access. Your CRE organization
can run Confidential Workflows using the local simulator."** Combined with the prize accepting
simulation, this is unblocked. Note the Go templates are "pinned to an unreleased commit"
(cre-templates README) — prefer TypeScript, which also matches ARCADE's stack.

### Realistic fit for an agent marketplace

Two honest options:

1. **$500 continuity (weaker).** Needs "a state change on a blockchain". ARCADE settles on Arc
   already; a CRE workflow writing e.g. an aggregated seller reputation / rolling
   settled-volume attestation to a small Arc contract via the CRE forwarder would qualify —
   *if* an Arc forwarder is enabled for your tenant. That is a real unknown (needs `cre login`
   + `cre workflow supported-chains`) and requires deploying a consumer contract, which ARCADE
   currently doesn't have shipped (`FeeSplitter.sol` is conditional per CLAUDE.md). Also needs
   CRE **deploy access** for a live write, which is a separate gate
   (<https://docs.chain.link/cre/account/deploy-access>).
2. **$2,500 confidential (better shaped, but off-thesis).** ARCADE's core thesis is "seller
   code never leaves the seller's machine" — a TEE that runs a skill with the seller's secrets
   inside an enclave is a genuinely coherent extension (a *hosted* seller lane where the
   secrets are released by the Vault DON into the enclave rather than living on the seller's
   box). Simulation-only is accepted. But it is a second engine lane, not a tweak.

### Fit verdict: **MEDIUM** — leaning medium-weak on the $500, medium on the $2,500

The Arc support is a genuinely good surprise (most sponsors have never heard of chain
5042002), and it is the only sponsor here with first-class Arc testnet support. But both
tracks need net-new surface: a consumer contract + forwarder for one, a TEE execution lane for
the other. Neither is a 2-hour bolt-on.

**Effort: $500 track ~8–14 h** (contract + workflow + tenant/forwarder verification, high
unknown-risk on the Arc forwarder). **$2,500 track ~10–16 h** (TS workflow from the template,
simulator only, no deploy gate — lower risk, larger prize, but it is a new lane and the judges
want it "meaningfully integrated into core functionality").

---

## C. Privy — $5,000 (2 × $2,500, open tracks)

### Prize text (<https://ethglobal.com/events/ethonline2026/prizes>, Privy)

- **Best B2B Financial Product — $2,500**: Privy as a core component; ≥1 Privy wallet; a
  business/organization use case; ≥1 functional B2B workflow (payment, approval, treasury
  operation, or wallet administration); **≥1 Privy control (policies, signers, key quorums, or
  intents)**; working demo + source.
- **Best Financial Flow — $2,500**: ≥1 Privy wallet; ≥1 functional financial flow using a
  generally available feature (transfers, bridging, stablecoin conversions, swaps, Earn vaults,
  onramps, supported wallet actions); working demo + source.

Both are **open**, not continuity-restricted — an ARCADE extension is eligible.

### Server wallets + policies (the autonomous-buyer fit)

- **Server wallets via REST**: `POST https://api.privy.io/v1/wallets` with `chain_type`
  (`'ethereum' | 'solana' | ...`) — <https://docs.privy.io/basics/rest-api/quickstart> and
  <https://docs.privy.io/wallets/wallets/create/create-a-wallet>. Chain *type* is fixed at
  creation; the specific network is chosen per transaction.
- **Policy engine**: "Privy's policy engine gives your application programmable control over how
  every wallet can be used… define enforceable rules at the key level." Configurable:
  transfer limits, time-bound signers, allowlists/denylists of transfer recipients, allowlists/
  denylists of **smart contracts**, allowlists/denylists of **networks**, key-export windows,
  "granular constraints around calldata and parameters that can be passed to smart contracts",
  and EIP-712 typed-data restrictions. Policies are `policy → rules → conditions`; "If no rules
  resolve, the policy will default to `DENY`." — <https://docs.privy.io/controls/policies/overview>.
  Manageable via Dashboard, Node SDK, or REST (<https://docs.privy.io/controls/policies/create-a-policy>).
- **Key quorum** (approval workflows for organizations):
  <https://docs.privy.io/controls/authorization-keys/keys/create/key-quorum>.
- **Intents**: <https://docs.privy.io/transaction-management/intents/create/execute-rpc>.
- **Server-side signing** with an authorization context:
  <https://docs.privy.io/controls/authorization-keys/using-owners/sign/signing-on-the-server>.

This is an almost exact match for ARCADE's buyer agent: a server-held wallet, a **per-transaction
USDC cap**, a **contract allowlist** pinned to `0x3600…0000` (Arc USDC), and a **network
allowlist** pinned to `eip155:5042002` — with `DENY` as the default. That is the "agent budget"
story ARCADE already tells, enforced by an outside key-management layer instead of by ARCADE's
own code.

### Does Privy support Arc (5042002)?

**Not named — but the chain is specified as an arbitrary CAIP-2 id.**
<https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction> documents a `caip2`
field: "The CAIP2 chain ID of the chain the transaction is being sent on", format
`"eip155:${number}"`, with examples `eip155:1`, `eip155:8453`, `eip155:11155111`.

Chain-support tiers — <https://docs.privy.io/wallets/overview/chains>: Tier 1 create/export +
sign hashes and messages; Tier 2 adds *sign transactions*; Tier 3 adds *send transactions*
(Privy signs, broadcasts and tracks). Tier 3 lists "Ethereum — **Includes EVM-compatible
networks**", Solana, and Tempo. The page states "Privy is continuously adding new chains" and
directs coverage questions to support@privy.io — it does **not** publish an exhaustive eip155
allowlist, so whether Privy will *broadcast* on Arc testnet (it needs an Arc RPC) is unverified.

**Mitigation that removes the risk entirely:** use
<https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-transaction> — "Sign an
Ethereum/EVM transaction **without broadcasting it**" — and broadcast through ARCADE's existing
viem client on `https://rpc.testnet.arc.network`. Signing is Tier 2 and generic; policies are
evaluated on the RPC request regardless. Even better for ARCADE's actual payment path: x402 /
EIP-3009 settlement is an **EIP-712 typed-data signature**, not a broadcast transaction — and
Privy policies explicitly cover "restrictions around signatures needed for transactions, such
as EVM typed data (EIP712)" (<https://docs.privy.io/controls/policies/overview>). So a Privy
server wallet can hold the buyer key, sign the `transferWithAuthorization` payload under a
policy-enforced cap, and ARCADE submits it. Verify the exact typed-data condition surface
before committing.

### Fit verdict: **STRONG** (best prize-per-effort after Bazantic; largest pool)

Both tracks are open, so no continuity constraint. ARCADE's buyer agent *is* a B2B financial
workflow with a treasury and a spending policy — the sponsor's checklist reads like a
description of ARCADE's buyer SDK. Two × $2,500 from one integration, and the Privy-policy
angle strengthens the product independently (an auditable, externally-enforced agent budget is
a better story than a self-imposed one).

**Effort: ~6–10 hours.** Privy app + server wallet, one policy (network allowlist +
per-transaction USDC cap + USDC-contract allowlist), swap the buyer SDK's local signer for a
Privy signer behind ARCADE's existing `Rail`/signer abstraction, demo a policy denial (a call
over the cap that is refused before settlement — which is also a great demo beat). **Risk:
unverified Arc broadcast support** — budget an hour to test, and fall back to sign-only +
self-broadcast.

---

## D. Uniswap — $2,000 continuity (2 × $1,000)

### Prize text (<https://ethglobal.com/events/ethonline2026/prizes>, Uniswap Foundation)

Continuity track, **$2,000 (1st $1,000 / 2nd $1,000)**. Build on any Uniswap stack component —
"the Uniswap API, the Uniswap AMM (v2, v3, or v4), CCA, or any other Uniswap protocol",
including v4 hooks, upstream repo improvements, and ecosystem tooling.
Requirements: public open-source GitHub repo; **a `FEEDBACK.md` file** and a completed
submission to the Uniswap Developer Feedback Form
(<https://developers.uniswap.org/hackathon-feedback>) that includes the link to your
`FEEDBACK.md`; README clearly identifying the relevant contracts/code.

### Is Uniswap on Arc? **No.**

**v4 deployments** — <https://developers.uniswap.org/docs/protocols/v4/deployments> (canonical;
`docs.uniswap.org/contracts/v4/deployments` 301s here). Mainnets: Ethereum (1), Unichain (130),
OP (10), Base (8453), Arbitrum (42161), Polygon (137), Zora (7777777), World Chain (480),
X Layer (196), Ink (57073), Soneium (1868), Avalanche (43114), BNB (56), Celo (42220), Monad
(143), MegaETH (4326), Tempo (4217), Robinhood Chain (4663). Testnets: Unichain Sepolia (1301),
Sepolia (11155111), Base Sepolia (84532), Arbitrum Sepolia (421614), interop-alpha-0/1.
**No Arc, no 5042002** (grep of the page's markdown for `arc|5042002` returns nothing).

**Trading API supported chains** —
<https://developers.uniswap.org/docs/trading/swapping-api/supported-chains>. Chain IDs listed:
1, 10, 56, 130, 137, 143, 196, 324, 480, 1868, 4217, 4326, 4663, 8453, 42161, 42220, 43114,
57073, 59144, 7777777; testnets 1301, 84532, 11155111. **Arc is absent.** Router addresses are
mirrored at
<https://github.com/Uniswap/sdks/blob/main/sdks/universal-router-sdk/src/utils/constants.ts>.

The Trading API itself is "a hosted API that handles routing, quoting, and transaction
construction", with `/check_approval` → `/quote` → `/swap`; "Your application remains
responsible for wallet signing and submitting transactions onchain" —
<https://developers.uniswap.org/docs/trading/overview> and
<https://developers.uniswap.org/docs/trading/swapping-api/getting-started>.

### Consequence for "swap on settlement"

The obvious ARCADE story — *seller gets paid in USDC on Arc, auto-swaps to another token* —
**cannot be executed on Arc**: no v4 pool, no Universal Router, no Trading API coverage. To use
Uniswap you would have to move value off Arc (a bridge ARCADE does not have) and swap on Base
or Unichain, which breaks the "settled onchain on Arc" thesis and adds a cross-chain dependency
to the demo. Alternatives — a v4 hook or CCA contribution unrelated to Arc, or ecosystem
tooling — are net-new projects, not continuity work on ARCADE.

### Fit verdict: **WEAK**

The only honest paths are (a) bolt a Base/Unichain-side swap onto a demo whose whole point is
Arc, or (b) build something Uniswap-shaped that isn't really ARCADE. Both dilute the core
submission for the smallest realistic payoff. The `FEEDBACK.md` + feedback-form requirement is
trivial, but there's nothing genuine to give feedback *about* unless you actually integrate.

**Effort if pursued anyway: ~10–16 h** for a credible Base-side swap-out lane (bridge/CCTP +
Trading API + signing), with high risk of reading as bolted-on. **Recommendation: skip**, and
spend the hours on Bazantic + Privy instead.

---

## Ranking

| Sponsor | Prize reachable | Verdict | Effort | Note |
|---|---|---|---|---|
| **Bazantic** | up to $3,000 (3 tracks) | **Strong** | 4–8 h | Exact shape match; gated on beta access + undocumented "Recipe" UI |
| **Privy** | $5,000 (2 open tracks) | **Strong** | 6–10 h | Policies = external agent budget; Arc broadcast unverified, sign-only fallback |
| **Chainlink** | $500 continuity / $2,500 open | **Medium** | 8–16 h | Arc Testnet *is* a CRE network; both tracks need net-new surface |
| **Uniswap** | $2,000 continuity | **Weak** | 10–16 h | Not deployed on Arc at all — v4 or Trading API |

Suggested order: **Bazantic first** (signup is the long pole and it gates three pools), **Privy
second** (largest pool, open track, strengthens the product), **Chainlink confidential
third if time allows** (simulation-only, no deploy gate), **skip Uniswap**.
