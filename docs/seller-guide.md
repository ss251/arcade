# Seller guide — publish a skill, get paid in USDC

## What you keep

Everything that makes your skill *yours*. The hub receives a name, a description, a price, and your input/output schemas. It never receives:

- your prompt or system prompt
- your entry point or any source code
- your API keys, or even which keys you use — `secrets` lists variable **names**, never values
- your egress rules or working directory

Verify it yourself before you publish anything:

```bash
bun run arcade publish skills/<your-skill>
```

It prints two blocks: what goes to the hub, and what stays on your machine.

## Setup

```bash
bun run arcade runner init --seller 0xYourAddress --hub https://hub.example.com
bun run arcade runner start
```

`--seller` is where your USDC earnings are paid. That address and a runner id are the only identifying things the hub learns.

Config lives at `~/.arcade/config.json`, deliberately outside any repo.

## Writing a skill

A skill is a directory containing `arcade.json` and your code.

```jsonc
{
  "id": "usdc-flow-check",              // lowercase kebab, unique
  "version": "0.1.0",
  "serviceName": "USDC Flow Check",     // ≤32 printable ASCII
  "description": "…",                   // ≤500 chars
  "tags": ["arc", "usdc"],              // ≤5
  "price": "$0.01",                     // flat, per call
  "replaces": "$29/mo explorer API",    // optional comparison shown on the listing

  "bounds": {                           // your margin guard — see below
    "timeoutSec": 30,
    "maxTurns": 8,
    "maxTokens": 60000,
    "maxToolCalls": 20
  },

  "inputSchema":  { "type": "object", "required": ["address"], "…": "…" },
  "outputSchema": { "type": "object", "required": ["balanceUsdc"], "…": "…" },

  // ---- everything below stays on your machine ----
  "engine": { "adapter": "script", "entry": "run.ts" },
  "secrets": ["ANTHROPIC_API_KEY"],     // NAMES only
  "egress": ["api.anthropic.com"]
}
```

### The contract your code implements

Read `{ jobId, input }` as JSON on **stdin**. Write `{ output, stopReason, usage }` as JSON on **stdout**. Anything on **stderr** is streamed to the hub as a job log (and shown to you, not the buyer).

```ts
const { input } = JSON.parse(await Bun.stdin.text())
// … do the work …
process.stdout.write(JSON.stringify({ output: result, stopReason: "end_turn" }))
```

### Bounds — why they matter

A script costs you nothing per run. An **agent** burns tokens and tool calls, and an open-ended prompt is the least predictable line on your bill. Bounds cap that: cross one and the run is stopped and reported as `bounds_exceeded`, which means it does **not** settle.

`maxCostUsd` is the bound that actually protects your margin, and it is the one to set first. A token ceiling is a poor proxy because output bills at roughly five times input — the same 50,000 tokens can cost you a quarter or well over a dollar depending on the mix. Denominating the ceiling in money means you can read it directly against your price:

```
price          $0.25
platform fee  -$0.0125   (5%)
your share     $0.2375
maxCostUsd    -$0.12     ← your ceiling
              ─────────
worst case     $0.1175   guaranteed margin on a call that settles
```

On `claude-api` these ceilings are applied **during** the run, not after it. That distinction is the whole point: a bound checked once the process has exited tells you about money you have already spent, and pairs a full API bill with a job that doesn't settle. Crossing the ceiling mid-run aborts the request instead.

Set `timeoutSec` on every skill. It is the one bound that is always enforced.

### Engines

| adapter | what runs | notes |
|---|---|---|
| `script` | your executable | no LLM, no credentials needed — the safest starting point |
| `claude-api` | your agent on the Claude API | name your key in `secrets`; bounds enforced mid-run |
| `claude-cli` / `codex-cli` / `grok-cli` | your local CLI seat | self-hosted, at your own discretion and risk; the platform never holds these credentials |

### Writing a `claude-api` skill

Two files. `arcade.json` is the public half; `agent.ts` is the half that never leaves your machine:

```ts
import type { AgentDefinition } from "@arcade/runner/engines/claude-api"

export default {
  model: "claude-opus-5",
  effort: "medium",
  webSearch: { maxUses: 8 },
  systemPrompt: "…"
} satisfies AgentDefinition
```

Your agent finishes by calling the `submit` tool, whose input schema **is** your manifest's `outputSchema`. You don't declare `submit` — the harness builds it from your listing and marks it strict, so the API guarantees the arguments validate. This makes "the agent decided it was done" and "the output has the shape the buyer paid for" the same event; running out of turns without calling `submit` is an incomplete job and doesn't settle.

Two defaults worth understanding, because both cost you money if you fight them:

- **`effort` defaults to `medium`, not `high`.** On Opus 5 the lower levels are unusually strong, and a per-call endpoint priced in cents is exactly where that matters.
- **Don't ask your agent to double-check its work.** It already verifies itself; asking again buys a second pass you pay for and the buyer never sees. This inverts the usual prompting advice, and under a cost ceiling it is the difference between a margin and a `bounds_exceeded`.

If your output schema uses keywords strict mode rejects (`minLength`, numeric ranges), set `strictOutput: false`. The hub still validates every output against your full schema, so this trades an API-level guarantee for schema expressiveness — it never weakens the settle-on-success rule.

## What the sandbox does

Each job runs in a fresh child process whose environment is **built from scratch** — `PATH`, `HOME`, `LANG` and only the variables you named in `secrets`. Your other credentials aren't merely unused, they're absent. The process is held in a `Scope`, so it is killed on success, failure, timeout *and* interrupt; a leaked agent process would keep spending your money after the job stopped earning.

## Getting paid

Per call, on success only. A failed job pays you nothing — but it also charges the buyer nothing, which is what keeps your rating honest.

Your receipt line shows price, your share, and the platform fee. The fee is accrued and swept on-chain periodically, and each sweep's transaction hash is written back into every receipt it covers.

## Ratings

Two layers. Objective stats (success rate, p50/p95 latency, availability) are computed by the platform from observed jobs — you can't inflate them, and they can't be unfairly deflated either, because a job the buyer wasn't charged for is recorded as such. Subjective ratings can only be left by a caller holding a **settled receipt**, so a fake review costs real USDC.

Availability is measured, so running on a laptop that sleeps will show. That's intentional and it's fine — it just means best-effort listings look like best-effort listings.
