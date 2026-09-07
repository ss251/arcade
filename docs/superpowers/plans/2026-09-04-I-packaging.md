# Plan I — Circle CLI interop (M9 part 2) + packaging

> Execution update2026-09-08: [Plan I ledger](../sdd/2026-09-04-I-packaging/README.md)
> starts after the merged J offline checkpoints. Existing CLI prerequisites are
> [recorded, not replayed](../../interop/circle-cli.md); I2/I3 live remain paused
> with J4. Template output/acceptance statements below are not evidence of a run.
> Current owner rules: single-threaded, four-worker limits, one full gate per
> commit, exact-one main fast-forward, no push or consumed approval replay.

> September 6, 2026 terminology update: portable folders are now labelled Agent Skill (open standard), per the [specification](https://agentskills.io/specification). This public copy's wording changed; original private records, code behavior and Git history did not. Historical implementation details remain historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove a third-party Circle CLI 1.0.0 agent wallet can pay an ARCADE endpoint that was not changed for it, then package the week: a README that declares what existed before commit `57183db` and what is new, an architecture diagram that shows the new layers, a 2–4 minute human-voiced video, a submission checklist for three partner prizes, two check-ins, and the Sept 16 mainnet flip.

**Architecture:** Nothing in this plan changes settlement behaviour. The interop half adds one capture script, one committed wire fixture and one test that replays that fixture through the *same* decoder the hub uses (`decodeHeaderJson` → `Schema.decodeUnknown(PaymentPayload)`, `apps/hub/src/server.ts:791-796`), so a shape regression fails in CI rather than in front of a judge. The packaging half is generator-first: the continuity table comes from `git log`, the diagram from `scripts/diagram.py`, the video from a manifest in `scripts/demo/`, so every number in the submission is re-derivable and none is typed from memory.

**Tech Stack:** Bun 1.3, TypeScript, Effect Schema, vitest 3, `@circle-fin/cli` 1.0.0 (npm latest, verified 2026-09-04), Python 3 + Excalidraw/CDP for the diagram, ffmpeg/ffprobe for the video, `gh`/`git` for the continuity table.

## Global Constraints

- Never commit `internal/`. No secrets in source or `.env`; the Circle API key is read inside a script via `security find-generic-password -s circle-api-key -w` and never echoed.
- **Never accept Circle's Terms of Use on the user's behalf.** `circle terms accept` and `CIRCLE_ACCEPT_TERMS=1` are both owner-performed. Steps marked **OWNER** stop and hand the command to the human.
- Settle only on success; ERC-8004 / ENS / subgraph / canary side effects never change a settlement outcome and must be best-effort.
- Gates before every commit: `bun run test`, `bunx tsc --noEmit` (or `bun run typecheck`), `bun run web:build` for web changes, `forge test` for contract changes.
- Conventional, small commits; one per task.
- Everything demoable on Arc testnet (chain 5042002) with the live hub `https://arcade-hub-production.up.railway.app` or a local hub per `docs/runbook.md`.
- Third-party x402 clients must keep working on root calls: **no new required header on `POST /x/:seller/:skill`**, no custom EIP-3009 nonce. Task 3 is the proof of that constraint, not an exception to it.
- Event rules that bind this plan (`docs/superpowers/research/ethonline-2026/README.md:9-16`): **max 3 partner prizes** (one partner with several tracks counts once); pre-existing vs new work must be documented; AI use must be attributed **and the planning artifacts must be in the repo**; demo video **2–4 minutes, ≥720p, real human voice — no TTS, no phone recording**.
- **The video's voice is recorded by the owner.** `scripts/narrate.sh` (ElevenLabs) produced the previous hackathon's track and must not be run for this cut. Its glob is `docs/narration/beat-*.txt` and is non-recursive, so the new scripts under `docs/narration/ethonline-2026/` are out of its reach by construction — keep them there.
- Copy rules from spec §4.6 and §6 — say: "hub-committed receipt tree", "the root settlement carries the tree hash on chain", "hop two is the hiring seller's working-capital wallet; the buyer pays exactly the root price", "we never broadcast on failure", "settlement evidence". Never say: "cannot capture", "your budget composes", "reputation score", `getSummary`, or that 8004 gates anything.
- Plan A owns `ChainConfig`, the boot checks and `docs/mainnet-runbook.md`; this plan **executes** the runbook (Task 15) and links it. Do not rewrite it.
- **Depends on / rebase base (spec §13).** This plan is **threaded through the whole week**, not a single stream: Tasks 1–3 (Circle CLI interop) can run from **Sat Sept 6** against the unchanged live endpoint; Task 4–8 from Sept 9; Task 11 on **Mon Sept 8**; Tasks 9–10 and 13–14 after the **Fri Sept 12 noon** freeze; Task 12 on **Thu Sept 11**; Task 15 on **Wed Sept 16**. It **documents** every other plan and therefore lands *last* into any shared file: the canonical order is **A → B → C → D → E → F → G → H → I**. Two files it shares: `README.md` (A corrects the test count in its Task 12; this plan's Task 5 restructures it and Task 15 appends the mainnet evidence — the restructure wins, and it re-derives the test count from a real run) and `docs/runbook.md` (append-only; every plan adds its own `##` section, this plan only links them). It edits no file under `apps/hub`, `apps/web` or `packages/*` source, so it can rebase at any point without a code conflict.
- **Cross-plan names this plan repeats must match their owners:** Plan G serves marketplace stats at `GET /graph/stats` and an optional `graph` key on the listing routes (the hub reads Studio; the README says "the hub reads its own subgraph", never "the web queries The Graph"); Plan F's session header is `x-arcade-session` and its receipt route is `GET /sessions/:id`; Plan E's refusals are `ens_payto_mismatch` and `ens_name_expired`; Plan C's refusal is `listing_delisted`; Plan A's are `input_invalid`, `lineage_invalid`, `lineage_cycle`, `lineage_depth`, `tree_budget_exceeded`. Quote these spellings, never paraphrases of them.

## Calendar

Tasks 1–10 and 14 are order-dependent but date-free. Three tasks are pinned:

| task | date | note |
|---|---|---|
| Task 11 | **Mon Sept 8**, before 09:29 IST | ETHGlobal check-in |
| Task 12 | **Thu Sept 11**, before 09:29 IST | ETHGlobal check-in |
| Task 15 | **Wed Sept 16** | Arc public mainnet; runs *after* the Sept 13 submission, allowed by the Arc prize's Sept 30 window |

Freeze for capture is Fri Sept 12 noon; submission before **Sat Sept 13, 12:00pm EDT**.
- **Owner-performed steps.** Any step marked **OWNER** stops the executor: print the command, hand it to the human, resume on confirmation. The full week's list, with the day each is needed, is `docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

---

## File structure

| file | responsibility |
|---|---|
| `docs/interop/circle-cli.md` (new) | the interop record: CLI version, wallet address, chain token, faucet drip, the paid call and its tx |
| `scripts/capture-x402-header.ts` (new) | a local 402 responder that captures the CLI's payment header and writes a **signature-scrubbed** fixture |
| `packages/payments/test/fixtures/circle-cli-1.0.0-payment.json` (new) | the captured wire shape, committed as evidence |
| `packages/payments/test/circle-cli-interop.test.ts` (new) | replays that fixture through the hub's decoder and asserts the field mapping |
| `scripts/continuity.ts` (new) | generates (and `--check`s) the README continuity table from `git log` |
| `README.md` | the seven-section ETHOnline block; existing product sections kept |
| `scripts/diagram.py` | `SPEC` gains lineage, canary, ERC-8004, ENS, subgraph, sessions |
| `docs/architecture.excalidraw`, `docs/architecture-dark.excalidraw`, `docs/architecture.png`, `docs/architecture-dark.png` | regenerated artefacts |
| `docs/narration/ethonline-2026/README.md`, `beat-1.txt` … `beat-8.txt` (new) | the human-voice script, one file per beat |
| `scripts/narration-budget.sh` (new) | word budget per beat against its window |
| `docs/video/ethonline-2026-shotlist.md` (new) | shot list with timestamps and the exact capture command per beat |
| `scripts/demo/cut-ethonline.py` (new) | the edit manifest; re-uses `scripts/demo/assemble.py` without editing it |
| `docs/submission-checklist.md` (new) | ETHGlobal dashboard fields, three partners, links |
| `docs/feedback/arc-circle.md`, `docs/feedback/thegraph.md`, `docs/feedback/ens.md` (new) | per-partner feedback, one finding per source URL |
| `docs/superpowers/checkins/2026-09-08.md`, `2026-09-11.md` (new) | check-in records |
| `scripts/packaging-evidence.sh` (new) | one command that re-derives every packaging claim |
| `config/chains/arc-mainnet.json` | filled on Sept 16 (created by Plan A Task 10) |

---

### Task 1: Circle CLI 1.0.0 — install, terms (owner), agent wallet on Arc testnet, faucet

**Files:**
- Create: `docs/interop/circle-cli.md`

**Interfaces:**
- Produces: the recorded values every later interop task consumes — `CIRCLE_WALLET_ADDRESS` (the agent wallet's Arc-testnet address) and `CIRCLE_ARC_CHAIN` (the exact `--chain` token the CLI accepts for Arc testnet). Both are written into `docs/interop/circle-cli.md` and are public data.

- [ ] **Step 1: Verify the version before installing anything**

```bash
npm view @circle-fin/cli version dist-tags time.modified
```

Expected (verified 2026-09-04): `version = '1.0.0'`, `dist-tags = { latest: '1.0.0' }`, `time.modified = '2026-08-13T18:58:41.365Z'`. If a newer version has shipped since, record the new number and use it — the fixture filename in Task 2 carries the version, so it must match what is actually installed.

- [ ] **Step 2: Install and confirm**

```bash
npm install -g @circle-fin/cli
circle --version
```

Expected: `1.0.0` (or the version from Step 1). If `circle --version` prints an update notice, note it in the doc; do not act on it mid-plan.

- [ ] **Step 3: Read the terms gate — do not clear it yourself**

```bash
circle terms show --output json
```

If `data.accepted` is `true`, skip to Step 5.

If it is `false`:

```bash
circle terms show --init --output json
```

- [ ] **Step 4: OWNER — accept the terms**

Print the live `termsOfUseUrl`, `privacyPolicyUrl` and `termsNotice` from Step 3's response verbatim (do not paraphrase, do not hardcode), then stop and hand the owner exactly this line to run in their own shell:

```bash
circle terms accept --output json
```

**Do not run it. Do not set `CIRCLE_ACCEPT_TERMS=1`. Do not work around the gate on retry or error recovery** (repo `CLAUDE.md` hard rule 3; `circle:use-agent-wallet` Terms-of-Use Gate). Resume only after the owner confirms and `circle terms show --output json` reports `data.accepted: true`.

- [ ] **Step 5: OWNER — log in (email + OTP)**

```bash
circle wallet status
```

If it prints `Not logged in`, ask the owner for the email address (never guess it), then:

```bash
circle wallet login <owner-email> --type agent --init
```

Parse the request id (a UUID; single-use, expires in 10 minutes) from the output. Ask the owner for the OTP that landed in their inbox, then:

```bash
circle wallet login --type agent --request <request-id> --otp <code>
circle wallet status
```

- [ ] **Step 6: Find the exact Arc chain token, then create the wallet**

The CLI's own list is authoritative — `ARC-TESTNET` is the identifier Circle's Agent Wallets docs use for Arc, and the CLI rejects a chain a seller does not accept with a hint naming the right one.

```bash
circle blockchain list --output json | tee /tmp/circle-chains.json | grep -i arc
```

Record the exact token (expected `ARC-TESTNET`) as `CIRCLE_ARC_CHAIN`. Then:

```bash
circle wallet create --output json | tee /tmp/circle-wallets.json
circle wallet list --chain ARC-TESTNET --type agent --output json
```

`circle wallet create` makes agent-controlled SCA wallets across supported EVM chains; read the Arc row's `address`. Record it as `CIRCLE_WALLET_ADDRESS`.

- [ ] **Step 7: Fund it from the Circle faucet**

The key is read inside the command and never printed. `"native": true` is rejected by this faucet — on Arc, USDC *is* the native token, so `"usdc": true` is the only correct body.

```bash
curl -sS -X POST https://api.circle.com/v1/faucet/drips \
  -H "Authorization: Bearer $(security find-generic-password -s circle-api-key -w)" \
  -H 'content-type: application/json' \
  -d "{\"address\":\"$CIRCLE_WALLET_ADDRESS\",\"blockchain\":\"ARC-TESTNET\",\"usdc\":true}"
```

- [ ] **Step 8: Write the record**

Create `docs/interop/circle-cli.md` with these sections and the real values from Steps 1–7:

```markdown
# Circle CLI interop

A third-party buyer, on Circle's own client, paying an ARCADE endpoint that was not
changed for it. The point of this file is that the endpoint is unchanged: no
ARCADE-specific header, no ARCADE SDK, no custom nonce.

| | |
|---|---|
| client | `@circle-fin/cli` <version> (npm latest, checked <date>) |
| wallet | agent wallet, 2-of-2 MPC, created with `circle wallet create` |
| chain token | `<CIRCLE_ARC_CHAIN>` (from `circle blockchain list`) |
| address | `<CIRCLE_WALLET_ADDRESS>` |
| faucet | `POST https://api.circle.com/v1/faucet/drips` · `usdc: true` (`native: true` is rejected — USDC *is* native on Arc) |
| balance after drip | <amount> USDC |

Terms of Use were accepted by the repository owner in their own shell. No agent in this
repo runs `circle terms accept` and none sets `CIRCLE_ACCEPT_TERMS=1`.

## Observed JSON shapes

<paste the `--output json` responses for `wallet list` and `wallet balance` here, verbatim>
```

- [ ] **Step 9: Run the acceptance check**

```bash
circle wallet balance --address "$CIRCLE_WALLET_ADDRESS" --chain ARC-TESTNET --output json \
  | tee docs/interop/wallet-balance.json \
  | jq -e --arg a "$CIRCLE_WALLET_ADDRESS" 'tostring | contains($a) and (test("0\\.0*$") | not)'
```

Expected: exit 0, and the file shows a non-zero USDC balance. (The assertion is shape-agnostic on purpose — paste the real shape into `docs/interop/circle-cli.md` § "Observed JSON shapes" and tighten it there if you want a stricter check.)

- [ ] **Step 10: Commit**

```bash
git add docs/interop/circle-cli.md docs/interop/wallet-balance.json
git commit -m "docs(interop): Circle CLI 1.0.0 agent wallet on Arc testnet, funded"
```

**Fallback (spec §8 pattern):** if terms are declined, login fails, or `circle wallet create` returns no Arc row, stop the live half here and go to Task 2 anyway — the compatibility test stands on the fixture already proven against CLI 0.0.6 (`packages/payments/src/types.ts:57-63`). The README then states: *"Circle CLI interop is shape-verified against the 1.0.0 wire format; the live paid call was not completed."* Never claim a call that did not happen.

---

### Task 2: Capture the CLI's payment header and replay it through the hub's decoder

**Files:**
- Create: `scripts/capture-x402-header.ts`, `packages/payments/test/fixtures/circle-cli-1.0.0-payment.json`, `packages/payments/test/circle-cli-interop.test.ts`

**Interfaces:**
- Consumes: `PaymentPayload`, `PaymentRequirements`, `authorizationOf`, `signatureOf`, `networkOf`, `decodeHeaderJson`, `HEADER_PAYMENT_SIGNATURE`, `HEADER_PAYMENT_LEGACY` from `packages/payments/src/types.ts:11-126`; `CIRCLE_ARC_CHAIN` / `CIRCLE_WALLET_ADDRESS` from Task 1.
- Produces: `packages/payments/test/fixtures/circle-cli-1.0.0-payment.json` — the canonical v2 payload shape a third-party client sends. Any later change to `PaymentPayload` that breaks third-party clients fails this test.

- [ ] **Step 1: Write the failing test**

```ts
// packages/payments/test/circle-cli-interop.test.ts
import { readFileSync } from "node:fs"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  PaymentPayload,
  authorizationOf,
  decodeHeaderJson,
  networkOf,
  signatureOf
} from "../src/types.ts"

// Read rather than `import ... with { type: "json" }`: this test must not depend on
// `resolveJsonModule`, which another plan owns.
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/circle-cli-1.0.0-payment.json", import.meta.url), "utf8")
) as unknown

describe("Circle CLI 1.0.0 payment header", () => {
  it("decodes as a canonical x402 v2 payload", () => {
    const p = Schema.decodeUnknownSync(PaymentPayload)(fixture)
    expect(p.x402Version).toBe(2)
    expect(networkOf(p)).toBe("eip155:5042002")
    expect(p.accepted.scheme).toBe("exact")
    expect(p.accepted.asset.toLowerCase()).toBe("0x3600000000000000000000000000000000000000")
  })

  it("carries the authorization nested under payload, not flat", () => {
    const p = Schema.decodeUnknownSync(PaymentPayload)(fixture)
    const a = authorizationOf(p)
    // Six signed fields, and the signature sits BESIDE them — the flat dialect our own
    // buyer once spoke would fail here, which is the regression this test exists for.
    expect(Object.keys(a).sort()).toEqual(
      ["from", "nonce", "to", "validAfter", "validBefore", "value"]
    )
    expect(a.nonce).toMatch(/^0x[0-9a-fA-F]{64}$/)
    expect(a.to.toLowerCase()).toBe(p.accepted.payTo.toLowerCase())
    expect(a.value).toBe(p.accepted.amount)
    expect(signatureOf(p)).toMatch(/^0x[0-9a-fA-F]{130}$/)
  })

  it("survives the hub's own header path: base64 → decodeHeaderJson → schema", () => {
    // Exactly what apps/hub/src/server.ts:791-796 does with the inbound header.
    const header = Buffer.from(JSON.stringify(fixture), "utf8").toString("base64")
    const decoded = decodeHeaderJson(header)
    expect(() => Schema.decodeUnknownSync(PaymentPayload)(decoded)).not.toThrow()
  })

  it("advertises a Gateway-compatible validity window", () => {
    const p = Schema.decodeUnknownSync(PaymentPayload)(fixture)
    const a = authorizationOf(p)
    expect(Number(a.validBefore) - Number(a.validAfter)).toBeGreaterThanOrEqual(604_800)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run packages/payments/test/circle-cli-interop.test.ts`
Expected: FAIL — `ENOENT` on `fixtures/circle-cli-1.0.0-payment.json`.

- [ ] **Step 3: Write the capture script**

```ts
#!/usr/bin/env bun
// scripts/capture-x402-header.ts
//
// Capture the exact payment header a third-party x402 client sends, so the hub's decoder
// can be tested against a real client instead of against our own buyer's dialect.
//
//   bun run scripts/capture-x402-header.ts            # listens on :8799
//   circle services pay http://localhost:8799/x/demo/usdc-flow-check -X POST \
//     --address "$CIRCLE_WALLET_ADDRESS" --chain ARC-TESTNET --max-amount 0.05 \
//     --data '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' --output json
//
// ## Why the signature is scrubbed before anything touches disk
//
// A signed EIP-3009 authorization is a BEARER INSTRUMENT: anyone holding it can broadcast
// it and move the buyer's USDC until its nonce is consumed. This endpoint settles nothing,
// so the captured authorization stays live — committing it verbatim would publish a
// spendable claim on the CLI wallet. The signature is therefore replaced with a
// well-formed dummy before the fixture is written, and the raw value is never written at
// all. The test asserts SHAPE, which is what interop means here; signature validity is
// already covered by the rail conformance suite.
import { mkdirSync, writeFileSync } from "node:fs"

const PORT = Number(process.env["PORT"] ?? 8799)
const PAY_TO = process.env["CAPTURE_PAY_TO"] ?? "0x000000000000000000000000000000000000dEaD"
const PRICE_ATOMIC = process.env["CAPTURE_PRICE_ATOMIC"] ?? "10000" // $0.01, 6-dec atomic
const OUT = new URL(
  "../packages/payments/test/fixtures/circle-cli-1.0.0-payment.json",
  import.meta.url
).pathname

const DUMMY_SIG = `0x${"11".repeat(65)}`

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)
    const header =
      req.headers.get("payment-signature") ?? req.headers.get("x-payment")

    if (header === null) {
      // The same envelope the hub's rail emits: v2 field names, CAIP-2 network,
      // ≥7-day window so a Gateway client can sign the identical challenge.
      return Response.json(
        {
          x402Version: 2,
          error: "payment required",
          accepts: [
            {
              scheme: "exact",
              network: "eip155:5042002",
              amount: PRICE_ATOMIC,
              asset: "0x3600000000000000000000000000000000000000",
              payTo: PAY_TO,
              resource: `${url.origin}${url.pathname}`,
              description: "capture probe",
              mimeType: "application/json",
              maxTimeoutSeconds: 604900,
              extra: {}
            }
          ]
        },
        { status: 402 }
      )
    }

    const raw = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      payload?: { signature?: string }
    }
    if (raw.payload !== undefined) raw.payload.signature = DUMMY_SIG
    mkdirSync(new URL(".", `file://${OUT}`).pathname, { recursive: true })
    writeFileSync(OUT, `${JSON.stringify(raw, null, 2)}\n`)
    console.log(`captured → ${OUT} (signature scrubbed)`)
    // 200 so the client exits cleanly. Nothing is settled and nothing is executed.
    return Response.json({ captured: true }, { status: 200 })
  }
})

