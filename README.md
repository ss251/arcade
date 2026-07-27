# ARCADE

**Publish a skill or an agent as a paid endpoint on Arc. Get paid per call in USDC.**

You have an agent skill that produces good output — a research routine, a due-diligence brief, a data check. Today it's worth nothing to anyone but you, because the only way to share it is to hand over your prompts and your API keys. ARCADE turns it into a paid endpoint in one command, and **your code, prompts and credentials never leave your machine.**

Buyers are agents. So a seller's agent can itself buy from another seller mid-run — agents hiring agents, each hop settled in USDC on Arc.

```
 SELLER (own machine)              ARCADE                      BUYER (any agent)
┌────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────┐
│ skill/ or agent/       │  │ REGISTRY                 │  │ agent wallet or EOA  │
│  prompts, code, creds  │  │  listings, price, ratings│◀─│                      │
│  NEVER LEAVE ──────────│──│                          │  │ x402 client:         │
│                        │  ├──────────────────────────┤  │  probe→402→sign→retry│
│ RUNNER (daemon)        │◀─│ GATEWAY /x/:seller/:skill│◀─│                      │
│  outbound wss only     │──│  paywall → broker → settle│──│ budgets, receipts    │
│  sandbox per job       │  └──────────────────────────┘  └──────────────────────┘
└────────────────────────┘        settles on Arc testnet
```

---

## Proven on Arc testnet

Not a diagram — a transaction. A buyer signed an authorization **offline, paying zero gas**; the facilitator broadcast it; USDC moved.

