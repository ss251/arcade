# Provider terms — what you may sell, and what you may not

Short version: **sell work produced with an API key; never sell what a personal subscription produces.** ARCADE enforces the second half rather than asking you to remember it — `arcade publish` and the runner's announce both refuse a subscription-backed listing.

The first half is not uniform. Providers differ in ways that matter, and this page records what each one actually says rather than assuming they converge.

## The comparison

| Provider | API / business terms | Consumer subscription | ARCADE |
|---|---|---|---|
| **Anthropic** | ✅ explicit: may power products for end users | ❌ three separate prohibitions | publishable on `api-key` |
| **OpenAI** | ✅ explicit: may make Customer Applications available to End Users; customer **owns Output** | ❌ no selling the Services; no programmatic extraction of Output | publishable on `api-key` |
| **DeepSeek** | ✅ explicit: may provide services to **external end users**; assigns Output rights to you | — | publishable on `api-key` |
| **Google Gemini** | ✅ for the API generally — ⚠️ **but Search-grounded results carry their own resale ban** | ❌ | see the grounding caveat below |
| **xAI** | ⚠️ AUP binds API users too and forbids "reselling any Input or Output" | ❌ | publishable with an **advisory** |
| **OpenRouter** | ⚠️ no reselling API access; you inherit every upstream provider's terms | — | see the pass-through note |
| **Mistral** | not verified — their terms are behind a legal-centre index we could not retrieve cleanly | — | treat as unknown until checked |

## The clauses

### Anthropic

**Commercial Terms** (API keys), §A.1:

> "Subject to these Terms, Anthropic gives Customer permission to use the Services, **including to power products and services Customer makes available to its own customers and end users** ("Users")."

**Consumer Terms** (Claude Pro / Max), three prohibitions, any one sufficient:

> §3: "…or **resell the Services**."

> §3: "**Except when you are accessing our Services via an Anthropic API Key** or where we otherwise explicitly permit it, to access the Services **through automated or non-human means, whether through a bot, script, or otherwise**."

> §2: "**You also may not make your Account available to anyone else.**"

Note the carve-out in the second: *"or where we otherwise explicitly permit it"*. Anthropic ships Claude Code and the Agent SDK, both of which run programmatically on a subscription — that is the permission, and it covers **your own** use. It does not extend to serving paid third-party requests.

### OpenAI

**Services Agreement** §2.2:

> "OpenAI grants Customer a non-exclusive right to access and use the Services during the Term. **This includes the right to use OpenAI's API to integrate the Services into Customer Applications and to make Customer Applications available to End Users.**"

§4.1 goes further than Anthropic's, on ownership:

> "Customer: (a) retains all ownership rights in Input; and (b) **owns all Output**. OpenAI hereby assigns to Customer all OpenAI's right, title, and interest, if any, in and to Output."

**What is *not* there matters too.** §3.3's restriction list — laws, third-party rights, minors, reverse engineering, competing models, data extraction, API-key transfer, rate limits — contains **no blanket automated-access clause**. That prohibition is Anthropic-specific, and assuming otherwise was the error that prompted this page.

**Consumer Terms of Use**, "What you cannot do", reaches the same destination by a different route:

> "**Modify, copy, lease, sell or distribute any of our Services.**"

> "**Automatically or programmatically extract data or Output.**"

So a Codex CLI endpoint backed by a ChatGPT subscription is out, but for its own reasons — selling the Service, and programmatic extraction of Output — not because OpenAI copied Anthropic's wording.

### DeepSeek

The most permissive of the ones checked. Open Platform terms:

> "You can integrate the capabilities of the DeepSeek models into various downstream systems, applications, or functionalities for intended purposes and specific scenarios, **providing services to both internal and external end users**."

> "**We assign any rights, title, and interests—if any—in the Outputs of the Services to you.**"

### Google Gemini

The API itself permits making API Clients available to users. The catch is narrower and easy to miss: **Search grounding has its own terms.**

> "You will not…cache, frame, syndicate, **resell**, analyze, train on, or otherwise learn from **Grounded Results**."

> "You will not allow end users to…access or collect Grounded Results **by automated means**."

A skill that declares `web-search` on a Gemini engine and returns grounded results to a paying buyer is doing something those two sentences describe fairly directly. A Gemini-backed skill with **no** search capability has no such problem. If the Gemini engine lands, that distinction has to be enforced in the capability mapping rather than left to the seller.