console.log(`listening on http://localhost:${server.port} — run the client now`)
```

- [ ] **Step 4: Capture against the real client**

In one shell:

```bash
CAPTURE_PAY_TO=0x000000000000000000000000000000000000dEaD bun run scripts/capture-x402-header.ts
```

In another, with the values recorded in Task 1:

```bash
circle services pay "http://localhost:8799/x/demo/usdc-flow-check" \
  -X POST \
  --address "$CIRCLE_WALLET_ADDRESS" \
  --chain ARC-TESTNET \
  --max-amount 0.05 \
  --data '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' \
  --output json
```

Then confirm nothing spendable was written:

```bash
jq -e '.payload.signature == "0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"' \
  packages/payments/test/fixtures/circle-cli-1.0.0-payment.json
```

If the CLI refuses `--chain ARC-TESTNET`, read its hint — the hint is authoritative — and use the token it names, updating `docs/interop/circle-cli.md`.

- [ ] **Step 5: Run the test**

Run: `bunx vitest run packages/payments/test/circle-cli-interop.test.ts`
Expected: PASS, 4 tests.

If assertion 2 fails on key names, **do not edit the assertion to match** — the whole point is to learn the real shape. Update `PaymentPayload` only if the CLI is right and we are wrong, and re-run `bunx vitest run packages/payments packages/buyer` to see what else moves.

- [ ] **Step 6: Full gates and commit**

```bash
bun run test && bunx tsc --noEmit
git add scripts/capture-x402-header.ts packages/payments/test/fixtures packages/payments/test/circle-cli-interop.test.ts
git commit -m "test(payments): replay Circle CLI 1.0.0's payment header through the hub decoder"
```

---

### Task 3: `circle services pay` against the unchanged live endpoint

**Files:**
- Modify: `docs/interop/circle-cli.md`

**Interfaces:**
- Consumes: `CIRCLE_WALLET_ADDRESS`, `CIRCLE_ARC_CHAIN` (Task 1).
- Produces: `CIRCLE_CLI_SETTLE_TX` — the Arcscan tx hash quoted in the README (Task 5), the shot list (Task 8) and the submission (Task 13).

- [ ] **Step 1: Find a live paid path**

```bash
curl -s https://arcade-hub-production.up.railway.app/openapi.json \
  | jq -r '.paths | keys[] | select(startswith("/x/"))'
```

Expected: at least one `/x/<seller>/<skill>`. **If the list is empty, no runner is connected** — the OpenAPI document is generated from the live listing set, so it cannot advertise a skill nobody is serving. Start one against the public hub per `docs/runbook.md` § "Repointing the runner at the public hub", then re-run this step.

Export the path: `export ARCADE_PATH=/x/<seller>/<skill>` and `export ARCADE_URL=https://arcade-hub-production.up.railway.app$ARCADE_PATH`.

- [ ] **Step 2: Confirm the 402 the CLI will read, unchanged**

```bash
curl -s -X POST "$ARCADE_URL" | jq '.x402Version, .accepts[0] | {scheme, network, amount, asset, payTo, maxTimeoutSeconds}'
circle services inspect "$ARCADE_URL" --output json
```

Expected: `x402Version: 2`, `network: "eip155:5042002"`, `asset: 0x3600…0000`, `maxTimeoutSeconds: 604900`. Read `method` from `inspect` and pass it explicitly in Step 4 — the CLI defaults to POST when `--data` is present, and a method mismatch is rejected *after* settlement, burning funds for no data.

- [ ] **Step 3: Estimate before spending**

```bash
circle services pay "$ARCADE_URL" --address "$CIRCLE_WALLET_ADDRESS" --chain ARC-TESTNET --estimate
```

Expected: price, chain, scheme and seller, with nothing signed. Confirm the price is at or under $0.05.

- [ ] **Step 4: Pay**

```bash
circle services pay "$ARCADE_URL" \
  -X POST \
  --address "$CIRCLE_WALLET_ADDRESS" \
  --chain ARC-TESTNET \
  --max-amount 0.05 \
  --data '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' \
  --output json | tee /tmp/circle-pay.json
```

The response is the endpoint's own body: `202` with `job_id`, `job_token` and `poll_url` (real skills take 2s–7min, so the paid call cannot block).