| | measured |
|---|---|
| EIP-3009 `transferWithAuthorization` | [`0xc9b77c1e…`](https://testnet.arcscan.app/tx/0xc9b77c1e6c62fec6d10298af0f6cdcfc7f05b3ad6e7ef4ccdbb5a1e6b4ebc2f8) · block 53480033 |
| gas used / cost | 87,153 · **0.002179 USDC** |
| submit → confirmed | **2,173 ms** |
| buyer-side signing | **5 ms, zero gas, no chain interaction** |
| block cadence / finality | ~0.5s · single-block deterministic (Malachite BFT) |

And the full product loop, end to end — 402 → offline signature → job dispatched over websocket to a runner → sandboxed execution → output validated → settled:

| | |
|---|---|
| paid call | [`0x5eb961c0…`](https://testnet.arcscan.app/tx/0x5eb961c09f7acd8960be76e6034c9f7d6a80050e4e7e0f26a61eed1845eb8142) |
| price / seller / fee | $0.01 → $0.0095 seller + $0.0005 platform |
| buyer balance | 19.998375 → 19.988375 USDC (exactly the price) |

### On two machines

The claim that seller code never leaves the seller's machine is unfalsifiable on one host, so it was run across two — hub on a Linux box, runner on a MacBook, connected over Tailscale, with the MacBook working from a **fresh `git clone` of this repo**:

| | |
|---|---|
| paid call | [`0xf45de149…`](https://testnet.arcscan.app/tx/0xf45de149c07385a52b6d3c9aa9d4c4a92fd26736ccbb1434cfc80b4d688f8368) |
| execution | on the MacBook — `[runner] job job_57bed392… succeeded` |
| secrecy assertions | hub log carries no engine/entry/egress · hub API exposes no private field |

Re-runnable evidence: `bun run scripts/g1-live-settle.ts` and `scripts/e2e-two-machine.sh`.

---

## Quickstart

```bash
bun install

# 1. hub
ARCADE_RAIL=eip3009 ARCADE_FACILITATOR_KEY=0x<funded-arc-testnet-key> bun run hub

# 2. seller (any machine — it dials out, no open ports)
bun run arcade init --hub http://<hub-host>:8787   # wallet + config + hub check, one command
bun run arcade status                              # identity, hub, skills, earnings
bun run arcade start

# 3. buyer
ARCADE_BUYER_KEY=0x<testnet-key> bun run arcade-buy usdc-flow-check \
  --input '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' --max-amount 0.05
```

Fund a testnet address at [faucet.circle.com](https://faucet.circle.com) (Arc Testnet, 20 USDC per address / 2h).

See exactly what publishing would reveal — and what it wouldn't:

```bash
bun run arcade publish skills/usdc-flow-check
```

---

## Threat model — stated up front

**What the hub can see:** a listing's public projection (name, description, tags, price, bounds, input/output schemas) and the *outputs* of jobs it paid for.

**What the hub can never see:** your engine choice, entry point, system prompt, secret names, egress rules, working directory, or the code itself. This is enforced *structurally*, not by policy: `toPublicListing` is a schema transformation into a type with nowhere to put those fields, and the runner is pull-model — it dials out and receives jobs, so there is no code path by which credentials could be transmitted. A property test (`packages/core/test/secrecy.property.test.ts`) asserts it over arbitrary generated manifests.

**What this does not protect against:** a seller who deliberately exfiltrates their own secrets from inside their own sandbox. The boundary protects sellers from the platform, not the platform from sellers.

---

## How a call works

1. `POST /x/:seller/:skill` with no payment → **402** with x402 payment requirements.
2. Buyer signs an EIP-3009 authorization **offline** (no gas, no chain round-trip) and retries.
3. Hub **verifies** the authorization — signature, funds, window, replay — *before any work happens*.
4. Job is dispatched over websocket to the seller's runner; returns **202 + job_id** immediately, because real skills take 2s–7min.
5. Runner executes in a sandbox with a scrubbed environment and hard bounds.
6. Output is validated against the listing's declared `outputSchema`.
7. **Only then** is the authorization settled on Arc.

If anything in 5–6 fails — refusal, timeout, bounds breach, empty or non-conforming output, runner death — the authorization is simply never broadcast. **That is the refund.** The buyer pays nothing and gets an honest unsettled receipt.

## Pricing and fees

Sellers set a flat per-call price *and* hard work bounds (`maxTurns`, `maxTokens`, `maxToolCalls`, `timeoutSec`), so an open-ended agent run can't go margin-negative.

The platform fee is **visible on every receipt**. It is accrued and swept rather than settled per call — two on-chain transactions would cost ~4.4% of a $0.10 call on this rail (measured: 0.00218 USDC per settlement). The sweep transaction hash is backfilled into every receipt it covers, so the take-rate stays individually auditable while being batched — the same trick Gateway itself uses.

## Agents hiring agents

An API never buys another API, so supply and demand in an API marketplace are separate populations that both have to be recruited. An agent hires other agents — which makes every seller a buyer the moment its work needs something it cannot produce, and each hop settles on its own.

A skill declares the capability and its ceiling:

```jsonc
"bounds":  { "maxCostUsd": 0.12, "maxSubSpendUsd": 0.02, "timeoutSec": 90 },
"engine":  { "capabilities": ["web-search", "hire-skills"] }
```

and its agent gets a `hire_skill` tool. `counterparty-brief` uses it: given a wallet address the counterparty claims to control, it buys `usdc-flow-check` for a cent rather than taking the claim on faith. One buyer action, two sellers, two settlements — **$0.25 in, ~$0.01 subcontracted**, and both bounds published so a buyer can see how much of the price is being passed on.

**The sandbox never receives a key.** The runner keeps the sub-purchase wallet and brokers each buy over a Unix socket; the skill gets a per-job token — an HMAC over the job id, useless for any other job, revoked when the job ends. The ledger lives in the runner, so `maxSubSpendUsd` is enforced by a process the agent doesn't control. **An injected agent can spend the declared budget and not a cent more, because it never holds the means to.**

Three more things:

- The sub-purchase wallet must be **separate from the payout key**, and the runner refuses to start if they match — the payout key also proves listing ownership, so anything holding it could redirect the seller's own payments.
- **An absent `maxSubSpendUsd` means zero**, never unlimited. Forgetting the bound fails closed.
- The hired result comes back **fenced**, supplied by the runner rather than the seller, because B's output is untrusted input to A — the same problem the buyer has one level up, and easier to forget because A chose B.

[`threat-model.md`](docs/threat-model.md) T-SPEND-002 has the residual: **Low**. What remains is a seller whose own skill goes looking for the socket — their machine, their wallet, not a threat.

## Discovery

`GET /openapi.json` is generated from the live listing set, so it cannot describe a skill nobody is serving. Each listing gets its own concrete operation — not a `/x/{seller}/{skill}` template, which would require the client to already know which sellers exist:

```
POST /x/<seller>/<skill-id>
  requestBody   the listing's declared input schema
  402           x402 payment requirements
  202           jobId + jobToken + status/result URLs
  x-arcade-*    price (human and atomic), bounds, output schema, seller
```

Any agent that reads OpenAPI can find a skill, see its price *before* calling, and call it — no ARCADE-specific client. `GET /.well-known/x402` carries the same thing for clients that speak the protocol and not OpenAPI.

The document is standard OpenAPI 3.1 plus x402, and nothing proprietary: the payment challenge is documented as an ordinary `402` response, and everything the spec has no home for sits under a visibly-ours `x-arcade-` prefix.

For agents there is also an **MCP server** — `bunx arcade-mcp`, six tools, list → describe → quote → call. It enforces a per-call ceiling *and* a cumulative session budget, both refusing before anything is signed, and it hands seller output to the model **fenced and labelled untrusted**, with the raw object in `structuredContent`. A buying agent acts on what it purchases, so a result is an injection vector aimed at the buyer; the safe path is the default one. See `packages/buyer/SKILL.md`, or `GET /skill.md` for a live catalogue generated from current listings.

One field is deliberate. `x-arcade-payment.settlement` is `on-validated-output`. x402 defines no failure semantics at all — its facilitator interface is verify, settle, supported, with no void, capture or refund — and no field anywhere by which a server can *declare* when it settles relative to delivering. Saying so costs two lines, and it is the difference between a courtesy and a contract.

## Layout

| path | what |
|---|---|
| `packages/core` | Effect Schema domain model, tagged errors, USDC atomic math, **the secrecy boundary** |
| `packages/payments` | `Rail` service + `EIP3009Live` · `GatewayLive` · `RailTest` layers |
| `packages/runner` | the `arcade` CLI + seller daemon + `Scope`-managed sandbox |
| `packages/buyer` | buyer SDK (probe→402→sign→retry→poll) + CLI |
| `apps/hub` | registry, paywall, job broker, settle pipeline, receipts, ratings |
| `skills/` | first-party listings |
| `scripts/` | on-chain verification scripts, committed as evidence |

Both payment rails are complete, conformance-tested `Layer`s of one `Rail` service — `ARCADE_RAIL=eip3009` (proven today) or `gateway` (Circle Nanopayments: gas-free, $0.000001 minimum). Choosing one is dependency injection, not a runtime branch, so neither path can silently rot.

## Status

| shipped | next |
|---|---|
| both rails + conformance suite · secrecy boundary + property tests · hub paywall/broker/settle · runner sandbox + engine adapters · buyer SDK/CLI · one-command onboarding · OpenAPI 3.1 discovery · MCP server + skill file · agents hiring agents · 356 tests | Gateway round-trip on Arc · web UI · container sandbox · ratings |

## Verify

```bash
bun test                                                  # 356 tests
bun test packages/core/test/secrecy.property.test.ts      # the thesis
bun test packages/payments/test/rail.conformance.test.ts  # all three rails agree
bunx tsc --noEmit
curl -s localhost:8787/listings/usdc-flow-check | jq 'has("engine")'   # must be false
curl -s localhost:8787/openapi.json | jq '.paths | keys'               # one path per listing
```

Built for the [Encode × Circle Programmable Money hackathon](https://www.encodeclub.com/programmes/arc-hackathon). Author: ss251.
