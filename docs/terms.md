# Provider terms — what you may sell, and what you may not

Short version: **sell work produced with an API key; never sell what a personal subscription produces.** ARCADE enforces the second half rather than asking you to remember it — `arcade publish` and the runner's announce both refuse a subscription-backed listing.

The first half is not uniform. Providers differ in ways that matter, and this page records what each one actually says rather than assuming they converge.

## The comparison

Ten providers checked. The API/consumer split holds everywhere it was checked — but the *reasons* differ, and three providers have a wrinkle that a summary would flatten.

| Provider | API / business terms | Consumer subscription | Wrinkle |
|---|---|---|---|
| **Anthropic** | ✅ explicit: may power products for end users | ❌ OAuth is for "native Anthropic applications"; third-party devs may not offer Claude login or route plan credentials "on behalf of their users" | metering ≠ permission — see below |
| **OpenAI** | ✅ explicit; customer **owns Output** | ❌ for resale — but a **documented** app-server BYO-subscription path exists for embedding | ToS silent on commercial use of that path |
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

Note the carve-out in the second: *"or where we otherwise explicitly permit it"*. That carve-out is **not hypothetical, and it is broader than a reading of the terms alone suggests** — which is why market evidence was worth gathering rather than reasoning from documents.

Anthropic's Help Center, [updated 16 June 2026](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan):

> "We're pausing the changes to Claude Agent SDK usage described below. For now, nothing has changed: Claude Agent SDK, `claude -p`, and **third-party app usage still draw from your subscription's usage limits**."

So running a **third-party application** on your own Claude subscription is currently permitted and metered against your plan. That is exactly what OpenClaw, Conductor and similar harnesses do, and Anthropic staff have named them as covered.

The policy has moved repeatedly and the record is worth keeping, because the direction of travel matters more than any single snapshot:

| When | What happened |
|---|---|
| Feb 2026 | Docs stated OAuth from Free/Pro/Max in "any other product/tool/service — including Agent SDK" was not permitted. Walked back by the Claude Code team as a docs-cleanup error: "Nothing is changing about how you can use the Agent SDK and MAX subscriptions" — with an explicit split: **local development and experimentation on a subscription, businesses on the Agent SDK use an API key**. |
| Apr 2026 | Included subscription quota stopped covering third-party tools; usable via extra usage or an API key. |
| May 2026 | A separate metered monthly credit for third-party Agent SDK apps was announced. |
| **Jun 2026** | **That credit was paused. Third-party app usage draws from subscription limits again — the current state.** |

### The operative document, and the one I mistook for it

There are two Anthropic pages about subscriptions and third-party tools, they say different things, and confusing them is the error this section exists to prevent.

The **Help Center** page quoted above is about **metering** — what your plan is charged for. It is not a grant of permission. The **[Claude Code legal page](https://code.claude.com/docs/en/legal-and-compliance)** is the permission document, and it is unambiguous:

> "**OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and **other native Anthropic applications**."

> "**Developers** building products or services that interact with Claude's capabilities, **including those using the Agent SDK**, should use API key authentication through Claude Console or a supported cloud provider. **Anthropic does not permit third-party developers to offer Claude.ai login or to route requests through Free, Pro, or Max plan credentials on behalf of their users.**"

> "Advertised usage limits for Pro and Max plans assume **ordinary, individual usage** of Claude Code and the Agent SDK."

> "Anthropic reserves the right to take measures to enforce these restrictions and may do so **without prior notice**."

Three consequences, and the second is the one that closes a door people keep trying:

1. The Agent SDK is named on the **API-key** side. It is not a subscription carve-out, whatever the X discourse says.
2. **"On behalf of their users" forecloses the buyer-brings-their-own-subscription design.** A marketplace that let a buyer connect their Claude plan — even with the credential staying on the buyer's machine — is a third-party developer offering Claude login. That architecture is viable on Codex (below) and not here.
3. It does **not** foreclose a user running a third-party harness on their own plan. The Help Center names "third-party app usage" as drawing from subscription limits, so Anthropic contemplates and meters it. Confirmed empirically: OpenClaw's `claude-cli` runtime drives `claude -p` — Claude Code itself — and usage lands on the plan, not on extra usage. OpenClaw's own docs cite the same Anthropic article for this.

So the operative distinction is not "programmatic vs interactive" and not "first-party vs third-party". It is **who is doing it**:

| | |
|---|---|
| A **user** running a tool that drives Claude Code on their own plan | metered against the plan; contemplated |
| A **developer** shipping a product that offers Claude login or routes plan credentials for its users | prohibited |

A caution that survives regardless: extracting the OAuth token and using it as a raw API bearer against `/v1/messages` is a different path from driving Claude Code, and it is refused — "This credential is only authorized for use with Claude Code." Anthropic can also change billing and rate-limit behaviour without notice, which the legal page reserves explicitly.

### The Codex contrast

OpenAI documents the **Codex app-server** as being for "deep integration inside your own product", and ships **"Sign in with ChatGPT"** as a first-party feature of that embedding path (`learn.chatgpt.com/docs/app-server`, `/docs/auth`). That is a vendor-documented BYO-subscription architecture with no Anthropic equivalent, and several products ship on it.

The caveat is worth carrying: OpenAI has never affirmatively blessed subscription auth in a third-party **commercial** product. Asked directly (openai/codex discussion #8338), a maintainer addressed only the Apache licence and declined the terms question across three follow-ups. So the permission is architectural and implied, never written — which is a materially better position than Anthropic's explicit prohibition, and materially worse than §A.1's explicit grant.

**What this changes, and what it does not.** It settles that *programmatic* and *third-party* are not themselves the problem. Two things remain prohibited, and they are the two ARCADE actually touches:

- **Third-party developers offering Claude login, or routing Free/Pro/Max credentials on behalf of users.** OpenClaw is fine because the user authenticates on their own machine and the credential never reaches a hosted service. A platform that held or proxied a user's subscription credential would be doing the banned thing.
- **Building a business on it.** The Claude Code team's own line is that businesses on the Agent SDK use an API key — and §3's resale prohibition is untouched by any of the above. A stranger paying you for what your seat produced is resale regardless of which harness ran it.

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

## Where responsibility sits

ARCADE has no agreement with any model provider in the marketplace path — it never holds a credential, never calls a provider API, and inference happens on the seller's machine under the seller's agreement. So provider compliance is the seller's, and [`marketplace-terms.md`](./marketplace-terms.md) §2.1 says so in the place a seller actually agrees to it, rather than leaving it implied.

That is not unconditional, and the reason is worth knowing. Anthropic's Commercial Terms §D.4 restricts a customer from:

> "(a) …**resell the Services** except as expressly approved by Anthropic; (b) reverse engineer or duplicate the Services; or **(c) support any third party's attempt at any of the conduct restricted in this sentence.**"

Limb (c) is a platform clause. A marketplace that made subscription resale the easy path — or advertised it — would be supporting a third party's attempt at the conduct in (a), and ARCADE is itself an Anthropic customer the moment it runs a first-party skill on a key. So the publish gate is not only seller hygiene. It is the difference between a platform that refuses the conduct and one that facilitates it, which is exactly the distinction (c) draws.

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
