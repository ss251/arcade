> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F10 independent MCP review — September 6, 2026

## Initial provisional checkpoint

Independent bounded review of queue/lifecycle/cumulative accounting, not final
source acceptance. The author was still expanding actual MCP and adversarial
tests. Read the complete task10-parent-decisions.md and task10-source-handoff.md,
the MCP lifecycle/queue/paid dispatch and existing regression tests. Used the
TypeScript-testing skill for the concrete behavioral reproduction. No production
file, author test, dependency, Git state, key store or live service was changed.

The source used for the two behavioral failures was
`packages/buyer/src/mcp.ts`, SHA256
`7d87459dd2fb3e11c720b77002d8b7d6c80bc359446fba844a1da15ec4c83826`.
The existing MCP test file was
`1c072b92ed9b8d701bb023528274e01bb523109b26d8e629c5c83e5f61f0eec7`.
The first 128-line session-test checkpoint was
`615e83646936534cea58b46279e780dbc238dc6f70642ce6fe25b018883616ee`;
the author subsequently expanded it, so this hash does not describe the later
19-case matrix or its results.

### Actionable finding: queued purchase can change authority

`handleTool` captured private-lane diagnostics and an own-data argument snapshot,
but its queued closure called `dispatch` without capturing the intended lane,
session handle or generation. `dispatch` selected the then-current global
session phase when the queue lease was acquired. Consequently, a request made
while an old session's close was in progress could execute as an ordinary buy,
or against a subsequently opened session. The queue still serialized operations;
the defect was retargeting a queued intent, not concurrent execution.

An independent private fixture reproduced both behaviors against that unchanged
source at approximately 2026-09-05 22:14 UTC / September 6 03:44 IST:

```sh
bun --no-env-file test [private standalone MCP queue regression fixture]
```

Result: exit 1, **0 passed / 2 failed / 8 assertions**.

- Held close, then queued original-session call: close succeeded, ordinary SDK
  execution counter became 1, both session-call counters stayed 0, and the call
  returned success. Two injected public discovery/probe requests occurred.
- Held close, queued reopen, then queued original-session call: both opens
  completed and the replacement session's call counter became 1. The call
  returned an error only because that fake session deliberately refused unsigned
  after execution began. There was no old-session or ordinary SDK invocation;
  one injected public listing request occurred.

This proves entry into the wrong SDK execution lane/handle, **not actual signing,
authorization or spending**. Each scenario runs in an owned finite Bun child
with a public synthetic unfunded key and an injected fetch that rejects external
IO. No socket or chain/provider API is used. Output is bounded, streams are
drained, and each exact child is awaited with bounded TERM/KILL escalation before
the test returns. The first private-fixture main-guard mistake yielded zero
collected tests; it was corrected before these runs and is not counted as a Red.

Private fixture, now retained unchanged for correction verification:
`[private standalone MCP queue regression fixture]`, SHA256
`3f41e9f4b59c56a2a0aea37290a23876e76df2ff232165d426445ce41d54e3d5`.

Recommended narrow correction: capture purchase lane/phase, exact handle and
generation at tool invocation, before enqueue; refuse stale or uncertain intent
before listing/SDK IO. Never reinterpret it as ordinary or as a replacement
session. Keep the existing predecessor-preserving queue cancellation and argument
snapshot. Root and author received the two actual failures before correction.

### Other bounded review observations

- The predecessor-linked queue retains a cancelled middle node until its prior
  lease completes; a cancelled waiter is checked again before executing work.
  Active SDK Effects receive the caller signal, and their finalizers remain part
  of the serialized operation. Actual protocol cancellation/disconnect coverage
  is author evidence until independently rerun at a final frozen checkpoint.
- Session open latches before asynchronous work; uncertain open/close does not
  deliberately clear authority or reset process totals. Explicit lost-close
  recovery uses the retained handle's read-only status, not another close POST.
- Session calls reserve a finite effective cap. Only local typed unsigned/issued
  provenance narrows it; malformed results and unknown interruption retain the
  conservative reservation. A valid settled result moves reserved amount into
  spent without increasing remaining capacity. Signed nonsettlement is not a
  refund, and close does not re-add closed-receipt totals.
- Returned jobs are correlated once per context; receipt identity/amount/rail
  and terminal reference semantics are checked before seller output is exposed.
  This is local process accounting, not a wallet-wide persistent guarantee or
  new remote settlement proof.
- Read-only session operations capture a context and avoid lifecycle writes;
  old budget observations are labelled historical. Captured wallet-balance
  inspection was still under separate parent review, so no final acceptance of
  its evolving transport is implied here.

No additional concrete blocking accounting or predecessor-cancellation defect
was reproduced at this checkpoint. This is not a full source/full-suite verdict.
No independent focused collected-suite or TypeScript result is claimed in this
initial section. Source, author tests and report remain subject to final freeze.

### Author correction notification (not independent verification)

After the Red notification, the author reported the unchanged private fixture
passing 2/2 with 8 assertions at 03:46:11 IST and two collected counterpart Reds
before the lane correction. It also reported a captured-chain wallet-read
addition and further evolving tests. These are author results, not substituted
for this reviewer's final rerun. The next read observed source
`81988d6949244f6ad6de8dd5a0dc7c349bda6544a00e8a3ff919c7351f2ced25`
and session-test
`a8a9b1e9f72001d36d4ddb0f77533a073e5cc635b1840b27e5afd86d37910ea7`;
these intermediate bytes are not declared frozen or accepted.