### xAI

The one that is genuinely different, because the restriction is not confined to the consumer tier. The Acceptable Use Policy states its own scope:

> "xAI's Acceptable Use Policy ("AUP") applies to **anyone using our Service, including consumers, developers and businesses**."

and prohibits:

> "Scraping, harvesting or **reselling any Input or Output**, or distilling model data or Outputs"

> "Providing services that encourage others to violate these Terms, including by operating websites offering **violative** outputs from our Services in exchange for payment"

The second clause is about *violative* outputs, so a lawful brief is outside it. The first is the problem: read maximally, "reselling any Output" would foreclose most paid products built on the xAI API, which cannot be the intent of a company that sells API access. But a **per-call** marketplace, where the buyer pays for one Output, sits closer to that wording than a subscription SaaS product does.

ARCADE does not refuse Grok skills — that would be substituting our reading for yours on an ambiguous clause. It prints an advisory at publish time and points here. Get clarification from xAI before listing one commercially.

### OpenRouter

Two clauses shape how an aggregator could be used as an engine:

> "…access the Site or Service for purposes of **reselling API access to Models** or otherwise developing a competing service"

Selling a work product is not selling API access, so that reads as satisfied. But:

> "You will require that all of your Authorized Users and customers access and use the Service and Models only in accordance with this Agreement… and the **applicable Model Terms**. You will be responsible for all acts and omissions of your Authorized Users, including any **violation of applicable Model Terms**."

That is a pass-through: routing through an aggregator does not launder the upstream provider's terms, it makes you responsible for them. An OpenRouter engine would inherit every restriction on this page at once, including xAI's.

## What this means in practice

| You want to… | Credential | Publishable |
|---|---|---|
| Sell a skill on the marketplace | `api-key` | ✅ |
| Run your own agents against your own seat | `subscription` | ❌ — local only |
| Publish a skill with no model at all | `script` | ✅ |

```jsonc
// publishable
"engine": { "adapter": "claude-agent", "credential": "api-key", "entry": "agent.ts" }

// runs locally, refused at publish
"engine": { "adapter": "claude-agent", "credential": "subscription", "entry": "agent.ts" }
```

**Switching costs one field.** The Agent SDK authenticates against either source, so a skill developed on your seat publishes unchanged once you point it at a key. Prompt, capabilities, bounds and schemas are untouched.

```
$ arcade publish skills/my-skill
CANNOT PUBLISH my-skill

  engine      claude-agent
  credential  subscription

This engine runs on a personal subscription seat, and every provider forbids
selling what one produces…
```

## Why we enforce rather than document

A subscription-backed marketplace would be cheaper to run and easier to onboard, which is exactly why it needs a gate rather than a paragraph. Two more reasons it is not close:

- **The seller carries the consequence.** A suspended account is theirs, and they would have taken that risk on our recommendation.
- **It is not a durable business.** A marketplace whose unit economics depend on a terms violation is one enforcement sweep from zero, and no buyer should build a workflow on it.

The honest version of "monetize idle agent capacity" is that your *agents* are the product — your prompts, your scaffolding, your judgement about what a good brief looks like. The inference underneath is a cost line you pay at commercial rates, like any other business.

## Adding a provider

Four questions, in this order. Two of them are the ones we got wrong by assuming.

1. **Do the API terms explicitly permit powering a product for your end users?** Anthropic §A.1, OpenAI §2.2 and DeepSeek all say so in as many words. If a provider is silent, that is not the same as permission.
2. **Who does the acceptable-use policy bind?** xAI's binds developers and businesses, not just consumers — which is why its resale clause reaches the API. Check scope before assuming an AUP is a consumer document.
3. **Do any *features* carry their own terms?** Google's Search grounding does, and it is stricter than the API terms around it. A capability map has to respect per-feature terms, not just per-provider ones.
4. **Does the consumer tier prohibit resale, programmatic access, or account sharing?** All four checked so far do, by varied wording. Assume it does and verify.

## Not legal advice

Clauses quoted as of July 2026, from the sources linked in the repository history. Terms change; your compliance is yours. If your situation is unusual — an enterprise agreement, a provider-approved reseller arrangement — the gate is a default, and Anthropic's §D.4 for instance contemplates resale "as expressly approved by Anthropic".
