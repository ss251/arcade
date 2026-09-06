> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10a independent review preparation

2026-09-06, after H9 `7cc4409`. **Read-only preparation, not source acceptance.**
Fully read the public H10a brief, both complete authority/transport preflights,
current H4 hub/quote and HTTP modules, and the production hub configuration,
dispatch, ordinary POST/acceptance/result/tree branches. Also inspected actual
Gateway signing-domain classification, Test challenge metadata and F header gates.
No tests, gates, browser, network, credentials, payment or Git action occurred.
Only this private note was written; both authors' source may still evolve.

## Accepted contract pins

| Document | SHA-256 |
| --- | --- |
| public task-10a-brief.md | `693039dfc8b160045714b43645b01995cf409e712736c54637bcd3b41c968fb1` |
| internal/h10-authority-preflight.md | `e427eb3cd29ecb3be8b2ec3166fef3041150b6c5a85ea72894f092c61e39a99d` |
| internal/h10-transport-preflight.md | `d9354dbb84008663d6b6216155bd538da6baf364b0bc7acf105f27f6f0289e4a` |

The public brief's passive H10a / active H10b / dashboard H10c split supersedes
earlier proposed numbering in the historical private notes. No F session export,
ordinary fallback for F capabilities, wallet entry or purchase wiring is authorized.

## Concrete composition checks for the frozen review

| Boundary | Required deny-first or preservation case |
| --- | --- |
| Captured issuer | Capture configured web and public hub origins once. Mutation of configuration or Host/forwarded headers cannot change challenge/acceptance authority after startup. At the quote boundary, capture one issuer before any await: listing, actual-input challenge, optional ENS read and returned browser context all use it. |
| Origin presence | No Origin retains existing F/CLI protocol and auth. Present empty, null, malformed, foreign, normalized alias or multiple origins are not absence. Armed policy with missing/invalid public origin refuses configuration; absent browser configuration grants no cross-origin route. |
| Preflight versus actual | OPTIONS parses bounded method/header-name declarations without body, Store, rail, lineage or admission work. Actual requests validate their actual payment/capability headers, not an Access-Control-Request-Headers declaration. Native browser-controlled headers must not be mistaken for arbitrary author-request header permission. |
| Route/realm | Exact ordinary path/method only; reject encoded/slashed aliases, query tokens and unsupported private paths. Present-even-empty session, hire or authorization headers refuse before F dispatch or ordinary fallback. No-Origin F routes remain independently authenticated and unchanged. |
| Payment header snapshot | Headerless JSON probe stays unpaid. When the browser supplies the two payment headers, require their permitted identical form; divergent or malformed presence refuses before business IO. Do not decode/re-encode valid payment bytes or consume a body in the policy wrapper. |
| Response decoration | Allowed 402/202/200 and failure statuses receive the same approved origin plus private/no-store. Preserve existing Vary tokens, status, body bytes and unrelated headers. No wildcard, credentials, private-network grant or reflected unvalidated header list. |
| Quote provenance | Skill/seller resource and original requirements match the captured issuer, chain, asset, amount and payee; optional verified ENS name only follows the existing exact endpoint/owner/payee/chain checks. Preserve legitimate splitter payees rather than universally equating payTo with seller. |
| Operational rail | Read top-level rail from the selected actual Rail.name, not signing-domain metadata. Missing rail preserves old quote compatibility without inventing browser authority. Invalid present values fail closed. Test's USDC metadata must never become implicit EIP3009 signing eligibility; malformed Gateway cannot fall through to USDC. |
| Caller-owned inputs | Context, requirements, payload and selection are captured before asynchronous work; mutation/getter/toJSON behavior cannot redirect capabilities or change forwarded bytes. Reuse H9 capture rather than a divergent job decoder; its reflection-refusal regression stays covered. |
| One bounded request | Fixed captured-origin paths, header-only token, omit credentials, error on redirects, no cache/Referer, bounded declared and actual bytes, fatal UTF-8/JSON, monotonic complete-response deadline. Pre-abort refuses before fetch; late responses are cancelled and listeners/timers released, including uncooperative-reader cleanup bounds. No HTTP failure retries a paid POST. |
| Retrieval ownership | Abort before and after Store awaits and during the ordinary poll timer stops further retrieval reads; stale continuations cannot emit a later successful read response. Never interrupt the separately admitted execution/settlement fiber or characterize cancellation as payment revocation. |
| Passive results | Tree uses actual H4 root-correlated decoder and provenance rules. A bounded raw result remains untrusted terminal evidence until the later active/dashboard layer correlates it. HTTP success or accepted price is not confirmed spend, balance, refund or on-chain finality. |

## Specific current-source observations, not new behavioral findings

1. Current H4 quote calls helpers that resolve hubOrigin independently across
   listing/probe/ENS awaits. Capturing only the last returned origin would not
   establish a single-issuer quote. Sent B9 this quote-only capture case; non-quote
   public transport need not change.
2. Current hub publicOrigin reads raw environment on demand and ordinary poll_url
   uses socket origin. The accepted new armed-policy capture must replace this
   ambiguity for ordinary browser challenge/acceptance, not simply relabel the old
   helper as validated. The legacy query-token field remains for CLI compatibility;
   new browser transport must not navigate to it or store it.
3. Current F handlers precede ordinary dispatch. New browser denials must happen
   before a browser request can enter a forbidden realm, while preserving no-Origin
   behavior. Sent G3 the presence-versus-absence and actual/preflight distinction.
4. Actual Test challenge emits the same USDC name/version as EIP3009. The added rail
   field is necessary reported context, not independent verification of settlement.

## Evidence ownership and limits

G3 owns pure policy plus actual production-router tests, including zero-IO counts,
captured proxy origin, body preservation and cancellation cleanup. B9 owns passive
context/H9 capture/HTTP and quote tests with bounded injected fetches. Their eventual
frozen composition must agree on route shape, header names, reported rail and exact
public origin; matching mock responses alone do not prove that agreement.

At the parent's frozen release, read full source/tests and both author chronologies,
then run only the permitted canonical focused suites, scoped strict and bounded
offline counterexamples. Missing-module failures remain setup, not product Reds.
The ts-testing behavior-first approach guides this matrix; no test was executed here.

Parent owns the active integration and native two-origin browser acceptance before
H10b/H10c completion. This note establishes no native CORS, proxy, private-network,
wallet/signature, capability custody, purchase idempotence or browser cleanup proof.
The old active relay, fresh human permit, signature binding, acceptance persistence,
terminal correlation and token-free history/UI remain later separately released work.
