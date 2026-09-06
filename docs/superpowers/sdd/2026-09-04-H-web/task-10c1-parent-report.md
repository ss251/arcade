# H10c1 recovery foundation — parent report

2026-09-06, after H10b6 `6937ce9`. Single-threaded implementation and self-review;
no delegated review, owner key, network spend, production action or push.

## Implemented boundary

`buyer-recovery.ts` captures one private ordinary saved row and emits a token-free
summary. Construction and selection do no IO. Each explicit read is one direct
bounded H10b3 result or tree request, never a web-server relay, payment or polling
loop. A busy owner refuses another read. Selection replacement aborts transport,
immediately clears old evidence and invalidates late continuations; close cannot
be reopened. Reentrant selection during a notification cannot dispatch old work.

Historical result checks bind job/skill/accepted price, terminal status, fee
arithmetic, operational rail and reference kind. They intentionally do not claim
the original buyer/nonce/quote provenance absent from H9 storage. The issuing hub
reports settlement; this is not independently verified spending, finality or a
wallet balance. Output is bounded own JSON, never diagnostic text or unpaid work.
Known capability echoes are withheld. Supplied explorer URLs are ignored; links
are derived only from qualified configured EIP-3009 context. Gateway UUIDs do not
become mined transaction links. The retained H4 tree decoder is additionally
checked against the selected root skill and amount, preserving incomplete flags.

No store, shared signer, live purchase decoder, HTTP transport, tree decoder,
existing component or route was changed. There is no buyer page or native browser
proof yet. Session recovery remains a separate explicit capability/producer task,
not a fabricated grouping or accepted-price sum.

## Verification chronology

- At 16:39:31 IST, the prewritten focused suite failed collection because the new
  module did not exist. No behavioral Red is claimed for that missing-module run.
- First implementation: 22 tests passed at 16:41:01 in 1.20 seconds. Supplemental
  self-review coverage passed on its first run: 39 tests at 16:42:14 in 807 ms.
- Exact nested-web TypeScript program covering both new files: zero diagnostics.
- Tests exercise the actual default bounded fetch readers with synthetic offline
  JSON responses, header-only custody, no automatic IO, replacement/close/reentry,
  single active read, pending refresh, malformed/contradictory records, accounting,
  token echoes, qualified Gateway references and actual tree decoding. They are
  not a native CORS, real hub payment, wallet or chain experiment.
- The sole sequential full gate (session41534) exited0 at 16:47 IST:
  3,957 Vitest/165 files in51.80s;834 Bun/54 files,6,093 assertions in168.71s;
  root/web strict0; actual client build387ms and SSR150ms. Process inventory was
  empty before launch; limits were four Vitest workers/concurrency and Bun
  concurrency four. No concurrent/repeated gate or source change during the gate.
- All20 audited source hashes matched: the two new files below plus all18
  retained H10b6 source/test/fixture pins. Historical reports remain unchanged.

## Source fingerprints

```text
adc3b70f214be50210c201aab4e315557c2d5a4ff89c5b3ad351c1474875a449  apps/web/src/lib/buyer-recovery.ts
474bd317654c37fa49006210fcf671c44ff56cfe509458ec819fd2a8178ed68d  apps/web/test/buyer-recovery.test.ts
```

Next: H10c2 ordinary buyer route, explicit storage/read/forget states, honest
recovery labels, complete escaped result and TreeGraph, with native acceptance.
