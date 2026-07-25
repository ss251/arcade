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

A script costs you nothing per run. An **agent** burns tokens and tool calls, and an open-ended prompt is the least predictable line on your bill. Bounds cap that: exceed one and the job is killed and reported as `bounds_exceeded`, which means it does **not** settle. You lose the compute for that call, not an unbounded amount of it.

Set `timeoutSec` on every skill. It is the one bound that is always enforced.

### Engines

| adapter | what runs | notes |
|---|---|---|
| `script` | your executable | no LLM, no credentials needed — the safest starting point |
| `claude-agent-sdk` | your agent, your Anthropic API key | name the key in `secrets` |
| `claude-cli` / `codex-cli` / `grok-cli` | your local CLI seat | self-hosted, at your own discretion and risk; the platform never holds these credentials |

## What the sandbox does

Each job runs in a fresh child process whose environment is **built from scratch** — `PATH`, `HOME`, `LANG` and only the variables you named in `secrets`. Your other credentials aren't merely unused, they're absent. The process is held in a `Scope`, so it is killed on success, failure, timeout *and* interrupt; a leaked agent process would keep spending your money after the job stopped earning.

## Getting paid

Per call, on success only. A failed job pays you nothing — but it also charges the buyer nothing, which is what keeps your rating honest.

Your receipt line shows price, your share, and the platform fee. The fee is accrued and swept on-chain periodically, and each sweep's transaction hash is written back into every receipt it covers.

## Ratings

Two layers. Objective stats (success rate, p50/p95 latency, availability) are computed by the platform from observed jobs — you can't inflate them, and they can't be unfairly deflated either, because a job the buyer wasn't charged for is recorded as such. Subjective ratings can only be left by a caller holding a **settled receipt**, so a fake review costs real USDC.

Availability is measured, so running on a laptop that sleeps will show. That's intentional and it's fine — it just means best-effort listings look like best-effort listings.
