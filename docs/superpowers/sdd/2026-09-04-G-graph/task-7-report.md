> Public execution record. Original retained unchanged in private task preparation; this report is a dated offline checkpoint, not live authorization or evidence.

# Plan G Task 7 implementation report

## Scope

Implemented the fail-soft, read-only hub Graph service in:

- `apps/hub/src/graph.ts`
- `apps/hub/test/graph.test.ts`

No optional Bun-only test was needed. No routes, payments, deployment files, dependencies,
keys, accounts, or live networks were touched. Concurrent `skills/counterparty-graph/*`,
`package.json`, and `bun.lock` changes were left untouched.

## Genuine TDD evidence

Red, before `apps/hub/src/graph.ts` existed:

```text
bunx vitest run apps/hub/test/graph.test.ts
FAIL  apps/hub/test/graph.test.ts
Error: Failed to load url ../src/graph.ts ... Does the file exist?
```

Green, after implementation and the final decoder/transport audit:

```text
bunx vitest run apps/hub/test/graph.test.ts
Test Files  1 passed (1)
Tests       15 passed (15)

bunx tsc --noEmit
exit 0
```

The first implementation run was 11 passing / 1 failing because the draft test incorrectly
assumed child-hop total must not exceed root settlement total. The contract documents that
child hops are paid from the hiring seller's wallet, so that is not a valid invariant. The
test was corrected and the production decoder intentionally preserves exact child totals.

A second test-first transport audit then produced two behavioral Reds: a valid bounded response
without `Content-Length` returned `null`, and a late response from a fetch that ignored abort was
not canceled. The new real-loopback test initially hit the expected managed-sandbox `listen EPERM`;
when run with loopback permission it proved redirect refusal and the five-second unfinished-body
deadline. After the fixes, the complete 15-test suite passed, including the 5.03-second loopback
case, and strict TypeScript again exited 0.

## Implemented guarantees

- Preserved the planned `GraphStats`, `AgentEvidence`, `TreeView`, `Graph`, `GraphTag`,
  `makeGraph`, `GraphOff`, and `GraphFromEnv` interfaces.
- Uses only three fixed GraphQL documents and validated variables.
- Requires a valid `_meta.block`, `hasIndexingErrors === false`, exact singleton/listing/tree
  bindings, canonical Arc agent IDs, coherent tree/root transaction and block identities, and
  canonical non-negative integer encodings.
- Rejects missing, non-canonical, overflowed, or unsafe counters/money rather than manufacturing
  zero, `NaN`, or rounded values. GraphQL `Int` fields are capped at signed 32-bit range.
- Converts every configuration, provider, framing, decoding, or timeout failure to `null`; the
  public Effect error channel remains `never`. Runtime Effect interruption correctly preserves an
  interrupted exit while aborting/canceling underlying work rather than fabricating a `null` value.
- Restricts endpoints to HTTPS or explicit loopback HTTP; rejects URL credentials, query,
  fragment, whitespace/control characters, invalid keys, and invalid TTLs. There is no Studio
  URL default.
- Sends `redirect: "error"`, `credentials: "omit"`, identity encoding, an explicit fixed JSON
  request, and only the configured bearer credential. It never logs the key, endpoint, or
  provider diagnostics.
- Enforces a five-second headers-plus-body deadline, accessible response-header cap, 64 KiB body
  cap, exact canonical `Content-Length` when supplied, bounded chunked responses when it is absent,
  JSON content type, identity encoding, fatal UTF-8, abort propagation, and response-body
  cancellation, including a late response from a non-cooperative fetch.
- Bounds cache size to 256 entries, validates TTL, singleflights identical keys, caps global
  provider concurrency at eight, and keeps unknown/malformed results as `null`.

## Test coverage and source corrections

The focused suite covers successful stats/evidence/tree decoding; fixed query bindings and
request policy; missing/incoherent metadata on all query types; malformed counts, money,
relationships, hashes, Arc IDs, block/transaction identities, JSON, HTTP, GraphQL errors,
headers, content length, encoding, body size, and network failure; TTL/cache eviction;
singleflight/global in-flight bounds; Effect interruption/stream cancellation; late-response
cancellation; URL/key/env validation; a real owned-loopback 302 refusal and unfinished-body
five-second deadline; loopback configuration; and `GraphOff`.

Deliberate corrections to unsafe literal examples in the plan:

- Every query includes and validates `_meta`, not only stats.
- Queries bind the full identity/coherence fields needed to validate their returned entity.
- Numeric decoding is strict and total rather than missing-to-zero coercion.
- The plan's illustrative Studio endpoint is not treated as a live/default endpoint.
- Fetching is bounded, credential-minimal, non-redirecting, cancellable, singleflighted, and
  concurrency-limited.
- A missing `Content-Length` is accepted as valid chunked framing while the streamed byte cap still
  applies; when the header exists, its canonical value must match the received bytes exactly.
- No invalid child-total-versus-root-volume restriction was introduced; those funds originate
  from different payer legs.

No independent funded run or live Graph deployment is claimed.
