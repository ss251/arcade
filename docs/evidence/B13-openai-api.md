# B13 follow-up — one Agent Skill, Messages and Chat Completions formats

On commit43d8ba4, September6,2026 **18:09:40.377–18:10:11.334 UTC**, the
first-party diff-triage Agent Skill succeeded through openai-api against the
owner-approved b.ai GLM-5.3-Flash API route. Exactly one request and one consuming
Keychain read occurred. No wallet, hub purchase, subscription, tool hire, production
configuration change or replay of the original three-adapter run occurred.

## Result

| Check | Observed result |
| --- | --- |
| Listing / version | diff-triage / 0.1.0 |
| API base / returned model | https://api.b.ai/v1 / glm-5.3-flash |
| HTTP / provider finish reason | 200 / tool_calls |
| Engine completion | end_turn |
| Turns / tokens / tool calls | 1 / 1,930 / 1 submit |
| Output | 1,633 bytes; actual hub validator passed the declared schema |
| Core local settlement predicate | true; no payment was verified or settled |
| Estimated seller token cost | $0 using the checked promotional PRICING entry |

The request sent max_tokens16000 and enable_thinkingfalse. The latter is a wire
observation, **not proof that reasoning was disabled**. Independent provider
billing was not inspected: zero cost is the engine's estimate under the active
[b.ai offer](https://docs.b.ai/llmservice/promotions-and-pricing-notices/), checked
read-only immediately before the run (18:05UTC). The offer can end; do not assume
this result grants permission for paid calls.

The earlier [B13 Messages-format run](../runbook.md#b13-free-route-follow-up--full-local-execution-pass)
used the same GLM model through the Anthropic-Messages-compatible local proxy and
the existing skill/claude-agent execution path. This run adds direct OpenAI
Chat Completions wire compatibility. They are **two API formats/adapters, not two
underlying model vendors**. The outputs are not expected to be byte-identical.

## Same-listing and source checks

Git comparison against original B13 commitc6f6676 found no tracked changes in the
entire skills/diff-triage folder. Decoding both historical and current manifests
produced identical public listings, and SKILL.md bytes matched exactly.

The live wrapper constructed an in-memory manifest differing only in private
engine/secrets/egress fields. The actual committed manifest was never edited.
It used the original B13 input (a one-line constant change), loadSkillAgent,
engineConfigOf, buildEnv, the real runJob fencing/size boundary, and runOpenAiApi.
The fetch wrapper delegated one real request to the exact HTTPS endpoint, refused
a second request, and retained only allowlisted wire metadata after a bounded read.
The output went through the existing hub validateJson and core shouldSettle
functions locally; no hub process or chain settlement was involved.

| SHA-256 subject | Value |
| --- | --- |
| SKILL.md | b5d6f99f16138e7fc5c2c2206fcfb673770dd5cb8c6bca8258e4c5cdb0325db9 |
| Committed manifest | 02196706390f822be9d68d6cb921b89f9134a6261664bc75fcc070c566c9073c |
| Public listing JSON | 74635b3aa89a2f7a178a96b7b40f275935a34cef653865c37e685af7804d8842 |
| Input JSON | b3605f375fb94237a6b6f46f12c67827dc0d988a6b14301d7f0a886807a6b547 |
| Output JSON | 659d1e05d64e223550cc8768f8ebe38927d6699961b89e98a8d43b5030650773 |
| Private two-event journal | 7c6ad60e30ad91457180462d9be7f56383c87f04b871971087a40f36f039dbea |

## Authority, isolation and cleanup

The owner approved this free API route, not additional spending. The key was read
only inside the consuming process, captured rather than echoed, passed through
the manifest's explicit allowlist, and never written to a file or argv. The private
journal was opened exclusively with mode0600 inside a fresh mode0700 owned
directory; an existing journal prevents a repeat. It contains fixed metadata and
hashes, not the API key, raw provider diagnostics, prompt or output body.

An independent read-only check at **18:11:02.140 UTC** confirmed the consuming
process was absent, the journal had exactly two events with the required modes,
all seven frozen implementation hashes still matched, and the tracked tree was
clean. There was no temporary listener or native browser to leave running. The
old loopback proxy was neither restarted nor reconfigured.

See the [configuration guide](../openai-api.md) and
[implementation report](../superpowers/sdd/2026-09-06-vendor-neutrality/task-2-report.md)
for supported capabilities, pricing and validation limits. Unit/integration tests
and their full gate are separate from this live observation. Earlier B13 MCP and
OpenAPI proofs remain historical evidence; this run did not repeat them.

The separate documentation-commit gate31253 passed once:4,368Vitest/196files
(64.61s),839Bun/55files/6,116assertions(166.04s),root/web strict0 and client/SSR
builds363ms/268ms. It made no additional live API request. All seven implementation
hashes remained unchanged; four documentation paths and five added local links
passed the scoped privacy/link audit.
