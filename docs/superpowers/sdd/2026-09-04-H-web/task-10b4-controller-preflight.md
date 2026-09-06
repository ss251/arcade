> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b4 controller preparation

September 6, 2026, after H10b3 6101146. Root-only preparation; no source released
by this file, no live payment/key authority. No delegates or parallel reviews.

Compose H10b1 scope/token consumption synchronously before any quote, wallet,
HTTP or storage action. The controller receives a private provider/buyer snapshot
and original SDK binding from the owning conversation; no model/tool output is
itself approval. Duplicate/reconstructed tokens refuse before IO. Keep raw input,
signature and accepted H9 token private to the operation, never in returned UI
view, model/transcript messages, DOM attributes, URLs or server functions.

Use the same captured canonical input for an actual-input/ENS quote before signing
and again before forwarding. Decode the complete H10a context each time and
compare deterministic captured fields exactly, including issuer, rail, original
requirements and ENS presence. Any change, even below the ceiling, needs a fresh
decision. Never use raw tool-output resource/payee/amount as signing authority.
The browser quote adapter will use only the fixed same-origin /api/quote route;
that keyless route already validates actual input and ENS and returns browser
context. It receives no signature or recovery/session token.

A bounded five-minute monotonic operation lifetime covers both quotes, H10b2
signing (at most120s), H10b3 single POST (at most10s), storage and read-only result
polling (each at most90s). Use remaining budget, removable abort waiters and a
finite poll count with delay for immediate pending202 responses. Never repeat
signing or a paid POST on any error. Abort cannot close a wallet prompt, revoke
an authorization, cancel an admitted job or prove no charge. Late quote/sign/read
fulfillment cannot advance the next side-effect boundary.

After queued202, persist the exact H9 row before polling or notifying the UI of
admission. Surface stored/already_stored/recovered-invalid/capacity/conflict/
unavailable outcomes without leaking the token. A failure leaves the capability
private in RAM for the current run only; refresh may lose recovery. Lost202 is
not recoverable from a guessed job ID and never gives retry authority.

The terminal decoder must match accepted job ID, skill, original amount, buyer,
seller, quote network/rail and the retained signed authorization nonce. Check
the actual receipt's monetary strings, finite scalar metadata and valid status.
Return a closed hub-reported projection, not raw provider detail/receipt fields.
Successful output is never released for a reported nonsettlement; a nonsettled
succeeded job is possible when the rail failed, and is not a no-charge proof.
Require valid nonzero transaction-hash shape for EIP3009 and a valid UUID for
Gateway. Ordinary pipeline.ts omits optional settleRefKind; true absence is
allowed with the exact retained rail, but contradictory/malformed presence is
not. Use existing qualified txLink only for EIP3009. Gateway acceptance is not
mined/available credit. None of this independently verifies an on-chain receipt.

Follow with actual UI wiring: conversation-owned controller lifecycle must survive
StrictMode's setup/cleanup cycle without reminting approval or repeating signing.
Installed SDK updateToolPart retains approval on output-available; bind both
approval.id and toolCallId plus original tool input. Mint only in the actual
Confirm callback before addToolApprovalResponse, and continue only on matching
SDK output. Existing generic ToolOutput/Settlement auto-mount must be retired,
not left as a second path. Retire /api/settle with fixed refusal only after the
new path is active, preserving migrated E13 test intent.

Confirm currently keeps a900ms timer closure and cancels only on unmount/pointer
events, not on changed props; pending held terms/input can therefore outlive a
render. Reset/cancel the hold on decision identity, visible terms, blocking,
denial and relevant input changes. Include keyboard operation. Use source and
native DOM tests rather than claiming an exploit was already reproduced.

Native two-origin browser CORS/direct-POST/capability custody, restored/replayed
tool output, remount and wallet-effect re-entry proof remain required after UI
integration. H10c buyer page must not sum accepted row prices as spent; historical
recovery rows lack original buyer/nonce/context and must retain their weaker
hub-reported evidence scope. F session continuity/export is still a separate gap.
