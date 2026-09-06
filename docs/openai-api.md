# API-key Chat Completions engine

`openai-api` runs a seller's agent through the OpenAI Chat Completions wire format.
It is not Codex CLI, a consumer subscription, or a promise that every compatible
provider has identical features or pricing. The existing `skill` adapter remains
unchanged; it runs through `claude-agent`.

For an Agent Skill folder, change only private manifest fields:

```json
{
  "engine": {
    "adapter": "openai-api",
    "credential": "api-key",
    "entry": "SKILL.md",
    "model": "glm-5.3-flash",
    "capabilities": []
  },
  "secrets": ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
  "egress": ["api.b.ai"]
}
```

Merge that fragment into your existing manifest; preserve its public identity,
version, price, bounds and schemas. Set the seller process's OPENAI_BASE_URL to
`https://api.b.ai/v1` and supply its own API key through your secret manager. Never
put key values in a manifest, shell history, committed file or public evidence.
The runner forwards only declared environment names. Omitting the base selects
`https://api.openai.com/v1`, not b.ai; model selection has no default. Run
`arcade doctor --skills YOUR_SKILLS_DIRECTORY` for an offline configuration check.
For this adapter, declare the model in the manifest so doctor can check it without
executing a seller module. An agent module entry also works; its model is overridden
by the private manifest when present.

The two configured provider/model pairs, verified September 6, 2026, are:

| Base and model | Input / cached input / output USD per million tokens |
| --- | --- |
| OpenAI `/v1`, `gpt-4.1-mini` | 0.40 / 0.10 / 1.60 |
| b.ai `/v1`, `glm-5.3-flash` | 0 / 0 / 0 during its promotional offer |

The first rates come from the [official model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini).
The GLM entry reflects the [b.ai promotion notice](https://docs.b.ai/llmservice/promotions-and-pricing-notices/),
not a permanent zero-price guarantee. Review the offer before each live evidence
run and update PRICING if it changes. Unknown provider/model pairs fail before any
request, even when no cost bound is set. A proxy does not inherit another host's
price. Updating credentials or pricing does not authorize additional spending.

For the exact b.ai GLM route the adapter sends `max_tokens:16000` by default and
the owner-requested `enable_thinking:false`. A smaller remaining job token ceiling
or module maxTokensPerTurn lowers the output allowance. Do not interpret the flag
as evidence that reasoning was disabled: the [provider's model page](https://docs.b.ai/llmservice/models/glm-5-3-flash/)
describes thinking as always enabled. The prior Messages proxy and this direct
Chat route both use GLM; they demonstrate two API formats/adapters, not two model
vendors. Live cross-format evidence is a separate task, not implied by unit tests.

The [Chat Completions response contract](https://developers.openai.com/api/reference/resources/chat)
drives completion: one complete `tool_calls` response, exactly one final `submit`,
non-empty JSON object arguments, and no refusal. Text alone, truncation, filtering,
malformed calls or missing usage cannot complete a job. The provider receives the
original output schema without forcing optional fields into its strict subset.
The hub independently applies its existing supported JSON Schema validator and
non-empty/stop-reason checks before settlement; an engine completion is not itself
a payment or proof of arbitrary JSON Schema keyword enforcement.

Only `submit` and explicitly declared `hire-skills` are implemented. Other portable
capabilities are refused before network access. A SKILL.md reference inventory
does not grant file-reading tools. Hiring uses the existing fenced broker and its
authoritative sub-spend budget. Duplicate, unknown or mixed-submit calls fail
before the batch's first purchase. An uncertain/failed hire ends the run without
automatic retry or a claim that it cost nothing.

Requests are non-streaming, have no automatic retry or redirects, and use a whole
job deadline and 2 MiB JSON request/response limit. Default maximum turns is 16.
Token, tool-call and cost guards apply between responses and on final submission;
child spend is included. These guards cannot undo an in-flight provider charge,
and an overall failed job may still have incurred seller costs. Declaring no model
tools does not prevent the engine's own model API request; egress declarations
are not a substitute for an operating-system firewall.