- [ ] **Step 5: Poll to the receipt and read the tx**

```bash
POLL=$(jq -r '.poll_url // .data.poll_url' /tmp/circle-pay.json)
until curl -s "$POLL" | jq -e '.status != "queued" and .status != "running"' >/dev/null; do :; done
curl -s "$POLL" | jq '{status, settled: .receipt.settled, tx: .receipt.settleTx, price: .receipt.priceAtomic}'
```

Record `settleTx` as `CIRCLE_CLI_SETTLE_TX` and open `https://testnet.arcscan.app/tx/$CIRCLE_CLI_SETTLE_TX`.

- [ ] **Step 6: Append the record**

Add to `docs/interop/circle-cli.md`:

```markdown
## The paid call

| | |
|---|---|
| endpoint | `POST <ARCADE_PATH>` on the live hub — unchanged, no ARCADE-specific header |
| client | `circle services pay … --chain ARC-TESTNET --max-amount 0.05 -X POST --data '<input>'` |
| price | $<price> |
| job | `<job_id>` → settled |
| tx | [`<CIRCLE_CLI_SETTLE_TX>`](https://testnet.arcscan.app/tx/<CIRCLE_CLI_SETTLE_TX>) |

The hub's paid endpoint required nothing ARCADE-specific for this call. A hire, by
contrast, carries `x-arcade-hire-capability` — and that header is optional: absent means a
root call, which is what a third-party client always makes.
```

- [ ] **Step 7: Commit**

```bash
git add docs/interop/circle-cli.md
git commit -m "docs(interop): Circle CLI 1.0.0 pays an unchanged ARCADE endpoint on Arc testnet"
```

**Acceptance:** `curl -s "$POLL" | jq -e '.receipt.settled == true and (.receipt.settleTx | startswith("0x"))'` exits 0.

---

### Task 4: The continuity table generator

**Files:**
- Create: `scripts/continuity.ts`

**Interfaces:**
- Produces: `bun run scripts/continuity.ts` prints the markdown block; `bun run scripts/continuity.ts --check` exits 1 when `README.md`'s block between `<!-- continuity:start -->` and `<!-- continuity:end -->` is stale. Task 5 pastes the output; Task 14 runs the check.

- [ ] **Step 1: Establish the two facts the generator is built on**

```bash
git log --oneline | wc -l
git log --format='%h %ad %s' --date=short | tail -1
git log --format='%h %ad' --date=short -1 57183db
```

Expected (checked 2026-09-04): 112 commits; first `aa466f2 2026-07-25 feat: ARCADE — publish agent skills as paid endpoints on Arc`; `57183db 2026-08-07`. `57183db` is the boundary: everything through it is the Encode × Circle hackathon, everything after is ETHOnline 2026.

- [ ] **Step 2: Write the generator**

```ts
#!/usr/bin/env bun
// scripts/continuity.ts
//
// The README's continuity table, derived from git rather than typed from memory.
//
//   bun run scripts/continuity.ts            # print the block
//   bun run scripts/continuity.ts --check    # fail if README.md's block is stale
//
// Each plan letter owns a set of paths — read out of that plan's own "File structure"
// table, so the mapping cannot drift from the plans. Ranges INTERLEAVE (streams ran in
// parallel on separate branches), so the count is the authoritative number and the compare
// link is a convenience that will contain neighbouring commits. The table says so.
import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"

const BASE = "57183db" // last commit of the Encode × Circle hackathon, 2026-08-07
const REPO = "https://github.com/ss251/arcade"
const PLANS = "docs/superpowers/plans"
const START = "<!-- continuity:start -->"
const END = "<!-- continuity:end -->"

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim()

const pathsOf = (file: string): string[] => {
  const body = readFileSync(`${PLANS}/${file}`, "utf8")
  const table = body.split(/^## File structure$/m)[1]?.split(/^---$/m)[0] ?? ""
  const out = new Set<string>()
  for (const line of table.split("\n")) {
    const m = /^\|\s*`([^`]+)`/.exec(line.trim())
    if (m === null) continue
    // "apps/hub/src/server.ts:123-145" and "x.ts` (new)" both reduce to the bare path.
    const p = m[1]!.split(":")[0]!.trim()
    if (p.length > 0) out.add(p)
  }
  return [...out]
}

const rows: string[] = []
const unmapped: string[] = []
for (const file of readdirSync(PLANS).sort()) {
  const m = /^2026-09-04-([A-I])-(.+)\.md$/.exec(file)
  if (m === null) continue
  const letter = m[1]!
  const stream = m[2]!.replace(/-/g, " ")
  const paths = pathsOf(file)
  if (paths.length === 0) {
    unmapped.push(file)
    continue
  }
  const shas = git("log", "--format=%h", `${BASE}..HEAD`, "--", ...paths).split("\n").filter(
    (s) => s.length > 0
  )
  if (shas.length === 0) {
    rows.push(`| ${letter} | ${stream} | 0 | not started |`)
    continue
  }
  const last = shas[0]!
  const first = shas[shas.length - 1]!
  rows.push(
    `| ${letter} | ${stream} | ${shas.length} | [\`${first}…${last}\`](${REPO}/compare/${first}^...${last}) |`
  )
}

const head = git("rev-parse", "--short", "HEAD")
const before = git("rev-list", "--count", BASE)
const after = git("rev-list", "--count", `${BASE}..HEAD`)
const firstDate = git("log", "--format=%ad", "--date=short").split("\n").pop() ?? ""

const block = [
  START,
  "",
  `**Pre-existing** — ${before} commits from ${firstDate} through [\`${BASE}\`](${REPO}/commits/${BASE}) (2026-08-07), built for the Encode × Circle Arc hackathon.`,
  "",
  `**New at ETHOnline 2026** — ${after} commits, [\`${BASE}…${head}\`](${REPO}/compare/${BASE}...${head}).`,
  "",
  "| plan | stream | commits | range |",
  "|---|---|---|---|",
  ...rows,
  "",
  "Streams ran in parallel on separate branches, so the ranges above interleave — the commit *count* is the authoritative figure and the compare link will include neighbouring commits. Each plan's owned paths are the first column of its own `## File structure` table in `docs/superpowers/plans/`.",
  "",
  END
].join("\n")

if (unmapped.length > 0) {
  console.error(`no "## File structure" rows in: ${unmapped.join(", ")}`)
  process.exit(1)
}

if (process.argv.includes("--check")) {
  const readme = readFileSync("README.md", "utf8")
  const i = readme.indexOf(START)
  const j = readme.indexOf(END)
  if (i === -1 || j === -1) {
    console.error(`README.md has no ${START} / ${END} markers`)
    process.exit(1)
  }
  const current = readme.slice(i, j + END.length)
  if (current.trim() !== block.trim()) {
    console.error("README.md continuity block is stale — run: bun run scripts/continuity.ts --write")
    process.exit(1)
  }
  console.log("continuity block is current")
  process.exit(0)
}

if (process.argv.includes("--write")) {
  const readme = readFileSync("README.md", "utf8")
  const i = readme.indexOf(START)
  const j = readme.indexOf(END)
  if (i === -1 || j === -1) {
    console.error(`README.md has no ${START} / ${END} markers`)
    process.exit(1)
  }
  writeFileSync("README.md", readme.slice(0, i) + block + readme.slice(j + END.length))
  console.log("README.md continuity block updated")
  process.exit(0)
}

console.log(block)
```

- [ ] **Step 3: Run it**

Run: `bun run scripts/continuity.ts`
Expected: the header lines with real counts, and one row per plan file present. Today (only Plans A and I exist) that is two rows; re-running after B–H land fills the rest. `--check` fails until Task 5 adds the markers — that is correct, and Task 5's Step 6 clears it.

- [ ] **Step 4: Commit**

```bash
git add scripts/continuity.ts
git commit -m "feat(scripts): derive the README continuity table from git"
```

---

### Task 5: README restructure — the seven ETHOnline sections

**Merge notes.** `README.md` is the one source file this plan rewrites. Plan A Task 12 has already replaced the stale `"366 tests"` line, and Plans E, F and G each append a feature line. **I lands last** — rebase onto `main` after Plan H merges, absorb whatever lines those plans added into the new seven-section structure rather than dropping them, and re-derive the test count from a real `bun run test` (never quote a total the command does not print). Task 15 later *appends* the mainnet evidence section to this same file; it does not re-restructure it.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `scripts/continuity.ts` (Task 4), `CIRCLE_CLI_SETTLE_TX` (Task 3), `docs/mainnet-runbook.md` (Plan A Task 12).
- Produces: the `<!-- continuity:start -->` / `<!-- continuity:end -->` markers that Task 14's evidence script checks.

Plan A Task 12 already replaces the stale "366 tests" line. This task supersedes that line with a generated one and adds the block. If Plan A has not landed, do both here.

- [ ] **Step 1: Get the real test count**

```bash
bun run test 2>&1 | tail -20
```

Record the two numbers the run prints (vitest and `bun test .bun.test`) and their sum. The research dossier measured 475/480 vitest + 25/27 bun on 2026-09-04 and flagged the 7 failures as spawn timeouts on that host, not logic — if failures appear, say so in the README with that qualification or fix them; **do not quote a passing total that the command does not print.**

- [ ] **Step 2: Insert the block**

Insert one H2 immediately after the architecture `<picture>` block and its `<sub>` caption in `README.md`, with the seven sections as H3s in exactly this order. Keep every existing product section below it, unchanged.

````markdown
## ETHOnline 2026

### Continuity declaration

<!-- continuity:start -->
<!-- continuity:end -->

Generated by `bun run scripts/continuity.ts --write`; `--check` fails CI when it is stale.

### Reused unchanged

These carried over from the first hackathon and were not modified this week. They are load-bearing, and they are not new work:

| component | where | why it did not change |
|---|---|---|
| the secrecy boundary | `packages/core/src/manifest.ts` | `toPublicListing` constructs a public type with nowhere to put a prompt; a new private field cannot leak by omission |
| EIP-3009 rail | `packages/payments/src/eip3009.ts` | proven on Arc testnet in July; this week only added an optional tree argument to `settle` |
| `RailTest` + the rail conformance suite | `packages/payments/test/rail.conformance.test.ts` | one suite all rails are held to |
| pull-model runner + sandbox | `packages/runner` | the runner dials out; there is no inbound path to a seller's machine |
| OpenAPI 3.1 / `/.well-known/x402` / `/skill.md` discovery | `apps/hub/src/server.ts` | generated from the live listing set, so it cannot advertise a skill nobody serves |
| per-job hire broker over a Unix socket | `packages/runner/src/hire-broker.ts` | the sandbox never receives a key; this week added lineage *around* it, not inside it |

### AI assistance

Every line of this repository was written with Claude Code (Claude Fable 5.1 and Claude Opus 5), directed by the author. Commits carry `Co-Authored-By: Claude`.

The planning artifacts are in the repo, as the event rules require:

| artifact | what |
|---|---|
| `docs/superpowers/research/ethonline-2026/` | per-sponsor research, every claim carrying its source URL; an X/CT sweep; a three-model debate (`DEBATE/`) and its synthesis |
| `docs/superpowers/specs/2026-09-04-ethonline-continuity-design.md` | the approved design this week was built from |
| `docs/superpowers/plans/` | one implementation plan per workstream, written before the code |
| `docs/superpowers/checkins/` | the Sept 8 and Sept 11 check-in records |

### Tests

<paste the numbers from Step 1, e.g.:> **N tests** — `bun run test` (vitest + `bun test .bun.test`), <date>. Reproduce:

```bash
bun run test
bun test packages/core/test/secrecy.property.test.ts       # the thesis
bun test packages/payments/test/rail.conformance.test.ts    # all rails agree
bun test packages/payments/test/circle-cli-interop.test.ts  # a third-party client's wire shape
bunx tsc --noEmit
```

### Partner prizes

Three partners, which is the event maximum. A partner with several tracks counts once.

| partner | track | what makes it load-bearing here | evidence |
|---|---|---|---|
| **Arc / Circle** | Best DeFi or Agentic Application (Continuity); Launch on Arc Testnet & Push to Mainnet (Continuity) | every settlement is USDC on Arc; the root settlement commits the job tree's hash on chain; Gateway nanopayments as a session rail; a third-party Circle CLI agent wallet pays an unchanged endpoint | [`<CIRCLE_CLI_SETTLE_TX>`](https://testnet.arcscan.app/tx/<CIRCLE_CLI_SETTLE_TX>) · `docs/interop/circle-cli.md` · `docs/mainnet-runbook.md` |
| **The Graph** | Best AI Project (AI tooling / use case) | a paid skill buys its facts from a pinned Base subgraph over x402 at $0.01 a query — remove the payer key and there is no schema-valid output, so Arc settles nothing; the marketplace's own ledger is indexed as a subgraph on `arc-testnet` and the hub reads its stats from Studio and serves them at `GET /graph/stats` | `skills/counterparty-graph/SKILL.md` · `subgraph/` |
| **ENS** | ENSv2 (Sepolia) | names are the hiring interface, not a label: `arcade.payTo` and `arcade.chain` are the authority over where money goes, and the buyer refuses to pay a 402 that disagrees (`ens_payto_mismatch`); subname expiry *is* liveness — a runner that stops renewing loses its listing | `packages/core/src/ens.ts` · demo beat 5 |

### Guarantees, and what is not guaranteed

**Guaranteed:**

- Seller code, prompts, entry points, secret names and egress rules never reach the hub. Structural, not procedural — a property test asserts it over generated manifests.
- Payment is verified before work starts, and the authorization is broadcast only after schema-valid, non-empty output. We never broadcast on failure. That is the refund; there is nothing to refund.
- The body is validated against the listing's declared input schema *before* any payment work — a malformed call gets `400 input_invalid` and no job.
- Hub-committed receipt tree: the root settlement carries the tree hash on chain, so a later receipt cannot omit a child without contradicting Arc.
- Hop two is the hiring seller's working-capital wallet. The buyer pays exactly the root price.
- A hired skill's sub-spend is bounded by the runner — a process the agent inside the sandbox cannot reach and has no key for.

**Not guaranteed:**

- x402 has no void, capture or refund primitive. Our settle-on-validated-output is a declared server policy, published as `x-arcade-payment.settlement`, not a protocol feature.
- Budgets do not compose beyond the declared tree ceiling. The hub's reservation ledger enforces the root listing's `maxSubSpendUsd` across a tree; deeper composition of *buyer* budgets is not claimed.
- ERC-8004 records are settlement evidence, not a score and not a gate. Nothing here reads `getSummary`, and no listing is ranked by feedback.
- ENS expiry is a liveness signal, not a security boundary. A live name does not prove a good skill.
- A pay-test says the listing answered and settled once, recently. It says nothing about answer quality.
- Gateway nanopayments are testnet-only on Arc; Circle publishes no Arc mainnet Gateway contract.
- The secrecy boundary protects sellers from the platform, not the platform from sellers. `docs/threat-model.md` carries the residuals.

### Mainnet

Arc public mainnet goes live **2026-09-16**; as of 2026-09-04 Circle has published no mainnet chain id, RPC or USDC address. So the chain is configuration, not literals: `config/chains/arc-testnet.json` is `ready`, `config/chains/arc-mainnet.json` is `pending`, and a `pending` manifest **refuses to boot the hub** rather than guessing. The flip is a manifest fill plus a redeploy, written out step by step in [`docs/mainnet-runbook.md`](docs/mainnet-runbook.md) and executed on Sept 16 — inside the Arc prize's Sept 30 window. Evidence is appended here when it lands.
````

- [ ] **Step 3: Fill the generated block**

```bash
bun run scripts/continuity.ts --write
```

- [ ] **Step 4: Replace the remaining stale numbers**

```bash
grep -n "366 tests" README.md
```

Expected: no matches (Plan A Task 12 or Step 2 above removed it). If it matches, replace it with the Step 1 figure.

- [ ] **Step 5: Check the section list is exactly right**

```bash
awk '/^## ETHOnline 2026$/,/^## Quickstart$/' README.md | grep '^### '
```

Expected, in this order:

```
### Continuity declaration
### Reused unchanged
### AI assistance
### Tests
### Partner prizes
### Guarantees, and what is not guaranteed
### Mainnet
```

- [ ] **Step 6: Verify and commit**

```bash
bun run scripts/continuity.ts --check
git add README.md
git commit -m "docs(readme): ETHOnline continuity declaration, reuse, AI artifacts, prizes, guarantees, mainnet"
```

---

### Task 6: Architecture diagram — lineage, canary, ERC-8004, ENS, subgraph, sessions

**Files:**
- Modify: `scripts/diagram.py` (the `SPEC` list, `scripts/diagram.py:78-160`)
- Regenerate: `docs/architecture.excalidraw`, `docs/architecture-dark.excalidraw`, `docs/architecture.png`, `docs/architecture-dark.png`

**Interfaces:**
- Consumes: `diagram.py`'s existing helpers — `base`, `text_el`, `width_of`, and the label-expansion in `build()`. A label id missing from `docs/.text-widths.json` falls back to a **generous** estimate (`width_of`, `scripts/diagram.py:181-188`), which over-runs rather than clips, so new labels need no measurement entry.
- Produces: the picture the README and video beat 8 both show.

The current geometry: seller zone `zs` y110 h300, hub zone `zh` y110 h300 with four boxes at y152/216/280/344, buyer zone `zb` y110 h300, chain box `arc` at y474, the law band `law` at y606. Six new facts must land without collisions, so the zones grow to h330 (110–440), the hub gains two rows, and the chain row becomes three boxes with the subgraph beneath.

- [ ] **Step 1: Run the generator to capture the "before"**

```bash
python3 scripts/diagram.py && python3 scripts/diagram.py --dark
git diff --stat docs/
```

Expected: no diff — the checked-in files are already generator output. If there *is* a diff, commit it first; the generator is the source of truth.

- [ ] **Step 2: Edit `SPEC`**

Apply these exact changes in `scripts/diagram.py`.

1. Seller zone gains ENS liveness. Change `zs`'s height and add one box:

```python
    {"t": "rect", "id": "zs", "x": 20, "y": 110, "w": 270, "h": 330, "bg": ZONE_G,
     "stroke": GREEN, "sw": 1, "opacity": 30},
