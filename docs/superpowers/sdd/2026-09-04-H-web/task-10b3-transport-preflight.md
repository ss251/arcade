> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b3 direct ordinary transport readiness

September 6, 2026, root-only preparation during the frozen H10b2 gate. No source
release or fresh network/payment authority. H10b2 must commit before this work.

Read actual server.ts queued202 and result200/202 producers, existing api.quote,
api.settle and browser jsonFetch, H10a ordinary read transport, receipt/job schemas,
actual arcade_call_skill output, Chat/Thread/Settlement and installed SDK's
updateToolPart. SDK mutates state/input/output on the existing tool part and
retains its approval object, so later UI can bind the approval ID and toolCallId
without inventing new output authority. Historical transcripts remain untrusted.

The real POST returns job_id/status queued/poll_url/job_token/price. Only its
job_id and job_token are recovery coordinates. Never follow, persist or relay
poll_url; the returned URL currently contains a query token. Check price against
the captured original context, create the H9 row timestamp once after acceptance,
and use only its captured origin/fixed path/header token for later reads.

The real terminal result includes receipt jobId/skillId/buyer/seller/network/rail/
priceAtomic/settled/settleRefKind and rail-specific settleTx. The existing server
relay only accepts on-chain hashes, so it is not a Gateway-compatible decoder.
HTTP200/receipt existence is not settlement proof. Validate correlated fields and
project explicit hub-reported outcome, never claim independently verified chain
evidence. Gateway UUID means accepted transfer, not a mined batch. Nonsettlement
or transport failure must not repeat the producer's unsafe no-charge sentence.
Never expose raw detail/provider bytes or any recovery capability to the model.

Use one browser POST with the original approved input text and captured original
requirements in the x402 envelope. One payment-signature header is supported by
actual H10a CORS; duplicate legacy headers are unnecessary. UTF8-aware base64 is
required because original descriptions may contain Unicode (plain btoa(JSON)
is not correct). No SSR courier, ambient credentials, redirects, custom origin,
query token, automatic HTTP retry or replacement authorization on failure.

Reuse the verified H10a bounded whole-response mechanics through a narrowly
scoped shared internal transport, not a generic browser-provided arbitrary URL.
Existing ordinary read semantics/tests must remain intact. A controller retains
one overall monotonic lifetime over quote, sign, fresh quote, one POST and polling;
each individual request remains bounded and abort-aware. Delayed cleanup cannot
revive a paid submission. Lost202 means unrecoverable locally, not retry authority.

H9 storage happens before polling. Surface unavailable/capacity/conflict/recovered
invalid-storage outcomes. The just-accepted capability can remain private in RAM
for this run if persistence fails, but cannot be reconstructed on refresh.
Do not put signed data or tokens in React model/transcript state, hydration, server
functions, DOM attributes, URLs or logs. Buyer UI later reads only browser storage.

Native real two-origin browser integration, wallet-effect re-entry and session
completeness remain required later; unit mocks and inert signer imports do not
prove them. No F session export/read-only capability is invented by this step.

## Later producer refinement for the controller

During the H10b3 gate, read pipeline.ts receipt construction and format.ts completely
at the relevant boundaries: ordinary receipts currently OMIT settleRefKind even
though the schema permits it. Session receipts explicitly carry it. Do not require
an invented mandatory field in the ordinary decoder. For a fresh purchase, retain
exact quote rail/network and signed authorization nonce, validate the actual
receipt's matching fields, and treat true absence separately from malformed/
contradictory presence. Existing txLink already qualifies an absent-kind EIP3009
hash only with explicit settled rail/network. Gateway UUID remains a hub-reported
accepted transfer, not a mined batch. No source change is released by this note.
