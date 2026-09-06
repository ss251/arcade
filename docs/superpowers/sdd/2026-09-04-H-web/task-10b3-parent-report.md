> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b3 direct ordinary transport checkpoint

September 6, 2026, after H10b2 `ddb7eca`. Parent-only implementation and
self-review under the active machine-load restriction. No independent review,
delegates or overlapping gates.

## Source-grounded implementation

Read the actual hub queued202/result200/202 producers, EIP3009/Gateway contexts,
receipt/job schemas, H10a browser reader and all49 existing tests, H9 storage,
current quote/settlement courier, Chat/Thread/tool-output flow and installed SDK
approval-retaining mutation. The separate transport preflight preserves this
readiness checkpoint. Active UI migration remains separate.

Wrote the brief and52 new focused cases before implementation. Mechanically
extracted H10a complete-response mechanics into a trusted internal prepare/project
transport; result/tree wrappers retain their captured H9 scope, fixed paths,
header-only capability, status/decoder rules and public error types. Only trusted
code supplies internal callbacks: it is not a public arbitrary-URL endpoint.

New POST captures closed context/auth and bounded actual input text synchronously.
It checks operational rail, recipient/amount, finite current validity and signature
wire shape, echoes original requirements without normalization and encodes Unicode
as UTF8 before base64. One exact original-resource POST, one payment-signature
header; no credentials, redirects, referrer, cache, retry or ambient origin.
The wrapper does not recover signatures or create approval authority. H10b1/H10b2
and the later controller provide those separate gates. One dispatch is per
invocation, not a durable or cross-tab replay guard.

Only queued202 with correlated price and valid job_id/job_token produces a frozen
H9 row. poll_url is ignored whether present or absent, never followed or retained.
A fixed error distinguishes no dispatch from possible submission; it never copies
provider prose or says outside funds were not charged. The admission timestamp is
captured once; the later controller stores before polling and surfaces failures.
HTTP200 alone is not promoted to acceptance or a settlement receipt.

## Tests and correction chronology

Initial14:27:01 run passed101/2files (52new+49unchanged),827ms total/50ms tests.
No missing-module run or first-pass Green was called a product Red. Exact five-root
actual nested-web strict returned0. Supplemental self-review added seven cases:
admission-time rollback, three invalid monotonic starts, backward monotonic time,
passive import/accessor options and mid-body cancellation/listener cleanup.

At14:28:38 four real failures remained: backward admission wall time, NaN and
negative monotonic starts, and backward monotonic reads could still accept.
The Infinity case already refused and is not counted as a Red. Fixed the shared
reader's finite/nonnegative/nondecreasing clock checks before dispatch and at
every continuation, including late-response cancellation; admission now rejects
a timestamp before its captured pre-dispatch wall time.

Final14:29:29 run passed217/5files (59new POST,49unchanged reads,62signer,
44approval,3passive import),1.44s total. Exact five-root strict again returned0.
Original ordinary read tests remain unchanged; shared caps/cleanup still pass.
Tests use synthetic authorization bytes and mocked fetch, not a live paid request
or native browser. Earlier signer tests separately perform fixture-key recovery.

## Frozen source pins

- `apps/web/src/lib/ordinary-http-transport.ts`: `a0eee972abc27b882d2365cf6a28e954ca3a47e9be8826c89a6baa1c243b93cc`
- `apps/web/src/lib/ordinary-job-http.ts`: `4dc35f569e936ac1265ffa94384521dbf837d9a3012e82e99563137b35f350cb`
- `apps/web/src/lib/ordinary-payment-http.ts`: `9a78ba9932a10a237213aed92bdba9b76496082e6dabbb37189d284a02d3bc53`
- `apps/web/test/ordinary-payment-http.test.ts`: `a6af566234cb120e3342190faeecb51049f392b5f84e3feac88527de578e50bb`

The previous read wrapper was SHA256
`156482395d8942e02bfafc12eb29d8fdac937539230a04e298aa963de58ce957`;
this step intentionally replaces it with the extracted wrapper above. The prior
reader test remains
`08324fbb457ce62d221bd7ce85e294afb78b334e2a6926651cf57bbcf2c9ec69`.
Other H10a/H10b1/H10b2/F/Pages sources remain unchanged.

Sanitized read-only process inventory found no active test-gate/worker candidates.
The sole full gate started14:30IST with explicit Node-hosted Vitest
maxWorkers4/minWorkers1/maxConcurrency4 and sequential Bun max-concurrency4
without parallel, then root/web strict and actual envDir:false client/SSR builds.
This is an in-flight checkpoint, not full-gate success.

No real keys, HTTP payment, approval replay, production configuration/ENS, mainnet
action, deployment or push. Active Chat/Confirm/relay remains unchanged, and H is
unmerged. Native two-origin purchase/re-entry, fresh quote+approval controller,
terminal correlation and buyer/session completeness remain separate next work.

## Completed sole full gate

The same gate started14:30:42IST and closed exit0:3,773 Vitest/155files
(48.42s),834 Bun/54files/6,093 assertions (162.68s), root/web strict and actual
client319ms/SSR150ms builds. No repeated sweep. The full suite includes owned
loopback simulated payment fixtures; no live payment or real key was used.
This is not active UI integration or native browser proof. Source remains frozen
for the nine-path local commit and exact public-copy/retained-source audit.
