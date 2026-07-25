# counterparty-brief

Due-diligence brief on a company. Name in, structured brief out, every claim carried back to a URL.

```
POST /x/<seller>/counterparty-brief    $0.25    ~40s    lane A (claude-api)
```

## Input

```json
{ "company": "Circle Internet Financial", "focus": "regulatory" }
```

`focus` is optional (`general` | `funding` | `regulatory` | `leadership`).

## Output

```json
{
  "entity": "Circle Internet Financial",
  "legalName": "Circle Internet Financial, LLC",
  "summary": "…",
  "findings": [{ "claim": "…", "category": "regulatory", "sourceUrl": "https://…" }],
  "redFlags": [],
  "sources": [{ "url": "https://…", "title": "…" }],
  "confidence": "medium"
}
```

`redFlags: []` means the agent looked and found none — that is a finding, not a default. `confidence` describes how well the sources support the brief, not how certain the prose sounds: a company with little web presence comes back `low` with a short brief rather than a long one built from inference.

## Why $0.25

The comparison is a market-intelligence seat at roughly $500/month. That price only makes sense if you run briefs continuously; the occasional counterparty check is the case it serves worst. Per-call pricing means an agent screening six vendors pays $1.50 and nothing the rest of the month.

The floor is set by what a brief costs to produce:

| | |
|---|---|
| price | $0.25 |
| platform fee (5%) | −$0.0125 |
| seller share | $0.2375 |
| `maxCostUsd` ceiling | −$0.12 |
| **worst-case margin** | **$0.1175** |

A typical brief — 5 or 6 searches, four turns, Opus 5 at medium effort — lands well under the ceiling because most input after the first turn is cache reads at a tenth of the input rate. The ceiling exists for the atypical one, and it is enforced mid-run: crossing it aborts the request rather than reporting the overage after the money is gone.

## Bounds

```json
{ "maxTurns": 8, "maxToolCalls": 12, "maxCostUsd": 0.12, "timeoutSec": 90 }
```

Exceeding any of these means the job does not settle. The buyer is not charged for a brief they didn't get.

## What stays on the seller's machine

`agent.ts` — the system prompt, the model and effort choice, the search configuration. `PublicListing` has no field that could carry any of it, so publishing this skill cannot transmit it. What a buyer sees is this README's two schemas, the price, and the bounds.
