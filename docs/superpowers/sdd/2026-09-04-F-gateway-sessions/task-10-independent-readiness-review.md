> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F10 independent readiness review — September 6, 2026

Verdict: **handoff is buildable within its proposed scope, with one concrete
installed-SDK qualification and the implementation checkpoints below**. F10
remains held until the reviewed F9 commit. This is source/readiness inspection,
not implementation acceptance or an executed behavioral Red.

Read the complete122-line task10-source-handoff, complete current204-line
task9-parent-decisions, and complete820-line current mcp.ts. Inspected existing
MCP tool/schema and in-memory ENS transport test patterns; installed SDK1.29.0
request-ID schema, request-handler signal/cancellation/close implementation and
complete InMemoryTransport. No source/test edits, test execution, operational
environment/credential access, network/research, Git, dependency or live action.
This ignored note is the only write.

## Concrete SDK cancellation qualification

Installed `shared/protocol.js:169–175` returns early in `_oncancel` when
`!notification.params.requestId`. Thus numeric0 and empty-string request IDs do
not abort the request controller through a cancellation notification.
`types.js:110` explicitly permits both (string or integer, without nonempty/
nonzero refinement). Normal SDK-generated tool calls after initialization use
later nonzero IDs, so a happy-path generated-client cancellation test can miss it.
Transport close still aborts all active controllers (`protocol.js:249–269`).
This qualifies the handoff's general cancellation statement; it is not a claimed
runtime reproduction. Root was notified before this note. Smallest app-scoped
choice: reject those two IDs in createServer's tool handler before dispatch/key/
IO with a fixed refusal, and cover that refusal through actual transport. If full
ID compatibility is required, explicitly design/test an app-owned cancellation
bridge instead. Do not silently patch/upgrade the SDK or claim notifications
abort every schema-valid ID. F10 source need not expand outside mcp.ts/tests.

## Implementation checkpoints grounded in current source

1. **One captured queue operation, not a raced unlock.** Current serializePurchase
   awaits a predecessor then releases its own successor promise in finally.
   Preserve this dependency when B cancels between active A and queued C: B may
   return a fixed canceled result promptly, but B's queue node must wait for A
   and then release C without running B. A Promise.race followed by an immediate
   finally-release breaks ordering. Normalize/copy relevant own-data arguments
   and claim lifecycle intent before awaiting the lease; a queued mutable object
   is not authority to change input, caps or routing later. Check signal before
   enqueue, after lease, after async discovery and before account/SDK entry.

2. **Conservation is across all handles.** Keep process remaining as ceiling minus
   settled spend minus conservative unresolved reservations. For cap C, replace
   its reservation with locally validated issued A only when 0≤A≤C and the F9
   phase/provenance supports that classification; never trust a receipt's lower
   amount or remote unsigned assertion. A settled correlated A moves exposure
   to spent without changing total authority. Signed release retains A; unknown
   interruption/defect retains C; closed receipts/status totals are not additional
   debits or revocation. Test10→reserved6→close/reopen→remaining4, including a
   lost signed response and later intentional ordinary calls. Poisoned open with
   no handle must still block mutations: `handle === undefined` alone cannot mean
   the ordinary purchase lane is allowed.

3. **Old read completions cannot replace current lifecycle state.** The handoff
   queues open/close/call, but quote/budget/status may remain useful concurrent
   reads. Capture handle plus generation; an old response must not clear a newer
   handle, reset counters, repeat reconciliation or turn an uncertain state into
   ordinary fallback. Either guard such effects by identity/generation or place
   the state-changing reconciliation in the same lease. Close-unknown recovery
   invokes F9 status only; session_closed409 alone is not recovery and no second
   close POST follows. Unknown status preserves both handle and process totals.

4. **Private routes need private validation/diagnostics.** Current quoteAtomic
   probes `{}` on a wallet-shaped URL and falls back to catalog price; current
   findListing reads the whole catalog. Neither implements active-session quote.
   Use the bounded direct listing serviceName projection and captured F9 quote
   with actual input, then fresh call probe. Current decodeArgs emits TreeFormatter
   values and handleTool reflects arbitrary error.message: new/session branches
   need fixed own-data refusals before those paths, without an unrelated legacy
   rewrite. Preserve fences; never print raw challenge, note, token or abort reason.

5. **Budget reads retain captured network as well as address.** Current
   balanceAtomic reloads ambient chain config, and arcade_budget re-reads a key.
   With a handle, use captured public buyer/network; any wallet read must be
   explicitly bound to that captured pinned chain (or report unavailable on
   disagreement), not label another selected chain's balance as session funds.
   Gateway available/pending remains unavailable without valid evidence, not
   zero and not a wallet/ERC20 balance alias. No F11 funding dependency is needed.

## Minimal verification/release choice

Accept mcp.ts plus the two named Vitest files as the initial source/test scope.
Existing Client + InMemoryTransport.createLinkedPair already exercises the actual
installed protocol and closes both ends, so native stdio fixtures are conditional,
not a prerequisite for cancellation/disconnect proof. Prove signal propagation
through real handler extra.signal into Effect.runPromise; SDK cancellation hides
the response but does not itself stop application work. Await/join owned handler
work before resetting test counters or claiming no later signing. Include the
falsy-ID refusal qualification above alongside middle-waiter and post-signer
cancellation, close recovery, private quote and process-conservation cases.
No dependency/shared F9 edit or live authority is required by these decisions.

## Read provenance (SHA-256)

- task10-source-handoff.md: `113fd3ebdc0576491d9907ff7bd3a0247729a6a9de4519badceea396624d8208`
- task9-parent-decisions.md: `649ec58efc239dc4ba177da447075d64012186e7c2ec6f9a6163a1811794f7c8`
- packages/buyer/src/mcp.ts: `bacd678dfaf6503f6aabb776314ea3e87fee9930cc2c14bc681dac0f0163ee42`
- Installed SDK1.29.0 esm/shared/protocol.js: `8de524602541771e084f7185e7d0fc418b8142a9cae1bd80a3ee7c70e9a9e132`
- Installed SDK1.29.0 esm/types.js: `962836b0f8dad85bcd398ad3ddb5ba81a7c7530c706955aa846dd8dfc02dd6a9`
- Installed SDK1.29.0 esm/inMemory.js: `8eb57dc4b4c0993869273a5e01a35c71e8d84c3d5050e9871a8cf141360f883d`

All stated risks are source-composition/readiness observations. No runtime count,
Red/Green test result, final F9 API freeze or F10 implementation success is claimed.
