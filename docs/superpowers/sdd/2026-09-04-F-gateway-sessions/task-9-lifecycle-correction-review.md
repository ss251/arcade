> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9 lifecycle temporal correction — independent re-review

September 6, 2026, 03:16 IST. **CLEAN for the bounded two-file correction.**
This follows the two genuine temporal consistency findings in the unchanged
initial lifecycle review; it is not a rewrite of their original failing state.
No production/collected test edits, full suite, Git, network, live operation or
operational credential access were performed by this reviewer.

Read the final source projection, reconciliation/readStatus changes, unchanged
close path, and all four added collected cases. The current state is now checked
after I/O inside reconciliation, not captured only before the read. A stale open
response after a valid closed observation fails before accounting updates.

The first validated closed artifact has a bounded explicit fingerprint covering
every scalar, each call's fields and sequence, settlement references, totals and
timestamps. Comparison happens before confirmation/state mutation. Object key
order is irrelevant; persisted array order remains meaningful. Contradictory
evidence does not replace the first proof, which can still be read subsequently.
Both authenticated status and close responses use the same reconciliation guard.
No retry, new signer authority or provider diagnostic was introduced.

The independent private fixture was not changed. Its first two cases previously
failed while proving calls/signatures remained blocked; they now reject stale or
contradictory reporting. Its existing same-artifact/key-order case still passes.
The author added collected regressions for stale open-after-close, changed close
timestamp with recovery of the first proof, changed calls/references/totals, and
equivalent nested key ordering. Original assertions were not weakened. This
corrects lifecycle reporting/artifact consistency, not a demonstrated financial
reopening exploit.

Independent commands on the final frozen bytes:

- `bun --no-env-file test [private lifecycle regression fixture]`:
  **3/3 PASS, 12 assertions**; no source or private fixture changes.
- `bun --no-env-file x --no-install vitest run packages/buyer/test/session.test.ts
  packages/buyer/test/promise-api.test.ts`: **46/46 PASS, 2 files**, at
  03:15:14 IST (39 session +7 Promise).
- Exact TypeScript createProgram over the five reviewed SDK/source/test roots
  plus private fixture, absolute root tsconfig/configFilePath, actual parsed
  options, noEmit:true/incremental:false: **6 roots, 0 diagnostics**.

| Final or preserved artifact | SHA-256 |
| --- | --- |
| packages/buyer/src/session.ts | 1c91030172feb22a57b371977f33d378dfefdb5434f077c5eff83a150892c56d |
| packages/buyer/test/session.test.ts | b5ed74583a02ddc155af162e82886fbd86fc2f56b7c252726db50fefd020fa12 |
| task-9-lifecycle-independent-review.md (unchanged) | 9d30abc4de3f96b4d41cbbc6b52855c2facf0736008c289b3164a30acf9eafa9 |
| [private lifecycle regression fixture] (unchanged) | a9ba25e3412dd40470b1d1906917e3778366b1788a53bd4f50b2248b879f90de |

All six other F9 source/test hashes matched their preceding freeze: HTTP
fbb95a38…27fb9, wire ea2b7e79…0bef, index 25bb0e50…e1ca, native Bun
848b0c81…e635, native fixture 3e92a4a4…95c2, Promise test13d96edb…ed0.
Full hashes are retained in the unchanged author and initial review inventories.
No test process, listener or child was left running by this read-only recheck.

The author's appended correction report was also read: task9-report.md final
SHA-256 70bde2f74b9917337d7cc5c6833139761dc9b6e57dbee78d3b903431fee04fda.
Its first 188 lines independently reconstruct the original report hash
8bb0005689186dbf02caf1ed51f0ca8ba31997761c30d965b19829acea464e16.
Its chronology distinguishes the three reached collected Reds from subsequent
matrix coverage and makes no signing-reopen or live-payment claim.

The separate HTTP/native author evidence is not recounted as independent review
of this reviewer's own code. Full repository gates, publication and commit remain
parent-owned. No wallet-wide persistent ceiling, independent mined proof, actual
MCP cancellation, live Gateway transfer or F11 funding acceptance follows.
