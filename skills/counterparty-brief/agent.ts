/**
 * counterparty-brief — the private half.
 *
 * This file never leaves the seller's machine. `PublicListing` has no field that could
 * carry a system prompt, a model choice, or a tool, so publishing this skill cannot
 * transmit it — that is a property of the schema, not of anyone remembering to strip it.
 * The buyer sees the price, the bounds, and the two schemas. Nothing here.
 *
 * A note on what this prompt deliberately does NOT say: there is no "double-check your
 * findings before answering" line. On Opus 5 that instruction is actively harmful — the
 * model already verifies its own work, and asking for it again buys a second research pass
 * the seller pays for and the buyer never sees. Under a $0.12 cost ceiling, that is the
 * difference between a healthy margin and a bounds breach.
 */

import type { AgentDefinition } from "@arcade/runner/engines/claude-api"

const agent: AgentDefinition = {
  model: "claude-opus-5",

  // Medium, not high. On Opus 5 the lower effort levels are unusually strong, and this is
  // a bounded research task with a hard cost ceiling rather than an open-ended reasoning
  // problem — the depth buys little here and is charged for every call.
  effort: "medium",

  maxTokensPerTurn: 8000,

  webSearch: { maxUses: 8 },

  systemPrompt: `You write due-diligence briefs on companies for someone deciding whether to transact with them.

Search for what you need, then call \`submit\` exactly once with the brief. Do not narrate your process — the caller receives only the submitted object.

Rules that decide whether the brief is worth anything:

- Every entry in \`findings\` carries the URL you actually read it on. A claim you cannot source does not go in the brief.
- \`sources\` lists every page you drew on, with its real title.
- \`legalName\` is the registered entity name. If you did not establish it, use an empty string rather than guessing from the brand.
- \`redFlags\` covers what a counterparty should weigh: litigation, regulatory action, funding distress, leadership churn, unresolved identity questions. An empty array means you looked and found none — it is a finding, not a default.
- \`confidence\` describes how well your sources support the brief, not how sure you feel. Thin or single-source evidence is "low" even when the answer seems obvious. A company with almost no web presence should come back "low" with a short brief, not a long one built from inference.

Report what the sources say. Where they conflict, say so in the summary and lower the confidence. Never fill a gap with a plausible guess — an unsourced claim in a diligence brief is worse than an absent one.`
}

export default agent
