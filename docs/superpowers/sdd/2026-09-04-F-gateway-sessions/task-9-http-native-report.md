> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9 session HTTP and native SDK fixture — frozen author report

Frozen September 6, 2026, 03:01 IST (September 5, 21:31 UTC). This is the
three-path transport/native half of F9, not independent acceptance of the other
five SDK files or a full repository gate. Parent owns review, publication and
commit. No real credential retrieval, external service, live Gateway operation,
funding, deployment, Git mutation or dependency change occurred.

## Scope and API

Only these new collected files were authored in this slice:

- `packages/buyer/src/session-http.ts`
- `packages/buyer/test/session.bun.test.ts`
- `packages/buyer/test/fixtures/session-runtime.ts`

The ts-testing skill informed behavior-first tests, actual package/runtime
coverage, adversarial bounds, and explicit owned-resource cleanup. The separate
SDK author owns lifecycle, wire decoding and Promise facades. Coordination added
quote coverage after the parent approved its read-only public interface.

`sessionRequest(fetch, url, init, {signal, deadlineMs, maxBytes})` returns a
Promise of `{status, body: unknown}`. The deadline is absolute monotonic time;
each request is bounded by the lesser of five seconds and remaining overall
time. Exported `SessionHttpFailure` has fixed local tag/code/message, not provider
prose, input, URL, capability or abort reason. It never retries.

The caller retains captured-origin and exact route authority. The helper rejects
unsafe URLs, credentials/query/hash/encoded or normalized path changes, redirects
and response URL drift. HTTPS and literal loopback HTTP are the only schemes.
Injected Response fixtures may have an empty URL; this does not give the helper
cross-call origin state. Init/header/options are snapshotted from own data, not
accessors/coercions. This is not a hostile-Proxy sandbox.

Only GET/POST and the agreed JSON/private-capability headers are supported.
Request string bytes are capped at 1 MiB; no general Blob/FormData/stream replay
surface was added. Fetch always receives redirect:error, credentials:omit and
identity encoding. Responses require JSON media type, fatal UTF-8, bounded bytes,
identity encoding and exact declared Content-Length when present; bounded chunked
responses are accepted. Every pending read has a removable abort waiter.
Consecutive empty chunks are capped at 1024. Cancellation is linked to the
caller, late fetch bodies can only be canceled, and reader cleanup waits at
most 50 ms. These are local bounds, not remote cancellation or TCP-EOF guarantees.

## Actual Red/Green chronology

1. At 21:08:58 UTC, the initial 18 tests were collected and failed because the
   new HTTP module did not exist. This is the missing-module baseline, not 18
   independently demonstrated behavioral defects. Initial implementation then
   passed 18/18 Bun tests, 68 parent assertions, and exact three-root strict TS.
2. At 21:12:52 UTC, a new consecutive-empty-stream regression genuinely failed
   against that implementation: expected at most 1026 pulls; observed **356080**
   before the 150 ms deadline. The old shared pending Promise.race branch also
   retained per-read reactions. Removable abort waiters and a finite consecutive
   empty-chunk guard corrected this. The three selected cleanup/storm tests
   passed at 21:16:01 UTC. Parent accepted this narrow finite-work policy.
3. At 21:17:10 UTC, the frozen HTTP slice plus inert owned-child import case
   passed 20/20 Bun tests, 74 parent assertions; exact three-root strict TS was
   clean. The additional inert-child case passed on its first run.
4. Actual SDK/hub fixtures first exposed a fixture-only assumption: Bun 1.3.14
   Request.credentials reported include despite explicit omit. A direct local
   construction probe confirmed this; assertions now inspect the actual fetch
   init, which remains omit. Those two failures are not product Reds. Cleanup
   also uses captured native fetch for real post-shutdown refusal, not the
   fixture's ambient external-request trap.
