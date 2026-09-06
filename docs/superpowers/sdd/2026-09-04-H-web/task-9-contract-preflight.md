> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H9 contract preflight — ordinary browser recovery records

2026-09-06. Read-only preparation; H9 source remains held. The proposed parent
contract is suitable with the small result/diagnostic decisions below. No executed
behavioral Reds, code, tests, browser, network, Git or runtime work occurred.
Fully read Tasks 9–10, earlier current readiness and actual relevant H4/F/ordinary
producer contracts. The fully read ts-testing skill guided the focused matrix only.

## Recommended fixed contract

- Keep `KEY = "arcade.jobs.v1"` and a bounded JSON array under that key; no implicit
  migration. Each plain own-data row has exactly `jobId`, `token`, `skillId`,
  `priceAtomic`, `createdAtMs`, `hubOrigin`, `realm: "ordinary"`. No session ID,
  output, receipt, nonce, authorization, error or arbitrary future field. Copy
  only validated scalar values; do not invoke row getters, coercions or toJSON.
- Use actual ordinary/H4/core grammar: job suffix 16–128 ASCII alphanumerics;
  skill ID `[a-z0-9][a-z0-9-]{1,63}` (2–64 characters); token exactly 32 lowercase
  hex. Canonical decimal uint256 is bounded in length/alphabet before BigInt;
  zero is valid local metadata, not evidence of free execution. Timestamp is a
  nonnegative safe integer, captured acceptance time, not settlement time or a TTL.
- Bound raw storage text to 262144 UTF-8 bytes before JSON.parse: first a cheap
  code-unit ceiling, then bounded encoding. Maximum 200 rows and the same actual
  encoded byte ceiling on writes; reaching either returns capacity. No eviction.
  Reflection exceptions are fixed refusal, not hostile-Proxy execution isolation.
- Origin is a bounded string (2048 characters), exactly `new URL(value).origin`,
  with no credentials/path/query/fragment/whitespace/backslash and no normalization
  of a supplied issuer. HTTPS is permitted; HTTP only literal `127.0.0.1`/`[::1]`.
  Explicit default ports, case changes, trailing slash and shorthand IP forms must
  not become accepted aliases by parsing. Match F's captured-origin discipline.
- `(hubOrigin, realm, jobId)` is the identity everywhere. `get` and `forget` require
  an exact validated scope, never a default current origin. `list()` returns all
  validated rows as fresh defensive copies. Sort descending timestamp, then raw
  code-unit lexical origin, realm and job ID; never locale-dependent or token order.
- Exact duplicate means all seven scalar values agree: return already_stored and
  do not write, even at capacity. Any changed token, skill, amount or timestamp for
  the same identity is conflict; retain the original bytes. H10 must reuse captured
  acceptance time, not Date.now() again on every retry. Another origin may use the
  same job ID without collision; it still needs a separately explicit scope.
- Resolve browser storage at call time, never import time or module cache. SSR is
  unavailable and must not consult a server-side localStorage polyfill/file. A real
  browser's storage getter/getItem/setItem/removeItem faults become fixed outcomes.
  No fallback in-memory "stored" success. `forgetAll` removes only KEY, never clear().

## Whole-envelope failure and two small API additions

Recommend reject the **whole** envelope for malformed JSON, invalid/excess rows,
legacy issuer-less rows or duplicate composite identities, even exact duplicates.
Partial salvage creates an apparently authoritative selection while silently
dropping capabilities. Reads return no usable rows and never repair/save/delete.

The parent's explicit valid-remember recovery requirement can still hold: only a
fully validated remember may replace a malformed existing envelope with its one
new row, and only after successful setItem. Failed validation/storage leaves prior
bytes untouched. This exception replaces unreadable data, not eviction from a valid
store. It must be visible, because malformed data might contain recoverable entries.

Two narrow proposed API refinements for parent acceptance, not implemented exports:

1. Add `readState(): { status: "ready" | "invalid" | "unavailable"; jobs:
   readonly StoredJob[] }`, using the same one-read decoder as list/get. Missing key
   is ready/empty; corrupt key is invalid/empty; SSR/denied IO is unavailable/empty.
   Preserve convenient list/get signatures, but H10 must use readState for empty
   copy rather than turn disabled storage into "no purchases." No extra query/cache.
