> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F2 independent-review corrections — September 5, 2026

Parent released only the buyer paid-catch/Blob replay fix after the two actual
failures in task2-independent-review.md. Original implementation and initial
independent-review reports remain unchanged. This follow-up records code and
offline tests, not a funded payment, public RPC, deployment or full-suite gate.

## Exact source scope

- `packages/buyer/src/fetch-with-payment.ts`: fixed Gateway-only paid-fetch error,
  plus bounded eager Blob snapshot before the initial probe.
- New collected `packages/buyer/test/gateway-replay.bun.test.ts`: ten focused
  regressions/compatibility cases. No original assertions or signer code changed.
- Initial ignored `internal/task2-independent-regressions.bun.test.ts` remains
  byte-identical. No F3 source, package, configuration, Keychain, live state or Git
  mutation occurred. Normal string-based callSkill requests keep the same path.

Gateway paid transport failures now retain method fetch(paid) and return only:
"Gateway authorization issued; payment outcome unknown. Reconcile before retrying."
They never include the transport's message or issued header. An explicit ordinary
USDC regression preserves its prior diagnostic behavior; structured unsigned
policy refusals remain unchanged. No request or signature is retried automatically.

Blob.slice is no longer treated as an immutable snapshot. Native Blob.stream is
consumed before any probe, enforcing both declared size and actual bytes <=1 MiB,
actual length equal to initial size, and at most4096 chunks. Captured Uint8Array
chunks are copied into new buffers and a new in-memory Blob with the original
native media type. A real owned Bun.file mutation in beforeSign now changes neither
request's bytes. Views, URLSearchParams, strings and unsupported FormData/streams
keep the prior approved policy and tests.

The snapshot's five-second asynchronous deadline covers reading and cleanup, not
the whole payment workflow. Caller and Effect interruption signals request abort.
On failure, the reader is canceled, its lock released, listeners removed and timer
cleared. Cancellation waiting races the same remaining deadline/abort, so an
uncooperative underlying cancel promise does not hang the caller. The test proves
our owned lock is released and no request/signature follows; it does not claim an
arbitrary hostile stream's external work has been forcibly terminated. Native
synchronous CPU/I/O cannot be preempted by a JavaScript timer. No general payment
response-body/transport timeout redesign is claimed.

## Failure-first and final focused evidence (UTC)

- The preserved initial private tests genuinely failed before any production fix:
  actual dummy authorization reflected in the paid error, and native file-backed
  body changed between requests. Only injected fetch/dummy account/owned file.
- At13:14:34, the new collected ten-case file gave2 pass/8 fail. Seven failures
  exercised the privacy/file mutation/stream stall/abort/read error/growth/truncation
  protections. The eighth was a new native-stream invocation assertion in the
  already-supported1MiB success case, not a claim of another prior byte-limit bug.
  Ordinary USDC diagnostic and declared oversize checks passed immediately.
- At13:16:36, the first implementation run passed11/12 across collected+private
  files. Its one failure was a fixture assumption: Bun normalizes text/plain to
  text/plain;charset=utf-8 and lazily materializes Request headers. The fixture now
  captures the original native Blob.type and snapshots headers before body read.
  This is fixture correction, not a product Red or changed type-preservation rule.
- At13:17:35, both groups passed12/12,60 assertions. The unchanged private two
  genuine Reds are now Green. Actual stalled snapshot returned in5004.50ms;
  caller abort with a never-resolving underlying cancel returned in7.08ms and
  left the reader unlocked. Fixed read errors, actual-byte growth, truncation,
  declared oversize and exact1MiB chunk replay all passed.
- At13:17:41, the original four-file suite passed128/128 Vitest: Gateway signer55,
  buyer fetch47, ENS22, configured-EIP3009 4. Original ENS authority assertions
  remain unchanged.
- Final collected Bun repeat passed13/13,75 assertions in5.30s: three actual
  owned-loopback cases plus ten replay cases. The real HTTP cases independently
  recover the issued Gateway signature, refuse paid redirect forwarding, and
  prove no paid request after signer refusal. Both owned listeners are awaited
  closed and connection refusal asserted. No external traffic or live payment.
- Exact root tsconfig options compiled all original seven files, new collected
  Bun file and preserved private regression explicitly: zero diagnostics, exit0.
  Scoped diff whitespace check passed. No full-repository suite was run here.

The TypeScript-testing skill influenced the actual file-backed/issued-header
regressions and explicit cancellation/cleanup evidence. No real credential was
used; the collected Red printer did show a test-generated dummy authorization,
which is not copied into these reports. The final test orders boolean privacy
assertions first to avoid printing such fixture headers on a future regression.

## Frozen checksums and handoff

SHA256 values are source checksums, not chain transaction evidence:

```text
e8b0a8e1c3936b7fcbd5afa82069248f05e9996e884d1ee81bcc5356b729ab4c  packages/buyer/src/fetch-with-payment.ts
2ed8d28e8d8ba5b64aabde006f82262e498bd6fb29348e3dca055393427310ee  packages/buyer/test/gateway-replay.bun.test.ts
f029726d0b07769d75b83e013c8baa5f9a012b5edfc4673497185e9784f98aab  internal/task2-report.md
a17cd6fe9f9a225b1cd1fe1c29f880db1add8eddb178b8264985345aa4b56c3d  internal/task2-independent-regressions.bun.test.ts
```

Source/tests FROZEN for parent independent correction review and full gates. The
initial two findings are fixed in the exercised paths; this implementer does not
substitute its own correction review for the required independent approval.
