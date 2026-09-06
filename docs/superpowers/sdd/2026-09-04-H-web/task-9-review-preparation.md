> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H9 independent review preparation

2026-09-06. Read-only preparation after H8 commit `b7fee76`. Fully read
`h9-contract-preflight.md`, `task9-10-readiness-current.md`, and complete Tasks 9–10
in Plan H. No source/test edits, executed tests, runtime checks, browser, network,
Git, credentials or payment occurred. This is a proposed review matrix, not a
finding, behavioral Red, source freeze or implementation acceptance.

## Scope and announced API

The corrected two author paths are `apps/web/src/lib/job-store.ts` and
`apps/web/test/job-store.test.ts`, not `jobs.ts`. B9 owns both; source remains in
progress. Announced types are `StoredJob`, `JobScope`, `JobReadState`,
`RememberOutcome`, and `ForgetOutcome`; functions are `remember(input: unknown)`,
`get(jobId: unknown, scope: unknown)`, `forget(jobId: unknown, scope: unknown)`,
`list()`, `readState()`, and `forgetAll()`.

The accepted seven-scalar ordinary-only row, composite issuer/realm/job identity,
canonical origin and uint256 validation, whole-envelope refusal, 200-row/262144-byte
caps and explicit valid-remember recovery remain authoritative. No API refinement
is needed from this preparation. B9 confirmed storage will be captured once per
operation after argument validation; successful recovery exposes `recovered` and
other outcomes contain fixed statuses only.

## Additional focused review cases

| Boundary | Concrete expected observation |
| --- | --- |
| Storage capture | A storage accessor that returns different instances on successive reads is consulted once per operation; reads and mutation target that same captured instance. |
| Validation ordering | Invalid remember input or get/forget scope causes zero storage getter/getItem/write calls, even when the stored envelope is corrupt. |
| Call-time availability | Import and SSR never touch a global server localStorage shim; subsequent browser storage replacement, denial and restoration are observed without cached success or memory fallback. |
| Capacity and identity | An exact duplicate at 200 rows or the byte ceiling returns already_stored with zero writes. Every changed immutable scalar on the same identity conflicts; another issuer remains independent. |
| Corruption and recovery | Read/list/get and invalid-envelope forget do not repair or mutate bytes. Invalid remember cannot recover. Valid remember reports recovered only after a successful write; denied/quota failure cannot report stored. |
| Deletion scope | Missing scoped forget does not write; deleting one issuer preserves another issuer's same job ID. Explicit forgetAll removes only KEY and can remove malformed data without parsing it; failure cannot report removed. |
| Copy and diagnostic boundaries | Mutating the input or returned read/get/list rows cannot modify retained state. Fixed status/error paths do not echo entries, capabilities or thrown storage diagnostics. |
| Ordering | Equal timestamps use raw code-unit origin/realm/job ordering, never locale or token ordering; listing alone does not rewrite stored order. |
| Complete envelope | One invalid/legacy row or duplicate composite identity invalidates all rows, including identical duplicates; no partial salvage or implicit issuer migration. |
| Byte limits | Check exact byte cap and +1 before parsing, and separately actual encoded-write overflow before setItem. JSON whitespace/escape inflation can exercise raw size independently of row count. |

Scope and row descriptor cases should include own-data success and missing, extra,
inherited, accessor and symbol fields without invoking getters/toJSON. Amount cases
include zero, uint256 max/max+1, leading zero, exponent, decimal, newline and non-ASCII
digits, with length/alphabet checks before BigInt; time uses safe-integer bounds.
Origin aliases must refuse rather than normalize into an existing issuer.

These are bounded localStorage observations, not arbitrary hostile-storage rollback
or hostile-Proxy isolation claims. An injected object that writes and then throws
does not establish browser atomicity; cross-tab read-modify-write races, XSS, lost
storage, capability expiry and server-secret rotation remain documented limits.

## H10 prerequisites remain separate

Current server-side acceptance/polling does not yield browser-only token custody.
H9 stores no session ID, grants no resumable F session capability, adds no CORS or
direct-browser paid transport, and authorizes no capability relay through a Start
server function. A realm label is producer context, not cryptographic token typing.
H10 must use `readState()` to distinguish unavailable/corrupt storage from an empty
history and a token-free projection for UI, model history and serialized props.
Captured price is accepted authorization metadata, not confirmed spend or refund.

## Next review boundary

Wait for the parent's exact source/test freeze. Then read both complete files and
author chronology, verify pins, and run only the released canonical installed
Vitest selection and exact nested strict checks. Any supplementary probe must be
offline and separately attributed. No unfinished draft is accepted here and no
additional H9 or H10 architecture is proposed.
