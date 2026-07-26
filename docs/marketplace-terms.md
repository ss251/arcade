# ARCADE marketplace terms

Draft. This allocates responsibility between the platform, sellers and buyers. It exists because "compliance is the seller's responsibility" is not a thing a platform gets to assert without having said so anywhere.

Not legal advice, and not yet reviewed by a lawyer. It is written to be honest about what the software actually does rather than to maximise what the platform can disclaim.

## 1. What ARCADE is

A hub that brokers payment and dispatches jobs. It holds a public listing, verifies an on-chain payment, routes a job to a runner over an outbound connection, validates the result against the listing's schema, and settles.

**What it is not:** an inference provider, a reseller of model access, or a party to any seller's agreement with a model provider.

This is structural rather than a claim. In the marketplace path the platform never holds, sees or transmits a provider credential, and never calls a provider API. Inference happens on the seller's own machine, on the seller's own key, under the seller's own agreement. `packages/core/src/manifest.ts` makes that a type-level property: the published projection has no field in which a credential, prompt or entry point could travel.

## 2. Seller responsibilities

**2.1 Provider compliance is yours.** You are responsible for your agreement with whichever model provider your skill uses. You represent that your credential permits the use your listing makes of it.

The platform helps where it can, and the help is enforcement rather than advice:

- `assertPublishable` refuses to list any skill declaring `credential: "subscription"`, on both the interactive and automatic routes to the hub. Every consumer subscription checked ([`terms.md`](./terms.md)) prohibits backing a paid endpoint.
- `arcade publish` prints the engine, the credential and the capability grants before publishing, so the blast radius is visible.
- Where a provider's terms are ambiguous, an advisory is printed rather than a refusal — the platform does not settle licensing questions on your behalf.

**None of that is a compliance guarantee**, and it is worth being precise about why: a runner is your hardware. A seller determined to route a `script` skill at a local proxy fronting a subscription can do so, and no marketplace can observe it. The controls above make the correct path the default and the incorrect path deliberate. They do not make it impossible.

**2.2 Your content.** You warrant you have the rights to the prompts, code and data your skill uses, and that its output does not infringe.

**2.3 What you grant a buyer.** On settlement you grant the buyer a perpetual, worldwide, non-exclusive licence to use, modify and redistribute the output of that call, including commercially.

This needs saying because every provider checked assigns Output rights to *you*, the API customer — OpenAI §4.1 ("owns all Output"), DeepSeek ("we assign any rights… to you"), Z.ai §IV.4. A buyer paying for a work product would otherwise receive something whose usage rights were undefined. Note you can only grant what you hold: if your provider's terms restrict downstream use of Output, that restriction passes through, and it is your job to say so in the listing.

**2.4 Accuracy.** You are responsible for what your skill returns. The platform validates output against your declared schema and nothing else — schema-valid and correct are different properties.

## 3. Buyer responsibilities

**3.1 Treat results as untrusted input.** A skill result is text authored by a stranger. If your caller is an agent, use `SkillResult.fencedResult`, not `result`, anywhere the output reaches a model. The SDK computes it on every call so the safe path is the default one; deliberately using the raw field reopens the risk. See [`threat-model.md`](./threat-model.md) T-EXEC-003.

**3.2 Your input goes to a seller.** You choose the seller and pay them; their runner sees your payload. Do not send credentials or data you would not send to that counterparty directly. Skills declare their capabilities, and `capabilities: []` means the job reaches neither the network nor the filesystem — but the seller's own prompt still sees your input.

**3.3 Verify before you rely.** Outputs are model-generated. Do not treat a brief, a triage or a summary as verified fact without checking it, particularly for anything with legal, financial or safety consequence.

## 4. What the platform is responsible for

Stated as commitments rather than disclaimers, since a document that only disclaims is not worth writing:

- **Settle only on success.** A job that refuses, times out, exceeds its bounds, returns invalid output or is rejected by a protocol limit does not settle, and the buyer's authorisation goes uncashed. That is the refund.
- **Never receive seller code.** The published projection is constructed from named public fields, not filtered from a private one, so a new private field cannot leak by omission.
- **Fence untrusted content in both directions**, at the protocol edge, without either party opting in.
- **Publish the take-rate on-chain.** The fee split is immutable in a deployed contract; anyone can read the ratio and check a receipt against it.
- **Report cost.** Receipts carry what a call cost the seller to produce, so margin is visible rather than inferred.

## 5. What the platform does not warrant

That any listing is accurate, available, or fit for a purpose. That a seller complies with their provider's terms. That an output is correct. The marketplace is a settlement and dispatch layer; the judgement about whether a given seller is worth paying is the buyer's, informed by the objective statistics the platform computes and the receipt-gated ratings it collects.

## 6. Data

The hub stores: listings, job inputs and outputs, receipts, and runner connection metadata. It does not store provider credentials, because it never receives them.

**A seller's provider may see buyer data.** That is a property of the seller's engine, not the platform, and it varies: Moonshot's API terms make training on submitted content the default absent an enterprise agreement, while Z.ai's API tier and Alibaba explicitly do not train on it ([`terms.md`](./terms.md)). A listing whose provider trains on submitted content should say so, and buyers should assume the worst where a listing is silent. Making that a mandatory disclosure field on the listing is an open item.

## 7. Open items

Honestly listed rather than quietly deferred:

- No legal review yet.
- No mandatory provider-disclosure field on listings (§6).
- No dispute process beyond the settle-on-success rule.
- Governing law unspecified.
- Mistral's terms remain unverified ([`terms.md`](./terms.md)).
