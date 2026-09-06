> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H13b browser name approval — readiness (not implementation)

Read against f689ba6 plus H13a candidate, 2026-09-06 20:17 IST. Root-only.
H13a's server/tool half does not enable the browser. Existing capturePurchasePart,
private approval scope, PendingPurchase and quotePurchaseContext still accept id
only; the opaque permit must not be replaced with SDK output authorization.

Keep original exactly-one target in PurchaseBinding. Scope stores the original
captured binding separately from its resolved ApprovedPurchase; latter retains
resolved skillId, original name when present, and exact displayed context. Name
approval requires context.ensName === original name; id approval retains skillId
agreement. Consume compares original target plus ids/ceiling/input and burns once.
Conversation retains resolved skillId from the captured context, so later SDK
readiness must match both the original name and that skill, not just any id.
Restored/preliminary/mismatched parts remain inert, duplicates cannot re-arm.

quotePurchaseContext keeps string id compatibility and additionally accepts the
closed name target. Encode target and canonical actual input in the fixed POST;
require returned skillId == browser.skillId and the explicit name == ensName in
both projections. Do not accept arbitrary URLs or output-supplied coordinates.
runPurchase requotes by original name before AND after signing, comparing the
entire context; changed mapping/expired name blocks a signature or forwarding.

ordinaryHttp catches thrown project errors: typed quote refusals must be returned
as a closed project result then unwrapped outside transport, not passed through
raw errors or a weakened generic transport catch. Accept only exact known status/
error code and validated public payees; no detail/cause reflection. Generic
outages remain unavailable, not expiry or proof nobody is serving.
PendingPurchase quotes the original target, verifies complete context, shows
resolved id + verified name only on success, clear fixed expiry/mismatch blockers
otherwise. No wallet selection/signing on a failed quote; stale effects cannot
restore old terms or a previous name.

Tests first: capture/approve/consume name swap versus same resolved id; output
name/id mismatch; restored/duplicate/late paths; client name and actual input;
real route+offline signer refusal around signing and id compatibility. Then
real Chat/Confirm native fixture with SDK frames, isolated loopback hub, public
offline key, no live chain or wallet. Reuse existing native harness patterns with
fresh owned paths/ports/profile, max2 renderers, no overlapping gate/browser.

H14 fully read through EOF. Literal unbounded shell Chrome loop/shared default
output/hardcoded production/seller calls are not safe as-is. Need finite owned
screenshot tool, fresh output, no shared profile, explicit keyless source context,
12 frames light/dark (actual light/dark check), owner ranking/real-wallet capture
remain separate owner gates. Do not conflate fixture captures with live evidence.
