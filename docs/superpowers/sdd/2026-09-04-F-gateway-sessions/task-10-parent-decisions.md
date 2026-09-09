> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F10 parent release decisions — September 6, 2026

Parent fully read the source handoff
`113fd3ebdc0576491d9907ff7bd3a0247729a6a9de4519badceea396624d8208`
and independent readiness review
`d2eee7b02908855cc04aa3d8769cfbb531b53d77b0dfb005da6e513dbbc0d690`.
Accept both with these refinements. Source remains held until F9's reviewed
commit; this is preparation, not executed F10 evidence.

Start with exactly three paths: mcp.ts, existing mcp.test.ts and new
mcp-session.test.ts. Actual Client/InMemoryTransport is sufficient to exercise
the installed protocol's cancellation and disconnect. Do not create the optional
native fixtures unless a concrete unresolved integration boundary requires them
and the parent releases those additional paths. No dependency or F9 change.

Installed SDK1.29.0 ignores cancellation notifications for requestId0 or an empty
string, though the general ID schema accepts them. Parent inspected actual
protocol.js and its exposed extra.requestId. Choose the narrow app refusal:
createServer rejects those two tool-request IDs before any dispatch, key or IO,
with a fixed diagnostic. Test through actual transport with explicit IDs. Do not
patch dependencies, invent a cancellation bridge or claim every schema-valid ID
can be canceled. Ordinary generated client tool IDs are unaffected. Transport
close aborts every active handler; tests still must prove application propagation.

Capture own-data normalized arguments before the queue await; delayed caller
mutation cannot change service/input/caps. Preserve the predecessor dependency
when a middle waiter cancels. An early caller response must not release its queue
successor ahead of the active predecessor or allow the canceled work to run.

Capture the handle/generation for read-only operations. Old quote/status/budget
completion cannot clear or reclassify a newer handle, reset process totals or
unlock ordinary fallback. Prefer no global lifecycle writes from unqueued reads;
perform close-unknown recovery and handle clearing within the serialized close
operation. A missing handle during uncertain opening is not an idle state.

Budget balance reads retain both public buyer and network. Re-read no key while
a handle exists; bind any wallet RPC to its captured ready chain, otherwise mark
it unavailable. Gateway unavailable is not zero or wallet USDC. Preserve fixed
new/session diagnostics instead of routing raw values through legacy TreeFormatter
or error.message. Existing ordinary/ENS behavior and fenced result separation stay
in scope only as regressions, not an unrelated rewrite.

The cumulative conservation rule is unchanged: settled plus conservative issued
exposure remains after close/reopen. Reservation narrowing needs local provenance,
never a remote receipt or status total; no close/status double debit or refund.
The independent review's queued-input, generation and falsy-ID observations are
source-composition findings, not runtime Reds. Record genuine failures only after
executing tests against the unchanged boundary. No operational key, spending,
funding, approval replay, mainnet call, production mutation or push is authorized.

## Author context accepted

Parent fully read the105-line task10-author-context.md
`dcf2a49a0551694b383fae2dbf29b90f942008174647cef66c663f7792abe162`.
Approve the stated three-path implementation/test boundary after the F9 commit.
The existing ordinary MCP default http://localhost:8787 does not satisfy F9's
literal-loopback-only HTTP origin policy. Keep that boundary: fixed session-open
refusal with a safe configuration hint, no silent remap, DNS assumption or ordinary
default rewrite. Session docs should explicitly use a literal loopback origin
or HTTPS. This is a known configuration prerequisite, not an owner-only blocker.

## Released source and reproduced queue correction

F9 committed6d3222b on September6 at03:30:22IST; parent then released the exact
three MCP paths. Earlier held-source wording is the historical readiness state.
The initial author checkpoint had100focused Vitest Green. Parent source inspection
then identified possible queued-lane retargeting; independent review reproduced
two actual failures before correction on mcp.ts
7d87459dd2fb3e11c720b77002d8b7d6c80bc359446fba844a1da15ec4c83826.
Parent fully read the initial independent report
b710a75cd8ca59d7f206b244f11e846ffb872828ef196fd5aa839f51381a335a
and the complete retained private two-case native fixture. These are wrong SDK
entry-lane observations, not live signatures or spending. Preserve the original
report and fixture; append final correction results rather than rewrite them.

Require purchase lane, phase, exact handle and generation to be captured before
enqueue. A close/reopen or opening/uncertain transition cannot silently reinterpret
that purchase as ordinary or attach it to a replacement handle. Stale intent must
refuse before discovery, key acquisition or SDK entry. Apply the corresponding
identity guard to queued close so it cannot close a replacement session. A later
intentional caller can submit a new request after observing the unsigned refusal.

Keep wallet inspection within this source scope using a bounded captured RPC
JSON batch: eth_chainId and the pinned-token balanceOf for the captured public
buyer. Require exact cardinality/unique fixed IDs and matching chain/result bytes;
unsupported/malformed data is unavailable, not zero or fallback. No fresh key,
ambient-network switch, Gateway alias, funding dependency or operational call is
introduced by these injected tests. The installed viem header timeout alone did
not establish a full-body deadline, so the new session read uses the bounded
whole-body helper. Add current abort/monotonic checks and finite empty-chunk work
bounds to that helper; preserve private diagnostics and no retry. Actual finished
body/cancellation/empty-progress tests precede a final source freeze.