```

and after the `rnl` text element:

```python
    {"t": "rect", "id": "ens", "x": 45, "y": 388, "w": 220, "h": 40, "bg": FILL_G,
     "stroke": GREEN, "label": "renews its ENS name", "size": 15},
```

Also move `rnl` up by 6 so it clears the new box: change its `"y": 368` to `"y": 362`.

2. Hub zone grows and gains two rows. Replace the `zh`, `h1`–`h4` block with six evenly spaced boxes:

```python
    {"t": "rect", "id": "zh", "x": 410, "y": 110, "w": 280, "h": 330, "bg": ZONE_P,
     "stroke": PURPLE, "sw": 1, "opacity": 30},
    {"t": "text", "id": "zhl", "x": 430, "y": 122, "text": "ARCADE HUB", "size": 15,
     "color": PURPLE_D},
    {"t": "rect", "id": "h1", "x": 432, "y": 150, "w": 236, "h": 40, "bg": FILL_P,
     "stroke": PURPLE, "label": "registry — listings, prices", "size": 14},
    {"t": "rect", "id": "h2", "x": 432, "y": 196, "w": 236, "h": 40, "bg": FILL_P,
     "stroke": PURPLE, "label": "input gate — schema before payment", "size": 14},
    {"t": "rect", "id": "h3", "x": 432, "y": 242, "w": 236, "h": 40, "bg": FILL_P,
     "stroke": PURPLE, "label": "paywall — x402 · sessions", "size": 14},
    {"t": "rect", "id": "h4", "x": 432, "y": 288, "w": 236, "h": 40, "bg": FILL_P,
     "stroke": PURPLE, "label": "lineage — hop, ancestors, tree ledger", "size": 14},
    {"t": "rect", "id": "h5", "x": 432, "y": 334, "w": 236, "h": 40, "bg": FILL_P,
     "stroke": PURPLE, "label": "broker — dispatch, bounded", "size": 14},
    {"t": "rect", "id": "h6", "x": 432, "y": 380, "w": 236, "h": 40, "bg": FILL_P,
     "stroke": PURPLE, "label": "settle — on success only", "size": 14},
```

3. Buyer zone grows and gains sessions:

```python
    {"t": "rect", "id": "zb", "x": 810, "y": 110, "w": 270, "h": 330, "bg": ZONE_B,
     "stroke": BLUE, "sw": 1, "opacity": 30},
```

and after `b2l` (whose `"y": 368` becomes `"y": 362`):

```python
    {"t": "rect", "id": "sess", "x": 835, "y": 388, "w": 220, "h": 40, "bg": FILL_B,
     "stroke": BLUE, "label": "session — one deposit, N calls", "size": 14},
```

4. The canary sits above the hub, buying like anyone else. Add after the buyer block:

```python
    {"t": "rect", "id": "can", "x": 432, "y": 62, "w": 236, "h": 40, "bg": FILL_P,
     "stroke": PURPLE, "sw": 1, "label": "canary — pay-tests every listing", "size": 14},
    {"t": "arrow", "id": "f0", "x": 550, "y": 104, "dx": 0, "dy": 40, "stroke": PURPLE,
     "size": 14},
```

5. Re-aim the flow arrows at the new row centres (`f1`–`f5` keep their x, only y moves; `f6` starts below the taller hub):

```python
    {"t": "arrow", "id": "f1", "x": 808, "y": 170, "dx": -116, "dy": 0, "stroke": BLUE_D,
     "label": "1 probe", "size": 14},
    {"t": "arrow", "id": "f2", "x": 692, "y": 216, "dx": 116, "dy": 0, "stroke": PURPLE,
     "label": "2  402", "size": 14},
    {"t": "arrow", "id": "f3", "x": 808, "y": 262, "dx": -116, "dy": 0, "stroke": BLUE_D,
     "label": "3 signed", "size": 14},
    {"t": "arrow", "id": "f4", "x": 408, "y": 308, "dx": -116, "dy": 0, "stroke": PURPLE,
     "label": "4 job", "size": 14},
    {"t": "arrow", "id": "f5", "x": 292, "y": 354, "dx": 116, "dy": 0, "stroke": GREEN,
     "label": "5 result", "size": 14},
    {"t": "arrow", "id": "f6", "x": 550, "y": 440, "dx": 0, "dy": 58, "stroke": USDC,
     "label": "6 settle", "size": 14},
```

6. The chain row becomes three boxes; ENS and 8004 flank Arc. Replace the `arc`/`arcl` block:

```python
    {"t": "rect", "id": "ens2", "x": 40, "y": 498, "w": 240, "h": 70, "bg": FILL_G,
     "stroke": GREEN, "label": "ENSv2 · Sepolia\nnames · payTo · expiry", "size": 14},
    {"t": "rect", "id": "arc", "x": 320, "y": 498, "w": 300, "h": 70, "bg": FILL_ARC,
     "stroke": USDC, "label": "Arc testnet · eip155:5042002\nsettleWithTree(treeHash)", "size": 14},
    {"t": "rect", "id": "r8004", "x": 660, "y": 498, "w": 240, "h": 70, "bg": FILL_B,
     "stroke": BLUE, "label": "ERC-8004 on Arc\nidentity · validation · feedback", "size": 14},
    {"t": "rect", "id": "sg", "x": 940, "y": 498, "w": 140, "h": 70, "bg": FILL_P,
     "stroke": PURPLE, "label": "subgraph\nthe ledger", "size": 14},
    {"t": "text", "id": "arcl", "x": 330, "y": 580, "size": 14, "color": MUTED, "mono": True,
     "text": "USDC 0x3600...0000  —  native gas token AND the ERC-20 prices use"},
```

7. The law band moves down and gains the input gate:

```python
    {"t": "rect", "id": "law", "x": 130, "y": 624, "w": 840, "h": 46, "bg": FILL_LAW,
     "stroke": AMBER, "sw": 1, "opacity": 45, "size": 16,
     "label": "validate input  →  verify payment  →  execute in sandbox  →  validate output  →  settle"},
    {"t": "text", "id": "lawl", "x": 236, "y": 682, "size": 15, "color": MUTED,
     "text": "A job that refuses, times out or returns the wrong shape settles nothing. That is the refund."},