2. Use a discriminated remember outcome with the approved status vocabulary;
   `stored` includes `recovered: boolean`. `recovered: true` explicitly warns H10
   that malformed prior local data was replaced. `unavailable` never means stored;
   invalid input, capacity and conflict preserve bytes. Forget/forgetAll should
   likewise expose removed/not_found/unavailable/invalid so the UI cannot claim
   local capability deletion after a denied write. Forget on invalid envelope
   refuses; explicit forgetAll may remove it without decoding.

## Concrete compatibility and H10 constraints

- H4 `hubOrigin()` currently defaults to `http://localhost:8787` and allows that
  alias; the proposed H9 rule and actual F `sessionOrigin` reject it. Keep H9 strict.
  Later browser configuration/fixtures must explicitly select literal loopback or
  HTTPS. Do not silently rewrite existing issuer-less/localStorage rows or widen H4.
- Shape validation cannot cryptographically distinguish a session token from an
  ordinary token. Realm is a trusted producer-context assertion. Actual F hides its
  session capability and returns no resumable export; no interception, invented
  sessionId, session grouping, ordinary tree fallback or automatic session opening.
- Current `/api/settle` still holds the ordinary acceptance/poll capability on the
  web server and returns only terminal data. H9 alone cannot populate this store or
  fulfill browser-only custody. Do not claim H10 recovery works until separately
  released direct-browser acceptance/transport work preserves approval authority.
- H10 needs composite selection keys and a token-free render projection. Do not
  put a StoredJob into Start props, tool/model history, DOM attributes, query strings
  or diagnostics. Browser retrieval must target the captured issuer via headers,
  with no web server-function relay. CORS/transport ownership remains a separate
  prerequisite, as recorded in the earlier readiness; no new endpoint is proposed.
- `priceAtomic` is recorded accepted/authorized exposure, not spent, balance,
  refund or a budget ceiling. Re-read terminal evidence for settlement display;
  retain pending/unknown limitations. Storage loss, origin changes and hub secret
  rotation can make recovery unavailable. Public receipts are not a per-buyer
  directory or independent proof of this entry's settlement.
- A successful single localStorage write is not cross-tab atomicity, durable backup,
  cross-device recovery, token validity, XSS resistance or payment idempotence.
  Concurrent read-modify-write calls can lose updates; state that limit, no claim of
  locking. Re-read on each operation, but do not add architecture in H9 to solve it.

## Focused proposed behavior matrix (not run)

1. Valid own-data storage/defensive copies and mutation isolation; import/SSR inert;
   storage access/quota/removal faults fixed and unrelated keys unchanged.
2. Canonical ID/token/skill/money/timestamp boundaries, uint256 max/max+1 and zero;
   accessors/symbols/inherited/extra fields without getter/toJSON execution.
3. Canonical HTTPS and literal IPv4/IPv6 origins; reject localhost, aliases, userinfo,
   path/slash/query/fragment/default-port normalization and control characters.
4. Same ID across issuers; required scope; exact duplicate performs zero writes;
   each changed immutable field conflicts; deterministic equal-time order.
5. Exactly 200 rows vs 201 and exact UTF-8 byte cap vs +1; duplicate at full capacity
   remains idempotent. Invalid/oversized whole envelope gives no partial rows or
   automatic write; valid remember alone visibly recovers; invalid remember cannot.
6. H10-facing diagnostic/read states and deletion outcomes; no false spend or session
   inference. Existing installed Vitest, canonical Node-hosted Bun invocation and
   exact nested strict after source release; missing-module is setup, not a Red.

Source basis: Plan H `74c41a74…`; earlier readiness `ea1a26d2…`; H4 transport
`25d571dd…`, decoder `2b2d10c4…`; F session facade `1c910301…`, wire `ea2b7e79…`;
ordinary settle route `3132399b…`; threat model `e65ad2fd…`. These are inspected
checkpoint pins, not a new source freeze or acceptance of the known H10 gaps.
