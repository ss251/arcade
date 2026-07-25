# Provider terms — what you may sell, and what you may not

Short version: **sell work produced with an API key; never sell what a personal subscription produces.** ARCADE enforces the second half rather than asking you to remember it — `arcade publish` and the runner's announce both refuse a subscription-backed listing.

The first half is not uniform. Providers differ in ways that matter, and this page records what each one actually says rather than assuming they converge.

## The comparison

Ten providers checked. The API/consumer split holds everywhere it was checked — but the *reasons* differ, and three providers have a wrinkle that a summary would flatten.

| Provider | API / business terms | Consumer subscription | Wrinkle |
|---|---|---|---|
| **Anthropic** | ✅ explicit: may power products for end users | ❌ three separate prohibitions | — |
| **OpenAI** | ✅ explicit; customer **owns Output** | ❌ no selling Services; no programmatic extraction of Output | no blanket automated-access clause in the API terms |
| **DeepSeek** | ✅ explicit: services to **external end users**; assigns Output rights | ❌ | most permissive API terms checked |
| **Moonshot (Kimi)** | ✅ explicit: Customer Applications offered to End Users | ❌ **strictest of all — no commercial use at all** | ⚠️ API tier **trains on your content by default** |
| **Z.ai (Zhipu/GLM)** | ✅ explicit: downstream systems for your end users; **no training on End User Content** | ❌ | cleanest consumer/API separation of the set |
| **Qwen (Alibaba)** | ✅ Model Studio API; Alibaba states no training on customer data | ❌ most explicit prohibition of any | Qwen Code's OAuth tier is the consumer tier |
| **Google Gemini** | ✅ for the API — ⚠️ **Search grounding bans resale separately** | ❌ (one limb, not three) | a *feature* stricter than the provider |
| **xAI** | ⚠️ AUP binds API users and forbids "reselling any Input or Output" | ❌ | the outlier |
| **OpenRouter** | ⚠️ no reselling API access; you inherit every upstream provider's terms | — | pass-through liability |
| **Mistral** | not verified — the legal centre would not yield the document cleanly | — | treat as unknown |

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

**Open Platform (API) terms are the most permissive of any checked:**

> "You can integrate the capabilities of the DeepSeek models into various downstream systems, applications, or functionalities for intended purposes and specific scenarios, **providing services to both internal and external end users**."

> "**We assign any rights, title, and interests—if any—in the Outputs of the Services to you.**"

The general Terms of Use, which apply to all account holders rather than only consumers, still close the subscription route: §3.6(4) forbids "copying, transferring, leasing, lending, selling, or sub-licensing the entire or part of the Services" without authorisation, and §2.3 "Do not transfer, lend, rent, or provide your account to others in any form."

### Google Gemini

**Consumer tier** (Gemini app, Google One AI Premium) is governed by the main Google Terms of Service — the standalone generative-AI terms were folded into it in May 2024, so that page is stale and should not be cited. The operative clause:

> "You may not copy, modify, distribute, **sell**, or lease any part of our services or software."

Note what is *not* there. Google's automated-access restriction is scoped to `robots.txt` — "using automated means to access content from any of our services **in violation of the machine-readable instructions on our web pages**" — rather than banning programmatic use outright, and no standalone account-sharing prohibition appears. So the case rests on the sell/distribute limb alone.

**API tier** permits making API Clients available to users. The catch is narrower and easy to miss: **Search grounding has its own terms.**

> "You will not…cache, frame, syndicate, **resell**, analyze, train on, or otherwise learn from **Grounded Results**."

> "You will not allow end users to…access or collect Grounded Results **by automated means**."

A skill that declares `web-search` on a Gemini engine and returns grounded results to a paying buyer is doing something those two sentences describe fairly directly. A Gemini-backed skill with **no** search capability has no such problem. If the Gemini engine lands, that distinction has to be enforced in the capability mapping rather than left to the seller.

### Moonshot (Kimi)

**Consumer Kimi is the most restrictive tier of any provider checked**, and the contrast with its own API terms is the sharpest in this document:

> "without the written consent of us and/or the relevant rights holders, (i) you have no authority to use Kimi and the content generated by Kimi **in any commercial manner**"

That bars commercial use of the *output*, not merely resale of access — so it reaches uses the other providers' consumer terms arguably do not. Account transfer is separately gated on legal process or Moonshot's consent.

**The API tier is the opposite.** Permission is explicit — §1, Services:

> "This license allows you to use Moonshot AI's application programming interfaces ("APIs") to integrate the Services into your own applications, products, or Services (each referred to as a "Customer Application") and **to offer those Customer Applications to End Users**."

§3.2 prohibits "Copying, transferring, renting, lending, selling, or providing sub-licensing or re-licensing of **the Services**" — the Service, not the Output, which is the same shape as Anthropic and OpenAI. §4 confirms "we do not claim ownership of it".

**The wrinkle is privacy, not resale.** §4, Content:

> "We may use Content to provide, maintain, develop, support, and improve the Services… **Unless otherwise expressly agreed in writing, Customer Content may be used for the foregoing purposes.**"

Training on customer content is the **default**, opt-out only via an enterprise arrangement. For a marketplace that matters more than it would for a personal tool: the content flowing through a skill is the *buyer's* data, and the buyer never agreed to it improving Moonshot's models. A Moonshot engine should therefore require an enterprise agreement before it can be published, or the listing has to disclose the data flow — this is a commitment ARCADE makes to buyers, not a seller preference.

### Z.ai (Zhipu / GLM)