```

- [ ] **Step 3: Regenerate both palettes**

```bash
python3 scripts/diagram.py && python3 scripts/diagram.py --dark
```

Expected: each prints its path and an element count higher than before.

- [ ] **Step 4: Render and look at it**

```bash
python3 scripts/render_diagram.py docs/architecture.excalidraw docs/architecture.png
python3 scripts/render_diagram.py docs/architecture-dark.excalidraw docs/architecture-dark.png
```

`render_diagram.py` drives excalidraw.com through CDP via the `browser-harness` command; that is the established path for the *diagram* and is unrelated to the video's screen capture (Task 9), which must not use it.

Then **open both PNGs and read them.** The failure mode this file's own comments record is silent truncation — a label wider than its measured width renders clipped. Check specifically: `h2`, `h4`, `r8004`, `sg`, `law` and the new two-line labels. If any clips, add a measured width for that id to `docs/.text-widths.json` (the key is `<element-id>_t` for a container label) or shorten the string.

- [ ] **Step 5: Commit**

```bash
git add scripts/diagram.py docs/architecture.excalidraw docs/architecture-dark.excalidraw docs/architecture.png docs/architecture-dark.png docs/.text-widths.json
git commit -m "docs(diagram): lineage, canary, ERC-8004, ENS, subgraph and sessions in the architecture"
```

**Acceptance:** `python3 scripts/diagram.py && python3 scripts/diagram.py --dark && git diff --exit-code docs/architecture.excalidraw docs/architecture-dark.excalidraw` exits 0 — the committed artefact is exactly what the generator produces.

---

### Task 7: Narration scripts for a human voice

**Files:**
- Create: `docs/narration/ethonline-2026/README.md`, `docs/narration/ethonline-2026/beat-1.txt` … `beat-8.txt`, `scripts/narration-budget.sh`

**Interfaces:**
- Produces: eight beat texts consumed verbatim by the burned captions in Task 10 (`scripts/demo/assemble.py` reads `TEXT/<beat>.txt`) and read aloud by the owner in Task 9/10. Beat windows: 30, 22, 45, 23, 32, 20, 23, 30 seconds — 225s total, i.e. 3:45, inside the 2–4 minute rule.

- [ ] **Step 1: Write the budget checker**

```bash
#!/bin/bash
# scripts/narration-budget.sh
#
# A human reads about 150 words a minute in this register — 2.5 words a second. The
# previous cut's budgets were checked by SYNTHESISING the voice and measuring the mp3
# (scripts/narrate.sh). This cut is voiced by a human, per the event rule, so there is no
# mp3 to measure until the take exists. Words per window is the pre-flight proxy.
#
# Over-window is the only failure: a shot can be held longer, but the voice cannot be
# made shorter without cutting words.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IN="$ROOT/docs/narration/ethonline-2026"
WPS=2.5

window_for() {
  case "$1" in
    beat-1) echo 30 ;; beat-2) echo 22 ;; beat-3) echo 45 ;; beat-4) echo 23 ;;
    beat-5) echo 32 ;; beat-6) echo 20 ;; beat-7) echo 23 ;; beat-8) echo 30 ;;
    *) echo 0 ;;
  esac
}

total=0
over=0
for f in "$IN"/beat-*.txt; do
  beat="$(basename "$f" .txt)"
  words="$(wc -w < "$f" | tr -d ' ')"
  win="$(window_for "$beat")"
  [ "$win" -eq 0 ] && { echo "no window for $beat" >&2; exit 1; }
  budget="$(awk -v w="$win" -v r="$WPS" 'BEGIN{printf "%d", w*r}')"
  flag=""
  [ "$words" -gt "$budget" ] && { flag="  <-- OVER"; over=$((over + 1)); }
  total=$((total + win))
  printf '%-8s %3s words / %3s budget (%ss)%s\n' "$beat" "$words" "$budget" "$win" "$flag"
done

printf '\ntotal window: %ss (%dm%02ds)\n' "$total" "$((total / 60))" "$((total % 60))"
[ "$total" -le 240 ] || { echo "OVER 4 minutes — the event rule is 2 to 4" >&2; exit 1; }
[ "$total" -ge 120 ] || { echo "UNDER 2 minutes — the event rule is 2 to 4" >&2; exit 1; }
[ "$over" -eq 0 ] || { echo "$over beat(s) over budget — shorten the TEXT, never rush the read" >&2; exit 1; }
echo "every beat fits its window."
```

```bash
chmod +x scripts/narration-budget.sh
```

- [ ] **Step 2: Run it to verify failure**

Run: `./scripts/narration-budget.sh`
Expected: FAIL — the directory does not exist yet.

- [ ] **Step 3: Write the eight beats**

`docs/narration/ethonline-2026/README.md`:

```markdown
# Narration — ETHOnline 2026 cut

Eight beats, 225 seconds, matching `docs/video/ethonline-2026-shotlist.md`.

**These lines are read by a human.** ETHGlobal's demo-video rule requires a real voice —
no text-to-speech, no phone recording. `scripts/narrate.sh` (ElevenLabs) voiced the
previous hackathon's cut and must not be pointed at this directory; its glob is
`docs/narration/beat-*.txt` and does not recurse, which is why these live one level down.

The text here is also the burned caption text, verbatim, so the video reads with the
sound off. Check the budget with `./scripts/narration-budget.sh` before recording.

Copy rules (spec §4.6, §6): say "hub-committed receipt tree", "the root settlement
carries the tree hash on chain", "hop two is the hiring seller's working-capital wallet",
"we never broadcast on failure", "settlement evidence". Never say "cannot capture",
"your budget composes", or anything that reads as a reputation score or a gate.
```

`beat-1.txt`:

```
This is an Agent Skill (open standard) directory on my laptop. One command turns it into a paid endpoint. Before anything is published, ARCADE shows exactly what leaves this machine — a name, a price, two schemas — and what never does: the prompt, the entry point, the secret names, the code. The same command publishes an MCP server, one listing per tool.
```

`beat-2.txt`:

```
A failed job first, because that is where most payment demos go quiet. The output does not match the listing's own schema. The receipt says unsettled, there is no transaction, and the buyer's balance is unchanged. We never broadcast on failure. There is nothing to refund, because nothing was taken.
```

`beat-3.txt`:

```
Now a buyer agent hires by name. The name resolves on ENS to an endpoint, a payment address and a chain, and if the four-oh-two disagrees with the name, the buyer refuses to pay. One buyer action, three hops. Each hop settles on its own, out of the hiring seller's working-capital wallet — the buyer pays exactly the root price. When the children are done the hub hashes the tree, and the root settlement carries that hash on chain, so a receipt cannot later omit a child without contradicting Arc. Here is the tree, every hop linked to Arcscan. And here is A hiring B hiring A: refused, lineage cycle.
```

`beat-4.txt`:

```
This skill does not guess. Mid-job it buys the facts from a subgraph on Base, a cent a query, paid by the seller out of its own margin. Take the payer key away and the query fails, the output is not schema-valid, and Arc settles nothing. The cost of goods is on the receipt.
```

`beat-5.txt`:

```
Trust here is measured, not claimed. A hub-owned buyer pay-tests every listing on a schedule. This one fails three times and disappears — from the catalogue, from the OpenAPI document, from the skill file. I kill this runner; its name stops being renewed, expires, and the listing goes with it. And on Arc each listing has an ERC-8004 identity, a validation response per job, and feedback written only against settled receipts. Settlement evidence.
```

`beat-6.txt`:

```
Twenty calls. One Gateway deposit, one batched settlement, one session receipt. Nanopayments on Arc testnet, gas-free on both sides. A loop agent stops paying two tenths of a cent in gas on every call it makes.
```

`beat-7.txt`:

```
The marketplace's own ledger is a subgraph. Settlements, trees, agents, validations — queried, not computed by us. And the seller dashboard shows margin per call: price in, inference cost, sub-spend out. Every number on this screen comes from a receipt or from the chain. None of it comes from the seller.
```

`beat-8.txt`:

```
Everything through commit five seven one eight three d b existed before this event: the rails, the secrecy boundary, the hub, one hire hop. Everything after it is this week — the input gate, lineage and the tree ledger, the on-chain tree commitment, three publish adapters, pay-testing, ERC-8004, names, sessions, the subgraph, the web app. The chain itself is configuration. Mainnet is a manifest and a runbook, and it is flipped on September sixteenth.
```

- [ ] **Step 4: Run the budget**

Run: `./scripts/narration-budget.sh`
Expected: PASS — eight rows, none flagged, `total window: 225s (3m45s)`, `every beat fits its window.`

If a beat is over, cut words from the text. Never widen the window past a 240s total.

- [ ] **Step 5: Commit**

```bash
git add docs/narration/ethonline-2026 scripts/narration-budget.sh
git commit -m "docs(video): narration script for the ETHOnline cut, human-voiced"
```

---

### Task 8: Shot list — timestamps and the exact capture command per beat

**Files:**
- Create: `docs/video/ethonline-2026-shotlist.md`

**Interfaces:**
- Consumes: the evidence scripts each earlier plan produces — `scripts/e2e-lineage.sh`, `scripts/e2e-tree-settle.sh`, `scripts/e2e-canary.sh`, `scripts/e2e-graph-cogs.sh`, `scripts/e2e-gateway-session.sh`, `scripts/ens-demo.ts`, `scripts/chain-check.ts` (spec §12), plus `scripts/g1-live-settle.ts` and `scripts/demo/web.sh` which already exist.
- Produces: the take names Task 10's cut manifest reads from `design/takes/ethonline-2026/`.

- [ ] **Step 1: Write the shot list**

Create `docs/video/ethonline-2026-shotlist.md`:

```markdown
# ETHOnline 2026 demo video — shot list

3:45 total, eight beats, 1920×1080. The rule is 2–4 minutes, ≥720p, real human voice.

Recording: `./scripts/demo/rec.sh <take-name> <seconds>` writes
`design/takes/<take-name>.mp4`. Move each finished take into
`design/takes/ethonline-2026/` before the cut.

## The recorder

`rec.sh` is ffmpeg over avfoundation, cropped to Chrome's content area (1864×1080 at
x=56 on a 1920 display, doubled for retina). **macOS `screencapture -v` is not usable
here** — it produces a valid file containing 48 frames, about 0.85 seconds, whatever
duration is requested, and exits 0. A recorder that reports success and captures nothing
is the worst available failure. QuickTime's *New Screen Recording* is the manual
fallback if ffmpeg's avfoundation device is unavailable: set it to the display, record
the beat by hand, export at 1080p, and trim in the cut manifest instead of at the
`-t` flag. Do not screen-record through the browser harness — it drives a page, not the
desktop, and cannot capture a terminal or a native window.

Each take is shot LONGER than its window; the cut trims. Nothing is sped up or looped.

## Beats

| # | window | in → out | take | what is on screen |
|---|---|---|---|---|
| 1 | 30s | 0:00 → 0:30 | `b1-publish` | a SKILL.md dir, then `arcade publish`'s manifest preview: public half vs private half; then `arcade publish mcp://…` writing one manifest per tool |
| 2 | 22s | 0:30 → 0:52 | `b2-failed` | a job whose output fails `outputSchema`; the receipt row reading unsettled with no tx; the buyer balance before and after, identical |
| 3 | 45s | 0:52 → 1:37 | `b3-hire` | hire by ENS name; the confirm card showing the name and `payTo`; three hops settling; the receipt tree with Arcscan links; the root tx showing `SettledTree`; then `A→B→A` refused with `lineage_cycle` |
| 4 | 23s | 1:37 → 2:00 | `b4-graph` | the cost-of-goods skill buying from the Base subgraph at $0.01; the receipt's cost line; the key removed → no schema-valid output → no Arc settlement |
| 5 | 32s | 2:00 → 2:32 | `b5-trust` | canary pay-test failing three times and the listing vanishing from `/listings` and `/openapi.json`; a runner killed and its ENS name expiring; the listing page's ERC-8004 panel |
| 6 | 20s | 2:32 → 2:52 | `b6-session` | `arcade_open_session({budgetUsd})`, twenty calls, one batched Gateway settlement, one session receipt |
| 7 | 23s | 2:52 → 3:15 | `b7-economy` | the subgraph query in Studio; the marketplace page's live stats; the seller dashboard's margin per call |
| 8 | 30s | 3:15 → 3:45 | `b8-continuity` | `bun run scripts/continuity.ts`, the README block, the architecture diagram, `bun run scripts/chain-check.ts --network arc-mainnet` refusing a pending manifest, and `docs/mainnet-runbook.md` |

## Capture commands

Drive each beat from a second shell while `rec.sh` runs; the recorder is
self-terminating, so there is nothing to stop.

```bash
# beat 1 — publish
./scripts/demo/rec.sh b1-publish 45
bun run arcade publish skills/diff-triage          # the SKILL.md adapter
bun run arcade publish mcp://npx:@modelcontextprotocol/server-everything

# beat 2 — the failed job (must run BEFORE any success, so the tape opens honest)
./scripts/demo/rec.sh b2-failed 35
bash scripts/e2e-tree-settle.sh --expect-fail

# beat 3 — hire by name, three hops, cycle refused
./scripts/demo/rec.sh b3-hire 70
bash scripts/e2e-lineage.sh

# beat 4 — cost of goods on Base
./scripts/demo/rec.sh b4-graph 35
bash scripts/e2e-graph-cogs.sh

# beat 5 — pay-tests and liveness
./scripts/demo/rec.sh b5-trust 50
bash scripts/e2e-canary.sh
bun run scripts/ens-demo.ts

# beat 6 — a Gateway session
./scripts/demo/rec.sh b6-session 32
bash scripts/e2e-gateway-session.sh

# beat 7 — the economy
./scripts/demo/rec.sh b7-economy 35
./scripts/demo/web.sh                              # the marketplace and dashboards

# beat 8 — continuity and mainnet
./scripts/demo/rec.sh b8-continuity 45
bun run scripts/continuity.ts
bun run scripts/chain-check.ts --network arc-mainnet   # refuses: pending manifest
```

## Fallback takes

