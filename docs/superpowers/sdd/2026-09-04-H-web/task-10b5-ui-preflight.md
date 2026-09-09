> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b5 UI follow-through preparation

September6,2026, while the H10b4 source is frozen. Root-only read-only preparation;
no UI source release, extra test gate or independent review. The first H10b4 full
Vitest attempt encountered sandbox-denied local HTTP/Unix listeners; preserve it
and repair only the affected verification environment, not production source.

Current Confirm uses an interval capturing old onApprove/terms, cancels on pointer
release/leave/cancel and unmount only, and has no keyboard hold. Deny directly
calls onDeny without canceling the hold. Guard the action against changed full
decision identity/terms/input/block state, denial, blur/visibility and unmount.
Use monotonic elapsed time and one-use completion for a displayed decision. The
owning component supplies an explicit opaque decision identity; it must cover
approval/tool IDs, canonical input, ceiling and complete quote rather than only
the currently visible price. Any prior consumed token stays consumed. Keep full
address, ENS provenance, existing styling and safe wallet wording.

Chat's existing PendingPurchase only retains a partial price/payTo/network/ENS
quote. It reads chain on mount but not an actual account; connect returns address
but discards it, catches raw wallet errors, and does not bound stale completion.
New pending UI must retain full captured context and a selected provider/buyer,
show the exact quote versus ceiling, and mint a private scope token only from
the actual hold completion. Unknown account/chain is blocked, not optimistic.
Read-only account checks need no new wallet permission; connect/switch remains
an explicit user action and must not auto-run from restored output.

Thread currently supplies only approval.id to Chat's SDK decision callback; add
the original toolCallId/name/input binding. The installed SDK keeps approval on
output-available. Preserve SDK parts verbatim in transcript/model flow without
adding our token, authorization, accepted row or private result. Actual browser
purchase views live in separate local state and render through a closed view.
Do not treat raw output payee/amount/resource, a historical approved flag, or a
reconstructed token as authority. Actual expected SDK output may trigger only a
matching locally minted token, which the runner consumes synchronously.

StrictMode setup/cleanup must not permanently close the only scope before a user
can act, nor recreate/re-mint a consumed approval. Create the conversation owner
in effect setup, close/drop unused permits and abort active operations in cleanup,
and disable gesture until the active owner is ready. Remount/restored history has
no permits and signs nothing. Duplicated effects must not repeat signing or POST.
Native anchor navigation can interrupt an operation; H9 persistence only begins
after observed admission, and lost202 is not retry authority.

Retire ToolOutput's auto-mounted Settlement (old signPayment + /api/settle).
Raw historical call_skill outputs are unverified transcript claims, not receipt
authority, and must not receive a settled/Arcscan success presentation. Replace
the current hardcoded Arcscan link with the runner's rail-qualified projection;
Gateway UUIDs are not mined batches. Keep paid output complete/selectable/escaped,
never markdown-injected or fed to the model. Storage outcomes are visible and
record acceptance rather than proven spend. Nonsettlement is hub-reported and
cannot independently prove no charge.

After the direct path is wired, retire /api/settle with a fixed non-forwarding
response. Preserve the old E13 regression intent by moving actual-input/ENS,
no-redirect, no-paid-retry, bounded reads, nonce correlation and private-error
assertions to the direct browser composition tests; do not erase inconvenient
history or pretend its former token-in-URL courier is still the design. A route
retirement regression must show zero quote/signature forwarding or result IO.

Native two-origin CORS + DOM/StrictMode + wallet-effect/re-entry/restore checks
remain required, with synthetic fixture keys only and all owned services reaped.
No additional spend or production URL change is authorized by these local tests.