5. At 21:25:44 UTC, actual imports and Test success/release plus cryptographic
   Gateway/SQLite integration passed: 24/24 Bun, 86 parent assertions. A strict
   check found three optional-snapshot fixture diagnostics; an explicit missing
   snapshot guard corrected them without changing product code or assertions.
6. At 21:27:22 UTC, the three real-hub fixtures genuinely failed at quote because
   the newly approved method was not implemented yet. Their assertions require
   exact quote metadata and zero signatures/dispatch/issued amount/receipts,
   followed by a fresh call probe. The SDK author added quote; all three then
   passed, with 11 parent assertions. No HTTP change was needed.

Final post-quote run completed before this freeze: **24/24 Bun tests, 86 parent
assertions, 6.39 s**, with the actual unfinished native body test taking
5004.22 ms. Assertions inside separate native children are additional and are
not included in Bun's parent assertion count. Exact owned-three-root strict
TypeScript finished with **zero diagnostics**.

## What the native evidence establishes

Actual Bun imports use `@arcade/buyer` and `@arcade/buyer/session` in an isolated
script child, with fetch/preconnect traps and an environment proxy checking
credential-name reads. Root/subpath exports agree. A Promise refusal preserves
the typed buyer failure without raw provider or FiberFailure diagnostics.

Three bounded integrations use the real session lifecycle and paid/result route
factories, Broker, session facade, ledger and selected rail. Listing detail is a
small fixture projection from the actual Store; this is not a whole CLI/server
boot claim. Real Test success and failed release produce their genuine persisted
receipts; failed output never escapes. A deterministic unfunded signer, actual
F2 Gateway signature and F3 cryptographic verifier cross an owned facilitator
fixture and SQLite backend. Only verify/settle are called; the database reopens
with one closed session and one Gateway UUID receipt. UUID/test references remain
unlinked, with no mined-transaction or real Circle settlement claim.

Every quote/probe/retry carries both session headers; every result poll also
carries the job token. Exact original input bytes survive all three POSTs: quote,
fresh call probe, single paid retry. Quote leaves signing/dispatch/debit untouched.
The successful path records one signature/dispatch; release retains issued local
exposure rather than declaring authorization revoked. Public facades do not
serialize the private token. External request counters stay zero.

Listeners bind only owned literal loopback and await stop plus actual connection
refusal. Children use --no-env-file and an explicit minimal environment, a seven
second hard fuse, bounded stdout/stderr drains and parent TERM-to-KILL/awaited-exit
cleanup. SQLite files live only in an owned temporary directory and are closed
before its removal. No persistent process was intentionally left running.

## Reproduction and pins

Focused command: `bun --no-env-file test ./packages/buyer/test/session.bun.test.ts`.
Run from the F worktree. The strict check uses TypeScript readConfigFile and
parseJsonConfigFileContent on the absolute root tsconfig (including configFilePath),
then createProgram with the three absolute owned roots, parsed options,
noEmit:true and incremental:false. It includes their actual imported dependencies;
it is not a claim that root tsconfig normally collects all nested tests.

| Frozen path | SHA-256 |
| --- | --- |
| packages/buyer/src/session-http.ts | fbb95a382a0922bf01234d8c006704690a341f63532e151dff1bec74dcc27fb9 |
| packages/buyer/test/session.bun.test.ts | 848b0c81b0802b59da14f851238774f668e635d616517061a1803508ee41d635 |
| packages/buyer/test/fixtures/session-runtime.ts | 3e92a4a49a304006e47c8bd8b8e30c19f2645cd0753ab9b483095c2989ab95c2 |

Final native/strict checks observed the other author's session.ts at
23a32ec8b2eee7a8acd814484916aa863f666bc642dafc754a8bb650bb4f5862
and session-wire.ts at
ea2b7e792482cc94ea71939ab0e99afbd29caa474e40d4e1db968220a15c0bef.
Those are dependency checkpoints, not this author's source ownership or their
final independent acceptance. No full suite, actual MCP cancellation, wallet-wide
exposure persistence, live Gateway support or F11 funding proof is claimed here.