If a live beat will not reproduce during the capture window, shoot the fallback rather
than dropping the beat — a missing beat costs a judging axis, a fallback costs nothing:

| beat | fallback |
|---|---|
| 3 | the hub's receipt tape, where the three hops appear as adjacent rows with separate transactions and separate fee splits, with the unsettled row underneath |
| 4 | the committed fixture run of the Graph skill plus the receipt from the last live run |
| 5 | `docs/interop/circle-cli.md`'s recorded run, and the listing page's pay-test history |
| 6 | the EIP-3009 session fallback (spec §8): the same session surface, per-call settlement, and the README states Gateway as code-complete, unproven |

## Timesheet

Entry points into a take are MEASURED, never estimated. After each shoot, extract frames
and write the real in-points into `scripts/demo/cut-ethonline.py`:

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 design/takes/ethonline-2026/b3-hire.mp4
ffmpeg -v error -ss 12 -i design/takes/ethonline-2026/b3-hire.mp4 -frames:v 1 /tmp/f12.png
```

A previous cut lost a whole pass to an estimated in-point: the hero beat opened on a
near-empty screen while the voice described a card that appeared thirteen seconds later.
The take was healthy, the segment was the right length, the caption was the right words —
it was pointed at the wrong part of the take.
```

- [ ] **Step 2: Check the arithmetic**

```bash
awk -F'|' '/^\| [1-8] \|/ {gsub(/[^0-9]/,"",$3); s+=$3} END {print s" seconds"}' docs/video/ethonline-2026-shotlist.md
```

Expected: `225 seconds` — and it must equal the total from `./scripts/narration-budget.sh`.

- [ ] **Step 3: Commit**

```bash
git add docs/video/ethonline-2026-shotlist.md
git commit -m "docs(video): shot list with timestamps and per-beat capture commands"
```

---

### Task 9: Capture pass — takes and the owner's voice

**Files:**
- Create: `design/takes/ethonline-2026/*.mp4` (untracked working media), `design/narration/ethonline-2026/beat-*.mp3` (untracked)

**Interfaces:**
- Consumes: `docs/video/ethonline-2026-shotlist.md` (Task 8), `docs/narration/ethonline-2026/beat-*.txt` (Task 7).
- Produces: eight takes and eight voice clips named `beat-1` … `beat-8`, which Task 10's manifest reads.

`design/` holds working media and is not part of the source tree; only the final export is tracked (see the existing `design/arcade-cp3.mp4` precedent, tracked in commit `d33b4bc`).

- [ ] **Step 1: Freeze and confirm the demo economy is up**

```bash
bun run test && bunx tsc --noEmit && bun run web:build
bun run scripts/chain-check.ts --network arc-testnet
curl -s https://arcade-hub-production.up.railway.app/openapi.json | jq -r '.paths | keys[] | select(startswith("/x/"))'
```

Expected: gates green, `chain-check` prints ok, and at least three `/x/` paths (the three-hop demo economy from spec §13, Wed 10).

- [ ] **Step 2: Shoot the eight beats**

Run each pair from the shot list's "Capture commands" block, in beat order. After each:

```bash
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=nb_read_frames,width,height -of csv=p=0 \
  design/takes/<name>.mp4
```

Expected: frame count ≈ 30 × requested seconds, `1864,1080`. A take that decodes to a handful of frames is the `screencapture` failure mode — reshoot with `rec.sh`, do not proceed.

Move each accepted take: `mkdir -p design/takes/ethonline-2026 && mv design/takes/b*.mp4 design/takes/ethonline-2026/`.

- [ ] **Step 3: OWNER — record the voice**

Hand the owner `docs/narration/ethonline-2026/` and this instruction:

> Read each `beat-N.txt` aloud, one file per recording, in a quiet room with a USB or
> headset microphone — **not a phone**, and not any TTS voice; ETHGlobal requires a real
> human voice and disqualifies synthesised narration. Aim for the window in the shot list
> (beat 1 is 30 seconds, beat 3 is 45, and so on); the budget checker already confirmed
> the words fit at a normal pace, so read at a normal pace rather than rushing.
> Save the raw files anywhere and tell me the paths.

- [ ] **Step 4: Normalise the voice clips**

The cut reads `<beat>.mp3` at a consistent level:

```bash
mkdir -p design/narration/ethonline-2026
for n in 1 2 3 4 5 6 7 8; do
  ffmpeg -y -v error -i "<owner-raw-beat-$n>" \
    -af "highpass=f=80,afftdn=nr=12,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -c:a libmp3lame -q:a 2 "design/narration/ethonline-2026/beat-$n.mp3"
done
```

- [ ] **Step 5: Check every clip against its window**

```bash
for n in 1 2 3 4 5 6 7 8; do
  printf 'beat-%s %s\n' "$n" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 design/narration/ethonline-2026/beat-$n.mp3)"
done
```

Expected: 30, 22, 45, 23, 32, 20, 23, 30 seconds ± a couple of seconds, summing under 240. A clip **over** its window is the only real failure — the cut can hold a shot longer, but it cannot make the voice shorter. Over-window means re-reading that beat or cutting words from the text (then re-run `./scripts/narration-budget.sh`).

- [ ] **Step 6: Record the timesheet**

For every take, extract frames around the moment the beat's subject appears and note the real in-point. Write those numbers straight into Task 10's manifest; do not estimate them.

```bash
ffmpeg -v error -ss <t> -i design/takes/ethonline-2026/<take>.mp4 -frames:v 1 /tmp/probe.png
```

**Acceptance:** eight takes decode at 1864×1080 with the expected frame counts, and eight mp3s exist whose durations sum to under 240 seconds.

---

### Task 10: Cut, caption and export

**Files:**
- Create: `scripts/demo/cut-ethonline.py`, `design/arcade-ethonline-2026.mp4` (tracked, the deliverable)

**Interfaces:**
- Consumes: `scripts/demo/assemble.py`'s `main`, `CUT`, `TAKES`, `VO`, `TEXT`, `WORK`, `OUT` (`scripts/demo/assemble.py:31-38, 55-93`).
- Produces: the video linked from the submission (Task 13) and the README.

`assemble.py` is not edited. Its constants are module-level, so a sibling script rebinds them and calls `main()` — the CP3 cut stays reproducible byte-for-byte.

- [ ] **Step 1: Write the manifest**

```python
#!/usr/bin/env python3
"""
Cut the ETHOnline 2026 video: takes + the owner's voice + burned captions → one file.

    python3 scripts/demo/cut-ethonline.py

The edit is DATA. `scripts/demo/assemble.py` holds the machinery — segment encoding,
caption cue splitting, the refusal to stretch a take to fit a clip — and is imported
rather than copied or modified, so the previous cut stays reproducible.

Every in-point below is MEASURED off the footage (see the shot list's Timesheet section).
Re-derive them after any reshoot: they do not survive a new take.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import assemble as A  # noqa: E402

A.TAKES = ROOT / "design" / "takes" / "ethonline-2026"
A.VO = ROOT / "design" / "narration" / "ethonline-2026"
A.TEXT = ROOT / "docs" / "narration" / "ethonline-2026"
A.WORK = ROOT / "design" / "work" / "ethonline-2026"
A.OUT = ROOT / "design" / "arcade-ethonline-2026.mp4"

# take, in-point (s), narration beat, tail of silence after the voice (s)
A.CUT = [
    ("b1-publish", 0.0, "beat-1", 1.0),
    ("b2-failed", 0.0, "beat-2", 1.0),
    ("b3-hire", 0.0, "beat-3", 1.2),
    ("b4-graph", 0.0, "beat-4", 1.0),
    ("b5-trust", 0.0, "beat-5", 1.2),
    ("b6-session", 0.0, "beat-6", 1.0),
    ("b7-economy", 0.0, "beat-7", 1.0),
    ("b8-continuity", 0.0, "beat-8", 1.6),
]

if __name__ == "__main__":
    A.main()
```

Replace each `0.0` with the measured in-point from Task 9 Step 6 before the first real run. A beat that needs the picture to change mid-line takes the list form `[("take-a", 0.0, 11.0), ("take-b", 0.0, None)]`, where the last entry absorbs the remainder — beat 8 is the likely candidate (terminal → README → diagram).

- [ ] **Step 2: Run it to verify failure**

Run: `python3 scripts/demo/cut-ethonline.py`
Expected: FAIL with `missing narration: …/design/narration/ethonline-2026/beat-1.mp3` if Task 9 has not run. With the media in place it proceeds.

- [ ] **Step 3: Cut**

Run: `python3 scripts/demo/cut-ethonline.py`
Expected: the segments encode and `design/arcade-ethonline-2026.mp4` is written. The assembler refuses rather than padding if a voice clip outruns its take — if it refuses, reshoot that take longer; do not shorten the voice.

- [ ] **Step 4: Verify the deliverable against the event rule**

```bash
ffprobe -v error -show_entries format=duration -show_entries stream=width,height,codec_name \
  -of default=nw=1 design/arcade-ethonline-2026.mp4
```

Assert all four:

```bash
python3 - <<'PY'
import json, subprocess, sys
p = json.loads(subprocess.run(
    ["ffprobe","-v","error","-print_format","json","-show_format","-show_streams",
     "design/arcade-ethonline-2026.mp4"], capture_output=True, text=True).stdout)
d = float(p["format"]["duration"])
v = next(s for s in p["streams"] if s["codec_type"] == "video")
a = [s for s in p["streams"] if s["codec_type"] == "audio"]
ok = True
for name, cond in [("duration 120-240s", 120 <= d <= 240),
                   ("height >= 720", int(v["height"]) >= 720),
                   ("16:9", int(v["width"]) * 9 == int(v["height"]) * 16),
                   ("has audio", len(a) == 1)]:
    print(("ok  " if cond else "FAIL") + f"  {name}")
    ok = ok and cond
print(f"duration {d:.1f}s  {v['width']}x{v['height']}")
sys.exit(0 if ok else 1)
PY
```

Expected: four `ok` rows, `1920x1080`, duration between 3:30 and 3:50.

- [ ] **Step 5: Watch it once, end to end**

Check the three things the assembler cannot: no beat opens on the wrong part of its take; the captions match the spoken words exactly; nothing on screen says anything from the "never say" list. Fix an in-point by editing the manifest and re-running — that is the whole reason the edit is data.

- [ ] **Step 6: Commit**

```bash
git add scripts/demo/cut-ethonline.py design/arcade-ethonline-2026.mp4
git commit -m "feat(demo): the ETHOnline cut — eight beats, 3:45, human voice"
```

---

### Task 11: Check-in — Monday Sept 8

**Files:**
- Create: `docs/superpowers/checkins/2026-09-08.md`

- [ ] **Step 1: Collect the evidence**

```bash
bun run test 2>&1 | tail -20
bunx tsc --noEmit && echo "typecheck ok"
bun run scripts/continuity.ts
git log --oneline 57183db..HEAD | wc -l
curl -s https://arcade-hub-production.up.railway.app/healthz
```

- [ ] **Step 2: Write the record**

Create `docs/superpowers/checkins/2026-09-08.md`:

```markdown
# Check-in — Mon 2026-09-08

Per ETHOnline's check-in schedule (Sept 8 and Sept 11, 09:29 IST).

## Shipped since the last check-in

<one line per plan letter, from `bun run scripts/continuity.ts`>

## Demoable right now

<what a judge could watch today — a URL, a tx, a command>

## Gates

| gate | result |
|---|---|
| `bun run test` | <N passed> |
| `bunx tsc --noEmit` | <ok / errors> |
| `bun run web:build` | <ok / errors> |
| `forge test` | <ok / errors> |

## Risks and the cut decision

Cut order if behind (spec §13): `openapi` adapter → App Kit funding → Gateway sessions
(fallback to EIP-3009 sessions) → ARCADE subgraph (fallback hub stats) → buyer dashboard
→ ENS liveness-expiry (keep names + payTo lock) → validation registry (keep identity +
feedback). Never cut: input gate, lineage + ledger, FeeSplitterV2 tree commitment,
`skill` + `mcp` adapters, canary pay-tests, Graph skill, ChainConfig + runbook,
marketplace + listing page, README split, video.

Decision today: <cut nothing / cut item N and why>.
```

- [ ] **Step 3: OWNER — post it, then commit**