The cleanest consumer/API separation of the set. Additional Terms for API Services §1(a):

> "We grant you a non-exclusive right to access and use the API Services during the valid term, which includes the right to use Z.ai's API to integrate the Services into your applications or **to develop downstream systems, applications or functions to your end users**."

§IV.4: "you retain all rights, title, and interest in the Prompts you submit and the **Outputs**". And the API tier gets a protection the consumer tier does not — Additional Terms §3(b):

> "We will not use End User Content to develop or improve Services, unless you explicitly agree to such use."

against §IV.3(a) for general User Content, where "we reserve the right to process any User Content to improve our existing Services". The consumer-side automated-access ban (§III.4(b): "deep linking, page scraping, social bots, spiders, or other automated means") sits in the consumer section, with the API governed by its own Additional Terms — a distinction other providers blur.

The export clause (§XIII.2, "may not resell, export, or transfer Z.ai products… to specific individuals or countries subject to regulatory restrictions") is export control, not a general resale ban.

### Qwen (Alibaba)

Two tiers, and Qwen Code exposes both — its own docs say so plainly: Qwen OAuth is governed by the **consumer** Terms of Service, while an Alibaba Cloud Model Studio API key is governed by Alibaba Cloud's. Qwen Code itself "does not use your prompts, code, or responses for model training"; what happens upstream depends on which you authenticated with.

The consumer terms are the most explicit prohibition encountered anywhere:

> "(b) interact with, extract, or download any information, data or content from the Services (**including without limitation the Outputs**) **in an automated manner**; (c) scrape, mine, or distil any information, data or content from the Services (including without limitation the Outputs) whether using scripts, engines, software, tools, agents, devices…"

> "Your account is personal to you and is meant only for your usage. You must not share your account credentials or allow anyone else to access or use your account, or borrow, rent, transfer, or **sell any account**."

Note that this one names Outputs directly and names *agents* as a prohibited means. A Qwen-Code-on-OAuth endpoint is squarely out; Model Studio with an API key is the commercial path, and Alibaba states customer data is not used for training.

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

## Can a subscription be reused? Seven for seven: no

Asked directly of every provider with a consumer tier, the answer is the same — but no two get there the same way, and the strength of the prohibition varies a lot.

| Provider | Verdict | The clause that bites |
|---|---|---|
| **Anthropic** | **No** — three independent limbs | resale; automated access outside an API key; "may not make your Account available to anyone else" |
| **OpenAI** | **No** — two independent limbs | "sell or distribute any of our Services"; "Automatically or programmatically extract data or Output" |
| **Qwen** | **No** — most explicit of any | extraction of "the Outputs… in an automated manner… using scripts, engines, software, tools, **agents**"; no "borrow, rent, transfer, or sell any account" |
| **Moonshot (Kimi)** | **No** — strictest of any | "you have **no authority to use Kimi and the content generated by Kimi in any commercial manner**" without written consent |
| **Z.ai** | **No** | "deep linking, page scraping, social bots, spiders, or **other automated means** to access this service… is strictly forbidden" |
| **DeepSeek** | **No** | "copying, transferring, leasing, lending, selling, or sub-licensing the entire or part of the Services"; "Do not transfer, lend, rent, or provide your account to others in any form" |
| **Google** | **No**, but on one limb only | "You may not copy, modify, distribute, **sell**, or lease any part of our services or software" |

Two of these are worth calling out because intuition points the wrong way:

**Moonshot is the strictest, not the most permissive.** Its API terms are as open as anyone's, which makes it easy to assume the consumer tier follows. It does the opposite: consumer Kimi bars *any* commercial use of the service **or its output** without written consent — not merely resale. A skill you sell using consumer Kimi would breach that even if no third party ever touched the account.

**Google's is the weakest case, not a permission.** "Sell… any part of our services" clearly reaches a paid endpoint, but Google's automated-access clause is scoped to `robots.txt` violations rather than programmatic use generally, and there is no standalone account-sharing prohibition. So the prohibition rests on one limb where Anthropic's rests on three. Weaker is not absent — but if a provider ever *did* permit this, Google's wording is the shape it would take.

**One genuinely unresolved case: developer subscriptions.** Several providers now sell subscription plans aimed at developers rather than consumers — Z.ai's coding plan is the clearest example, bundling API access at a flat monthly rate. Whether such a plan is governed by the consumer terms (automated access forbidden) or the API Additional Terms (downstream services to end users expressly permitted) is not obvious from the documents, and the answer decides whether it can back a listing. ARCADE treats `credential: "subscription"` as unsellable regardless, which is the safe default; if you hold such a plan and want to sell on it, get that in writing first.

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
4. **Does the consumer tier prohibit resale, programmatic access, or account sharing?** Every one checked does, by varied wording — Qwen's is the most explicit, naming Outputs and agents directly. Assume it does and verify.
5. **Is training on customer content the default?** Moonshot's is, opt-out only at enterprise scale; Z.ai's API tier and Alibaba explicitly are not. This is the question a seller is least likely to ask and the one buyers care about most, because the content flowing through a skill is the *buyer's* data and they never agreed to it improving anyone's model. Treat it as a disclosure obligation, not a preference.

## Not legal advice

Clauses quoted as of July 2026, from the sources linked in the repository history. Terms change; your compliance is yours. If your situation is unusual — an enterprise agreement, a provider-approved reseller arrangement — the gate is a default, and Anthropic's §D.4 for instance contemplates resale "as expressly approved by Anthropic".
