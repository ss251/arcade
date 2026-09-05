# F11 parent source review and complete gate

September 6, 2026. The offline implementation checkpoint passes its source and
repository gates. This is not live funding acceptance: current Minter identity
and exact completed-deposit-credit attribution remain technically unavailable.
F12's separate actual-runner offline evidence follows; live execution stays NOT RUN.

The parent read all fourteen final source/test/documentation paths, including
the complete journal/runtime and their 42 collected tests, six CLI paths and
26 tests, both pure modules/tests and the deployment fixture wrapper. The two
large runtime literals were independently byte-compared with retained upstream
artifacts instead of being treated as prose. All three runtimes and five notice
checks match. Parent also read every execution report and correction appendix.

## Scoped independent evidence

- Pure: author and parent each40 Vitest/2 files; parent separate private5 Bun/25
  assertions and exact6-root strict0. Independent literal Solidity assembly
  matches the unsigned EIP-712 vector, which the collected test pins exactly.
- Journal: original private6 cases reproduced3 failures and3 passes/21 assertions.
  Corrected unchanged6/21 plus selected collected22/77 pass; exact2-root strict0.
  Parent separately repeated private6/21. Prepared transcript requirements do
  not require a submitted ACK that could have been lost.
- CLI/session: author and parent each26 Bun/122 assertions on identical six-path
  hashes. Parent findings and actual child tests cover pre-key network refusal,
  exact call price/order binding, canonical journal paths, accessor-free argv,
  once-only cleanup and output under the owning hard process fuse.
- Runtime: author42 collected Bun/165 assertions, separately private journal6/21,
  exact3-root strict0. Parent repeated all42/165 and read the final retained-UUID
  GET path: original intent/fees/exact payload/signature/current attester are
  validated, only public observations returned, and no mutation latch, capability,
  state or journal is reset or advanced.
- Cancellation/resource reviewer independently reproduced a real late journal
  handle leak, then repeated the same pause/abort/release sequence after repair.
  Close now reports fixed uncertainty while acquisition is unresolved; late main
  close occurs exactly once before the causal witness, claim retained, no signer,
  RPC/Gateway or send calls. Selected collected1/5 and exact3-root strict0 pass.
  That review is deliberately narrow, not attributed as whole-runtime approval.

Genuine signature, attester revocation, HTTP framing/late-body, aggregate gas,
credit-attribution and historical deployment defects are preserved in the author
chronology. Missing modules, vector transcription, harness syntax and the parent's
disproved newline-regex hypothesis are not represented as money-safety Reds.

## Frozen complete repository gate

The sole full test/type run was requested05:07:10IST; Vitest began05:07:15IST.
It passed, exit0:

- 2,648 Vitest tests /123 files (43.45 seconds).
- 501 Bun tests /39 files,4,541 assertions (99.01 seconds).
- Root forced TypeScript build and web strict TypeScript check.

The command used a clean environment with only PATH/HOME/USER/TMPDIR and bounded
test-worker controls, Bun automatic dotenv disabled at entry. Only owned local
fixtures needed expanded loopback/filesystem access; no operational credentials
or spending were supplied. No other repository suite ran concurrently.
All fourteen source hashes matched the frozen inventory after the gate.
Private standalone fixtures are separate runs, not additions to these totals.
Whitespace/diff check is clean. No web source changed in F11; the full-F merge
still requires its separate web build and Forge gates.

## Acceptance boundary and publication

The runtime uses actual strict parsers, signature recovery, pinned code checks
and receipt/effect validators over injected finite unknown RPC/API replies.
Those replies are synthetic, not a real chain or funded proof; gas21000 in
embedded vectors is a parsing fixture, not a real execution estimate. Tests use
actual temporary filesystem and owned CLI processes, not power-loss guarantees.

A proved deposit remains credit_pending with separate observed available funds;
the pending-only API cannot correlate completed credit and cannot retire that
claim as credited. Withdrawal refuses the observed Minter mismatch before key/
signer/POST entry. These technical limits must not be bypassed by approval replay,
new spend, retry, redeposit or claim deletion. They do not imply available funds
are unusable or require a new owner approval. F11 live acceptance remains partial.

Fourteen bannered historical execution copies preserve superseded checkpoints
and exact corrections with explicit locator substitutions. The brief and indexes
identify current status. Final independent publication audit and the atomic
commit follow; no commit or push is claimed by this precommit record.

## Frozen source inventory

```text
429cf0008abc33e39e5d842a6b03401d4a39b503f369186c497f5b22e7cf8c29  packages/buyer/src/gateway-funding.ts
f43c4f3a6068fa2ca985a0ead85cf9346b1765d4faf1d4e7b4ea6debcb65c223  packages/buyer/src/gateway-withdrawal.ts
94109db06e098937c1f96953d2017ced63b6395b0fe1f124dbe1f210b13d7506  packages/buyer/test/gateway-funding.test.ts
38f77415dd3b293de1c979169c94cf89b8f7e8ab905b4afa5089f7004a2cebd3  packages/buyer/test/gateway-withdrawal.test.ts
ef87870a53e28f6248fa4949f523153e144f29d23eada4011ff787b79b925211  packages/buyer/test/fixtures/gateway-deployment.ts
a39d8681027a62e81ae49b719603b88745c8a9df9b5d1a3d5985cbe24b7924f1  packages/buyer/src/gateway-funding-journal.ts
2b6248aed6beb2541a634cbbb77b757b69dad51d4d048ebe7510834646e6639d  packages/buyer/src/gateway-funding-runtime.ts
3525b1095c5ec8f90a23d44c1be8828957be682d024a0ae27e8d3a1ae58c3a52  packages/buyer/test/gateway-funding-runtime.bun.test.ts
08674cc7e82c5c20b6c97f1c35182c9250bf4cfcd4067c84d927cf792cb4cb73  packages/buyer/src/gateway-funding-cli.ts
368027a24eb2620ec242468cb600dcc9e26979d95f4088d21b2308c881f74ded  packages/buyer/src/session-cli.ts
2e81599b91e5c265e0a817ec003cf8c45f48a89f2a2ac42e748d52ef3cc83a90  packages/buyer/src/cli.ts
be7ad3362c29dd79a78f0f3539dc0d855320d285421db83d55ff8594784551e0  scripts/gateway-withdraw.ts
2edc65612c224258b7df982bab801db61d057d96120fd24e2932b7eb2cfffece  docs/sessions.md
49647dbeef96ce66b8f0699450a105bca9984d24d9c526188f103809868b4a5c  packages/buyer/test/gateway-funding-cli.bun.test.ts
```