**OWNER.** Posting to the ETHGlobal check-in form is a submission on the owner's account and
is theirs to make. Hand them the rendered summary and the deadline (**Mon Sept 8, before
09:29 IST**); commit only after they confirm it is posted. See
`docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

Post the same summary in the ETHGlobal check-in, then:

```bash
git add docs/superpowers/checkins/2026-09-08.md
git commit -m "docs(checkin): 2026-09-08"
```

**Acceptance:** `bun run test && bunx tsc --noEmit` green, and the file records the same numbers those commands printed.

---

### Task 12: Check-in — Thursday Sept 11

**Files:**
- Create: `docs/superpowers/checkins/2026-09-11.md`

This is the integration check-in (spec §13, Thu 11: integration, e2e evidence scripts, README split, diagram, mainnet dry run), so it verifies more than Task 11.

- [ ] **Step 1: Run every evidence script end to end**

```bash
bash scripts/e2e-lineage.sh
bash scripts/e2e-tree-settle.sh
bash scripts/e2e-canary.sh
bash scripts/e2e-graph-cogs.sh
bash scripts/e2e-gateway-session.sh
bun run scripts/ens-demo.ts
bun run scripts/chain-check.ts --network arc-testnet
```

Record which pass, and for each failure whether the fallback from the spec's cut order is now in force.

- [ ] **Step 2: Mainnet dry run**

```bash
bun run scripts/chain-check.ts --network arc-mainnet
```

Expected: refuses with the `pending` finding naming `config/chains/arc-mainnet.json` and `docs/mainnet-runbook.md`. That refusal *is* the passing result today — a pending manifest must fail closed.

- [ ] **Step 3: Packaging state**

```bash
bun run scripts/continuity.ts --check
python3 scripts/diagram.py && python3 scripts/diagram.py --dark && git diff --exit-code docs/architecture.excalidraw docs/architecture-dark.excalidraw
./scripts/narration-budget.sh
```

- [ ] **Step 4: Write the record**

Create `docs/superpowers/checkins/2026-09-11.md` with the same section shape as Sept 8, plus:

```markdown
## Evidence scripts

| script | result | shown in beat |
|---|---|---|
| `e2e-lineage.sh` | <pass/fail> | 3 |
| `e2e-tree-settle.sh` | <pass/fail> | 2, 3 |
| `e2e-canary.sh` | <pass/fail> | 5 |
| `e2e-graph-cogs.sh` | <pass/fail> | 4 |
| `e2e-gateway-session.sh` | <pass/fail> | 6 |
| `ens-demo.ts` | <pass/fail> | 3, 5 |
| `chain-check.ts --network arc-mainnet` | refuses (pending) — correct | 8 |

## Ready for capture?

<yes/no, and what must land before Fri noon>
```

- [ ] **Step 5: Post it and commit**

```bash
git add docs/superpowers/checkins/2026-09-11.md
git commit -m "docs(checkin): 2026-09-11 — integration and evidence"
```

---

### Task 13: Submission — dashboard fields, three partners, feedback

**Files:**
- Create: `docs/submission-checklist.md`, `docs/feedback/arc-circle.md`, `docs/feedback/thegraph.md`, `docs/feedback/ens.md`

**Interfaces:**
- Consumes: the video (Task 10), the README block (Task 5), `docs/interop/circle-cli.md` (Task 3).

- [ ] **Step 1: Write the per-partner feedback documents**

Each is real, sourced friction found while building — not praise. Every finding cites the URL it was checked against; several are already recorded in `docs/superpowers/research/ethonline-2026/`.

`docs/feedback/arc-circle.md`:

```markdown
# Feedback — Arc / Circle

Found while building ARCADE on Arc testnet, Jul–Sep 2026.

1. **Doc drift on the testnet RPC host.** `docs.arc.io` now uses
   `https://rpc.testnet.arc.io` throughout (node-providers, infrastructure, the MetaMask
   tables) while older material and third-party copies still carry
   `rpc.testnet.arc.network`. Both answer today. `config/chains/arc-testnet.json` lists
   both so a stale copy does not break a boot; publishing a canonical/alias note would let
   integrators stop guessing.
2. **The dual-decimal USDC predeploy is the single biggest source of bugs.**
   `0x3600…0000` is the 18-decimal native gas token *and* the 6-decimal ERC-20 at the same
   address. Every money bug in this repo traced back to it. The paymaster page
   (`/integrate/relayers-and-paymasters/deploy-a-paymaster`) is the only place that says
   `depositTo` takes 18-decimal wei; that warning deserves to be on the token page.
3. **The faucet rejects `"native": true`.** `POST https://api.circle.com/v1/faucet/drips`
   with `{"blockchain":"ARC-TESTNET","native":true}` fails; `"usdc": true` is correct
   because USDC *is* native. The error text does not say so.
4. **`transferWithAuthorization` that fully drains a brand-new deposit address reverts**
   (`https://docs.arc.io/integrate/exchanges`). For an x402 marketplace this is a live
   trap: a first-time buyer's first payment can be exactly their whole balance.
5. **No mainnet parameters published before Sept 16.** No chain id, RPC or USDC row for
   Arc mainnet as of 2026-09-04, while the Push-to-Mainnet prize runs to Sept 30. We made
   the chain a manifest and made a `pending` manifest refuse to boot; a "watch this page"
   anchor with a publish date would let integrators automate the flip.
6. **Circle CLI 1.0.0 interop was smooth and is the good news.** `circle services pay`
   paid an unchanged ARCADE endpoint (`docs/interop/circle-cli.md`). One request: the
   `--chain` token set is not discoverable from `--help`; `circle blockchain list` is,
   but the rejection hint is what actually taught us the right value.
7. **Gateway on Arc is testnet-only**, which is the correct call to document but it means
   the Arc mainnet path cannot use nanopayments at launch
   (`/gateway/references/supported-blockchains`). Saying so on the Nanopayments landing
   page rather than only in the chain table would save a design round-trip.
```

`docs/feedback/thegraph.md`:

```markdown
# Feedback — The Graph

1. **`arc-testnet` in the networks registry is subgraph-only** — no substreams. That is
   discoverable but not stated on the hackathon resources page, and it silently rules out
   the Substreams track for anyone whose project lives on Arc.
2. **The x402 gateway settles on Base**, so a seller on another chain buying Graph data
   is inherently cross-chain. That is fine and we shipped it that way — the seller buys
   its facts on Base out of margin while the buyer pays on Arc — but the docs read as if
   payer and consumer are on one chain.
3. **`@graphprotocol/client-x402`'s failure mode is the useful part** and is
   under-documented: when the payer key is absent the query fails in a way a caller can
   distinguish from an empty result. Our whole "no facts → no schema-valid output → no
   settlement" beat depends on that distinction.
4. **The Agent0 subgraph schema is unusually well aligned with agent marketplaces** —
   `x402Support`, `mcpEndpoint`, `supportedTrusts`, and feedback carrying proof of
   payment. Documenting it as a *pattern* others should copy, rather than as one
   project's schema, would be worth more than another tutorial.
```

`docs/feedback/ens.md`:

```markdown
# Feedback — ENS (ENSv2 on Sepolia)

1. **ENSv2 writes have no library support.** Reads are well served; every write in this
   project is a hand-rolled `writeContract` against ABIs read out of the deployment.
   A minimal `viem`-shaped write helper would remove the largest single cost of adopting
   ENSv2 during a hackathon.
2. **Resolving the deployment set at runtime via `RootRegistry.getSubregistry("eth")`
   is the right pattern and is not the documented one.** With two live Sepolia deployment
   sets, hardcoding an address is the obvious mistake and the docs do not warn against it.
3. **`PermissionedResolver.authorizeTextRoles` is the best primitive here and is nearly
   invisible in the docs.** Granting a daemon key permission to write exactly one text
   record (`arcade.priceAtomic`) and nothing else is precisely what an autonomous agent
   needs. It deserves a page of its own.
4. **Expiry as liveness works beautifully.** Short-TTL subnames renewed by a running
   daemon give "the service is alive" for free, and revival semantics restore owner and
   roles when it comes back. This is not framed anywhere as a use case; it should be.
5. **ENSIP-25 registration records + ERC-7930 interoperable addresses let one name point
   at an identity registry on another chain** — naming on Sepolia, settlement on Arc.
   Worked as specified; a single worked cross-chain example would have saved a day.
```

- [ ] **Step 2: Write the checklist**

Create `docs/submission-checklist.md`:

```markdown
# ETHOnline 2026 submission checklist

Deadline: **Sun 2026-09-13, 12:00pm EDT.** Continuity track (Extend Open Source).

> Field names below are from the event's own rules and prize pages as recorded in
> `docs/superpowers/research/ethonline-2026/README.md`. Before submitting, open the
> ETHGlobal project dashboard and reconcile this list against the live form — if a field
> name differs, fix it here rather than guessing twice.

## Project fields

- [ ] **Name** — ARCADE
- [ ] **Tagline** — "The agent labor protocol: publish any skill as a paid endpoint, hire agents by name, settle every hop in USDC on Arc."
- [ ] **Description** — the problem (dead x402 catalogs, no failure semantics, no lineage), what ARCADE does, and the two guarantees. Mirror `README.md` § Guarantees; do not invent claims the repo does not carry.
- [ ] **How it's made** — Bun + Effect; the secrecy boundary as a schema transformation; the pull-model runner; the input gate → lineage → tree ledger → settle pipeline; FeeSplitter v2's `settleWithTree`; ERC-8004 on Arc; ENSv2 on Sepolia; the subgraph; Gateway sessions. Name the Circle CLI interop.
- [ ] **Source code** — https://github.com/ss251/arcade (public)
- [ ] **Demo video** — the uploaded link to `design/arcade-ethonline-2026.mp4`; 3:45, 1920×1080, human voice, burned captions
- [ ] **Live demo** — https://arcade-hub-production.up.railway.app (hub + marketplace)
- [ ] **Continuity registration** — done, with the pre-existing/new split pointing at `README.md` § Continuity declaration
- [ ] **Cover image** — `docs/architecture.png`

## Partner prizes — exactly three

The event caps a submission at three partner prizes; a partner with several tracks counts
once, so Arc's two Continuity tracks are one selection.

- [ ] **Arc / Circle** — Best DeFi or Agentic Application (Continuity) **and** Launch on Arc Testnet & Push to Mainnet (Continuity)
- [ ] **The Graph** — Best AI Project (AI tooling / use case)
- [ ] **ENS** — ENSv2 (Sepolia)
- [ ] Nothing else selected. World, Hedera, Ledger, Privy, Bazantic, Chainlink were researched (`docs/superpowers/research/ethonline-2026/`) and deliberately not entered.

## Per-partner requirements

| partner | required | where it is |
|---|---|---|
| Arc / Circle | functional MVP · demo video · GitHub repo · Continuity registration · deployment-ready on mainnet by Sept 30 | live hub · video · repo · `docs/mainnet-runbook.md` + `config/chains/arc-mainnet.json` |
| The Graph | Graph load-bearing · **live** data from a Graph provider (Studio API key) · meaningful work with the data · open-source with README/SKILL.md · pre-existing work documented | `skills/counterparty-graph/SKILL.md` · the `arc-testnet` subgraph the hub reads · README continuity block |
| ENS | ENSv2 on Sepolia · targets an existing project's testnet deployment · functional demo, no hard-coded values | names on Sepolia authoritative over `payTo`/chain for settlement on Arc; deployment set resolved at runtime via `RootRegistry.getSubregistry("eth")` |

## Feedback fields

Each partner's submission form has a feedback box. Paste the matching file:

- [ ] Arc / Circle → `docs/feedback/arc-circle.md`
- [ ] The Graph → `docs/feedback/thegraph.md`
- [ ] ENS → `docs/feedback/ens.md`

## Rule compliance

- [ ] Video is 2–4 minutes, ≥720p, a real human voice, not recorded on a phone, no TTS
- [ ] AI use attributed in `README.md` § AI assistance
- [ ] Spec, plans and research artifacts committed under `docs/superpowers/`
- [ ] Pre-existing vs new work documented with commit ranges
- [ ] Frequent commits throughout the window
- [ ] `internal/` is not committed — verify: `git ls-files internal | wc -l` prints 0
```

- [ ] **Step 3: OWNER — submit on the ETHGlobal dashboard**

**OWNER.** The submission itself is made on the owner's ETHGlobal account and is theirs to
make. Hand them `docs/submission-checklist.md`, the video file, the repository link and the
three partner selections (max three; a partner with several tracks counts once), and confirm
they have submitted **before Sat Sept 13, 12:00pm EDT**. The agent prepares every field and
submits none of them. See `docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

- [ ] **Step 4: Verify the two mechanical claims**

```bash
git ls-files internal | wc -l
grep -c '^- \[ \] \*\*Arc / Circle\*\*\|^- \[ \] \*\*The Graph\*\*\|^- \[ \] \*\*ENS\*\*' docs/submission-checklist.md
```

Expected: `0` and `3`.

- [ ] **Step 5: Commit**

```bash
git add docs/submission-checklist.md docs/feedback
git commit -m "docs(submission): checklist, three partner selections, per-partner feedback"
```

---

### Task 14: Live evidence — one command that re-derives every packaging claim

**Files:**
- Create: `scripts/packaging-evidence.sh`