## Final frozen-source correction review — September 6, 03:53 IST

**CLEAN within this independent F10 review scope.** The initial findings above
remain historical and unmodified; the two genuine queue failures are corrected.
Read the final three-file checkpoint, including the expanded 36-case session
matrix, then independently reran the unchanged private fixture, both collected
MCP suites and an explicit four-root strict TypeScript program.

Final SHA256 inventory, checked before and after those commands:

| File | SHA256 |
| --- | --- |
| packages/buyer/src/mcp.ts | b730d50eccd11742355a6efeddf1d4a359252a97c1cc0ab50dbd1981100060ac |
| packages/buyer/test/mcp.test.ts | 1c072b92ed9b8d701bb023528274e01bb523109b26d8e629c5c83e5f61f0eec7 |
| packages/buyer/test/mcp-session.test.ts | 608b8d39a207e2188e4fefd96d2e72e3da2a9ca8ed2f8f5f0c8074e22f992b4c |
| [private standalone MCP queue regression fixture] | 3f41e9f4b59c56a2a0aea37290a23876e76df2ff232165d426445ce41d54e3d5 |

### Independent command results

All commands ran from the F worktree with no dotenv loading. No full-suite or
remote request was run by this reviewer.

```sh
bun --no-env-file test [private standalone MCP queue regression fixture]
bun --no-env-file x vitest run packages/buyer/test/mcp.test.ts packages/buyer/test/mcp-session.test.ts
```

- Unchanged private fixture: exit 0, **2 passed / 0 failed / 8 assertions**.
  Both call paths now refuse with zero ordinary, old-handle and new-handle SDK
  executions. Owned children were reaped by the same retained fixture lifecycle.
- Collected focused suites at 03:53:21 IST: exit 0, **62 passed in 2 files**,
  comprising existing MCP 26 and new session 36. This is this reviewer's count;
  it is distinct from the author's broader 175-test adjacent run.
- Exact TypeScript: exit 0, **0 diagnostics**. The compiler read the absolute
  root tsconfig with its configFileName set, preserved all parsed compiler
  options, and set only noEmit:true/incremental:false. Explicit roots were all
  four files in the table, so nested tests and the private fixture were included
  despite root collection exclusions. Actual dependencies were resolved normally;
  no temporary declarations or suppression were used.

### Final source assessment

- Invocation now captures session phase, context identity and generation before
  enqueue. Purchases made during a closing/uncertain phase refuse immediately;
  call/close operations reject a changed captured intent again upon lease
  acquisition. No ordinary or replacement-session fallback remains in the two
  reproduced paths. Same-generation call queuing still works, and the input
  mutation assertion is preserved behind an active call rather than relying on
  a call made during uncertain opening.
- Own-data snapshots still reject getters, cycles, symbols, oversized data and
  special serialization/prototype keys. Harmless literal constructor/prototype
  fields are now copied into null-prototype data objects, preserving ordinary
  JSON compatibility without interpreting them. This is not a general Proxy
  sandbox or protection from arbitrary trusted in-process code.
- The captured wallet inspection makes one unsigned batch to the captured ready
  chain's selected RPC: eth_chainId plus balanceOf on its pinned USDC contract
  for the retained buyer. It checks response IDs, exact identity and uint256
  result representation. Missing, contradictory or malformed evidence stays
  null/unavailable, never zero or Gateway funds. Credentials/session capability
  headers are absent, redirects are refused and there is no fallback or retry.
- The reused public JSON read now checks a monotonic deadline and abort state
  before and after each body read, caps decoded bytes and consecutive empty
  chunks, uses fatal UTF-8, and requests cancellation on timeout/late response.
  Wallet headers plus body share a five-second budget. The collected fake-clock
  stall/cancel and finite chunk-storm regressions passed independently. This is
  bounded public-read evidence, not a claim of strict payment-response framing,
  native RPC availability or guaranteed termination of hostile injected cancel
  implementations.
- Actual installed MCP protocol source confirms falsy request IDs bypass its
  cancellation handler; the app's fixed pre-dispatch refusal covers 0 and empty
  string. Transport close aborts active handler controllers. The rerun exercises
  actual Client/InMemoryTransport cancellation, disconnect and middle-waiter
  ordering, plus joined SDK Effect finalizers and conservative issued exposure.
- Two collected tests use actual F9 SDK signing with synthetic unfunded fixture
  accounts and injected HTTP responses. They preserve captured identity after an
  environment change, actual-input advisory quoting, fresh call probing, private
  session headers, signed release exposure and fenced seller output. They do not
  prove a live settlement, mining, hosted Gateway behavior or wallet-wide durable
  accounting. The pre-existing ordinary/ENS lane remains separately regressed;
  this review does not expand acceptance to all legacy discovery transport.

No actionable remaining blocker was found in the reviewed queue, lifecycle,
local cumulative accounting or final narrow wallet-read changes. Full repository
gates, public publication and commit remain the parent's responsibility. The
initial report prefix before this appendix had SHA256
`b710a75cd8ca59d7f206b244f11e846ffb872828ef196fd5aa839f51381a335a`.
