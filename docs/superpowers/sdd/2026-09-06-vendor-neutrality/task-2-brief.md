# Vendor neutrality — Task 2 API engine brief

Owner-approved September 6, 2026; base 9bd99f3. Root-only, four-worker maximum,
one sequential full gate for this implementation commit. No paid or live call in
this commit; the approved free-route evidence gets a separate bounded run.

Add `openai-api`, an API-key-only Chat Completions wire adapter, not a seat or
Codex CLI wrapper. Require an explicit model; never silently choose a paid model.
Pass OPENAI_API_KEY and OPENAI_BASE_URL only through manifest secrets. Keep all
engine configuration private. Register the engine and reuse contained SKILL.md
loading for this adapter; preserve the existing skill adapter's execution path.

Use native fetch with no redirects or automatic retries, bounded JSON bodies,
whole-job timeout, and validated mandatory prompt/completion usage. Price exact
provider/model pairs before a request: GPT-4.1 mini on OpenAI and the owner-selected
GLM 5.3 Flash promotional free b.ai route. Unknown combinations fail closed even
without maxCostUsd. Token/cost ceilings include the final submission and child
spend. Provider-reported cost is an estimate and post-response guard, not a
guarantee against in-flight provider billing; broker sub-spend limits remain
authoritative. Never repeat an uncertain hire automatically.

Accept only a complete tool_calls response containing one non-empty JSON submit
object. Refusal/content_filter always wins, including content-part refusals.
Reject truncated, malformed, unknown, duplicate or mixed-submit tool calls before
any tool side effect. Plain assistant text is not the work product. The hub still
performs full outputSchema validation before settlement; provider schemas are not
a replacement. Support only submit and explicitly declared hire-skills through
the existing fenced broker; refuse every other portable capability. A bounded
default turn count prevents an unbounded conversation.

The offline doctor checks model/pricing, credential type, API-key presence and
capabilities, without a request. The CLI must use the scrubbed manifest environment
for this check, not ambient undeclared keys. Fixed diagnostics must not echo keys,
private URLs, prompts, tool inputs, provider error bodies or exception messages.

Official wire source: https://developers.openai.com/api/reference/resources/chat
Pricing: https://developers.openai.com/api/docs/models/gpt-4.1-mini
Free-route sources: https://docs.b.ai/llmservice/models/glm-5-3-flash/ and
https://docs.b.ai/llmservice/promotions-and-pricing-notices/ (checked September 6).
The GLM offer is promotional, with no published end date in those sources; it is
not a permanent free-price promise. Send owner-requested max_tokens 16000 and
enable_thinking false for that exact route, but do not claim reasoning was disabled:
the provider's model page says thinking is always enabled. Evidence must say two
API formats/adapters, not two underlying model vendors; both routes use GLM.

Tests precede implementation: registry/schema rejection first, then deterministic
transport/tool doubles exercising success, refusals, usage/bounds, retry absence,
credential isolation and actual harness SKILL.md loading. No real credential reads,
wallet actions, production edits, UI changes or push.