**Interfaces:**
- Consumes: `scripts/continuity.ts --check` (T4), the README markers (T5), `scripts/diagram.py` (T6), `scripts/narration-budget.sh` (T7), `docs/video/ethonline-2026-shotlist.md` (T8), `design/arcade-ethonline-2026.mp4` (T10), `packages/payments/test/circle-cli-interop.test.ts` (T2).
- Produces: the screen shown in video beat 8 and the last gate before submitting.

- [ ] **Step 1: Write it**

```bash
#!/bin/bash
# scripts/packaging-evidence.sh
#
# Every packaging claim, re-derived. Run it before submitting; run it on camera for beat 8.
#
# Nothing here trusts a file's contents: the continuity table is regenerated from git and
# compared, the diagram is regenerated and diffed, the video is probed rather than
# described, and the interop fixture is replayed through the hub's own decoder.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail=0
check() {
  local name="$1"; shift
  if "$@" >/tmp/pe.log 2>&1; then
    printf '  ok    %s\n' "$name"
  else
    printf '  FAIL  %s\n' "$name"
    sed 's/^/        /' /tmp/pe.log | tail -5
    fail=$((fail + 1))
  fi
}

echo "ARCADE packaging evidence"
echo

check "continuity table matches git"      bun run scripts/continuity.ts --check
check "README carries all seven sections" bash -c '
  want="Continuity declaration
Reused unchanged
AI assistance
Tests
Partner prizes
Guarantees, and what is not guaranteed
Mainnet"
  got=$(awk "/^## ETHOnline 2026\$/,/^## Quickstart\$/" README.md | sed -n "s/^### //p")
  [ "$want" = "$got" ]'
check "internal/ is not committed"        bash -c '[ "$(git ls-files internal | wc -l | tr -d " ")" = "0" ]'
check "diagram is generator output"       bash -c '
  python3 scripts/diagram.py >/dev/null && python3 scripts/diagram.py --dark >/dev/null &&
  git diff --exit-code docs/architecture.excalidraw docs/architecture-dark.excalidraw'
check "narration fits its windows"        ./scripts/narration-budget.sh
check "shot list totals 225s"             bash -c '
  s=$(awk -F"|" "/^\| [1-8] \|/ {gsub(/[^0-9]/,\"\",\$3); t+=\$3} END {print t}" docs/video/ethonline-2026-shotlist.md)
  [ "$s" = "225" ]'
check "video is 2-4 min, >=720p, 16:9"    python3 -c '
import json,subprocess,sys
p=json.loads(subprocess.run(["ffprobe","-v","error","-print_format","json","-show_format","-show_streams","design/arcade-ethonline-2026.mp4"],capture_output=True,text=True).stdout)
d=float(p["format"]["duration"]); v=next(s for s in p["streams"] if s["codec_type"]=="video")
assert 120<=d<=240, d
assert int(v["height"])>=720, v["height"]
assert int(v["width"])*9==int(v["height"])*16
assert any(s["codec_type"]=="audio" for s in p["streams"])
print(f"{d:.1f}s {v[\"width\"]}x{v[\"height\"]}")'
check "Circle CLI wire shape decodes"     bunx vitest run packages/payments/test/circle-cli-interop.test.ts
check "typecheck"                         bunx tsc --noEmit
check "tests"                             bun run test

echo
if [ "$fail" -eq 0 ]; then
  echo "packaging evidence: all checks passed"
else
  echo "packaging evidence: $fail check(s) failed"
fi
exit "$fail"
```

```bash
chmod +x scripts/packaging-evidence.sh
```

- [ ] **Step 2: Run it**

Run: `./scripts/packaging-evidence.sh`
Expected: nine `ok` rows and `packaging evidence: all checks passed`, exit 0. Before Tasks 9–10 have produced media, the video row fails — that is accurate, not a bug in the script.

- [ ] **Step 3: Commit**

```bash
git add scripts/packaging-evidence.sh
git commit -m "feat(scripts): one command that re-derives every packaging claim"
```

---

### Task 15: Sept 16 — execute the mainnet flip and append the evidence

**OWNER — the whole task.** This is the only task in the week that spends **mainnet** money
from the owner's own funds: it deploys a contract with an immutable seller address, funds a
facilitator with real USDC, and settles two real jobs. Every step below is prepared by the
agent and **executed on the owner's confirmation**, one step at a time; the agent does not
chain them. It runs on or after **Wed Sept 16**, after the Sept 13 submission, inside the Arc
prize's Sept 30 window. If any published mainnet parameter is missing at Step 1, stop and
leave the manifest `pending` — that is the correct, documented state, not a failure. See
`docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

**Files:**
- Modify: `config/chains/arc-mainnet.json`, `README.md` (§ Mainnet), `docs/mainnet-runbook.md` (mark what was executed)

**Interfaces:**
- Consumes: `docs/mainnet-runbook.md`, `loadChainConfig`, `chainCheck`, `scripts/chain-check.ts`, `scripts/deploy-splitter.ts` (Plan A Tasks 10–12).

Runs **on or after Wed 2026-09-16**, after the Sept 13 submission. The Arc prize's window closes Sept 30.

- [ ] **Step 1: Read the published parameters — do not infer them**

```bash
curl -s https://docs.arc.io/arc/references/rpc-endpoints.md | head -60
curl -s https://docs.arc.io/arc/references/contract-addresses.md | head -60
curl -s https://developers.circle.com/stablecoins/usdc-contract-addresses.md | grep -i -A2 arc
```

Take the chain id, RPC host(s), explorer base URL and USDC address from these pages verbatim. If any is still unpublished, **stop**: the `pending` manifest is the correct state, and the README already says so. Do not guess a chain id.

- [ ] **Step 2: Fill the manifest**

Edit `config/chains/arc-mainnet.json`: set `status` to `"ready"`, fill `chainId`, `caip2` (`eip155:<chainId>`), `rpcHttp`, `explorerBaseUrl`, `usdc.address`. Leave `gateway` as `null` until Circle lists an Arc mainnet GatewayWallet — a non-null guess would make the hub advertise a rail that cannot settle. Drop the `note` field once filled.

- [ ] **Step 3: Check the chain before touching money**

```bash
bun run scripts/chain-check.ts --network arc-mainnet
```

Expected: `ok`, having confirmed `eth_chainId`, USDC `name`/`version`/`decimals` and the facilitator's balance. Any finding here stops the flip.

- [ ] **Step 4: OWNER — deploy and fund**

**OWNER.** Both halves of this step move real money and are irreversible. The seller address
baked into `FeeSplitterV2` is immutable: confirm it with the owner **before** running the
deploy, not after.

```bash
bun run scripts/deploy-splitter.ts --v2 --network arc-mainnet
```

Then the owner funds the facilitator with mainnet USDC — gas is USDC on Arc, so one funding
covers both. Record the splitter address and the deploy tx.

- [ ] **Step 5: Boot and prove both directions**

```bash
ARCADE_NETWORK=arc-mainnet ARCADE_RAIL=eip3009 bun run hub
```

Then, per the runbook's canary step, make **two** calls against the same listing:

1. one deliberately failing job — expect an unsettled receipt and **no transaction**;
2. one succeeding job — expect a settled receipt with a mainnet tx.

The failure comes first. A mainnet flip that only demonstrates the happy path proves half the product.

- [ ] **Step 6: Append the evidence**

Add to `README.md` § Mainnet, under the existing paragraph:

```markdown
**Flipped 2026-09-16.**

| | |
|---|---|
| network | `config/chains/arc-mainnet.json`, `status: "ready"`, chain id `<id>` |
| FeeSplitterV2 | [`<addr>`](<explorer>/address/<addr>) |
| failed job | unsettled receipt, **no transaction** — the buyer's balance is unchanged |
| settled job | [`<tx>`](<explorer>/tx/<tx>) · $<price> → $<seller> seller + $<fee> platform |
| rail | EIP-3009. Gateway stays testnet-only on Arc until Circle deploys GatewayWallet to Arc mainnet. |

Rollback is one variable: `ARCADE_NETWORK=arc-testnet`.
```

- [ ] **Step 7: Verify and commit**

```bash
./scripts/packaging-evidence.sh
bun run test && bunx tsc --noEmit
git add config/chains/arc-mainnet.json README.md docs/mainnet-runbook.md
git commit -m "feat(mainnet): flip to Arc mainnet — chain manifest filled, splitter deployed, evidence appended"
```

**Acceptance:** `bun run scripts/chain-check.ts --network arc-mainnet` prints ok, and the README carries one explorer link for a settled mainnet job and one line stating the failed job settled nothing.

---

## Self-review

**1. Spec coverage.** M9 part 2 and §14 are covered as follows. Circle CLI interop (spec §11, "`circle services pay` against an unchanged endpoint, filmed") → Tasks 1–3, filmed as no beat of its own but recorded in `docs/interop/circle-cli.md` and quoted in the README's Arc prize row; the compatibility test the brief asks for is Task 2. The README section list (§14 beat 8 / the debate synthesis' "README split") → Task 5, seven H3s in the exact requested order, verified mechanically in Task 5 Step 5 and again in Task 14. Architecture diagram with lineage, canary, ERC-8004, ENS, subgraph and sessions → Task 6. Video (§14's eight beats, 2–4 min, ≥720p, human voice) → Tasks 7–10, with the beat order preserved exactly from the spec. Submission checklist with three partners and per-partner feedback → Task 13. Sept 16 flip using `docs/mainnet-runbook.md` with evidence appended → Task 15. Sept 8 and Sept 11 check-ins → Tasks 11–12. Spec §13's cut order appears in the check-in template (Task 11) and as fallback takes (Task 8); the spec lists the README split and the video under "never cut", so this plan has no cut of its own — its only fallback is Task 1's, for the live Circle CLI call.

**2. Not duplicated from Plan A.** `ChainConfig`, `loadChainConfig`, `toViemChain`, `config/chains/*.json`, `chainCheck`, `scripts/chain-check.ts` and `docs/mainnet-runbook.md` are all Plan A's (Tasks 10–12). This plan only *runs* them (Tasks 11, 12, 15) and fills the mainnet manifest on the day. Plan A Task 12 also does a minimal "366 tests" correction; Task 5 Step 4 checks that line is gone and supersedes it with a generated figure, which is a supersede rather than a conflict.

**3. Placeholders.** The angle-bracket slots that remain — `<CIRCLE_WALLET_ADDRESS>`, `<CIRCLE_CLI_SETTLE_TX>`, the check-in tables, the mainnet evidence row — are *outputs of a command run in the same task*, not instructions to invent something. Each one is preceded by the command that produces it. No step says "add error handling", "similar to Task N", or "write tests for the above".

**4. Type consistency.** `PaymentPayload`, `authorizationOf`, `signatureOf`, `networkOf`, `decodeHeaderJson` are used in Task 2 exactly as exported from `packages/payments/src/types.ts:66-126`. `A.CUT`, `A.TAKES`, `A.VO`, `A.TEXT`, `A.WORK`, `A.OUT` and `A.main` in Task 10 are the real module-level names in `scripts/demo/assemble.py`. `width_of` / `MEASURED` behaviour cited in Task 6 matches `scripts/diagram.py:181-188`. Beat names are `beat-1` … `beat-8` in Tasks 7, 9, 10 and take names `b1-publish` … `b8-continuity` in Tasks 8, 9, 10 — one naming scheme each, no drift.

**5. Ambiguities resolved.**

- *"macOS `screencapture`/QuickTime, not the browser-harness"* — the repo already tried `screencapture -v` and documented that it writes 48 frames regardless of the requested duration while exiting 0 (`scripts/demo/rec.sh:8-18`). Task 8 therefore keeps the proven ffmpeg/avfoundation recorder, names QuickTime as the manual fallback, and states explicitly that the browser harness must not be used for screen capture. The harness *is* still used for the diagram render (`scripts/render_diagram.py`), which is a page capture, not a screen capture — a different thing, called out in Task 6 Step 4.
- *"spec §7 of the debate synthesis"* — `DEBATE/SYNTHESIS.md` has four sections and no §7; its only README requirement is the line "Never cut: … README split" (SYNTHESIS.md:22). The section list is therefore taken from the task brief and spec §14 beat 8, which agree.
- *Commit-range links per plan letter* — streams run in parallel on separate branches, so a per-letter contiguous range does not exist. Task 4's generator emits a per-letter commit *count* (authoritative) plus a first…last compare link, and the table's own caption says the ranges interleave. Honest beats tidy.
- *`--chain ARC-TESTNET`* — `ARC-TESTNET` is the identifier Circle's Agent Wallets docs use for Arc, but the CLI's short chain codes (`BASE`, `MATIC`, …) are a different namespace and its rejection hint is authoritative. Task 1 Step 6 discovers the exact token with `circle blockchain list` and records it; every later task reads that record.
- *Committing a captured payment header* — a signed EIP-3009 authorization is a bearer instrument. Task 2's capture script scrubs the signature **before** anything reaches disk and the test asserts shape, which is what interop compatibility means; signature validity is already the rail conformance suite's job.
