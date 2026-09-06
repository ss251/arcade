> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 private indexed-query helper — independent offline review

2026-09-06. **CLEAN for the frozen offline helper checkpoint.** No actionable
schema, event-correlation or bounded-transport finding. This is not an actual
indexed readback or acceptance of a deployment. Parent owns that later gate.

## Scope and source review

Fully read the helper, all 14 tests, author report, current G6 parent decisions,
actual persisted schema, G4 occurrence-ID/fee mapping, retained three-event A9
evidence and its independent review. Only this private report was written. No
source/test edit, key access, actual HTTP/RPC query, payment, build, Graph command,
dependency change, Git operation or full repository gate was performed.

The TypeScript testing skill guided boundary checks and honest attribution:
author missing-module failures remain setup failures, not behavioral Reds.
Independent supplemental checks below passed immediately; no new Red is claimed.

Verified contracts:

- Explicit CIDv0 decoding, consumed G1 refusal, exact versioned endpoint, exact
  `_meta.deployment`, false indexing errors, integer height 60523612..2147483647.
  CID format is not independent approval of a deployment or caller authority.
- Three retained transactions select at most four settlements, so an extra
  selected-transaction event cannot hide behind a three-ID filter. Exactly three
  distinct expected IDs, emitted buyer/amounts/nonce, emitter, transaction and
  block are required. Static source and null canonical listing are required.
- `Settlement` has no logIndex field. Its exact 36-byte occurrence ID binds the
  expected transaction and little-endian log suffix: root 49/31000000, child
  44/2c000000, grandchild 45/2d000000. `TreeOccurrence.logIndex` is checked directly.
- Tree root/occurrence correlation, one occurrence, nonambiguity, child count 2,
  child total 60000 and retained root coordinates are exact. Query first:2 catches
  a second tree occurrence; missing, duplicated or conflicting rows fail closed.
  Non-tree settlements must retain tree:null.
- Marketplace null and six empty first:1 registry/canonical-table selections are
  required, without synthesizing counts or historical listing/skill ownership.
- Strict own-data shapes, fixed refusal text, immutable projected proof, canonical
  uint64 timestamps and root/Tree/occurrence timestamp coherence. Provider errors,
  partial GraphQL data and extra envelope fields are refused, not exposed.
- One attempt per created operation; explicit injected transport only. Fixed
  unsigned POST has only JSON/accept/identity headers, credentials omitted and
  redirects refused. No auth, payment/session headers, retry or fallback exists.
  Whole-operation monotonic checks, 65536-byte cap, supplied-length equality,
  fatal UTF-8, cloned chunks, empty-progress cap and finite cancellation apply.
  An uncooperative injected transport can remain unresolved, but cannot produce
  late accepted evidence. This is not an OS-level synchronous-code watchdog.

## Executed independent checks

1. `bun --no-env-file test internal/task6-indexed-query.bun.test.ts`
   — **14 pass, 0 fail, 135 expect calls, 196ms**, exit0. Includes the bounded
   inert-import Bun child with synthetic selector/global-fetch refusal; exact
   child exit was awaited. No owned child or test remains running.
2. Fileless TypeScript program from the real root tsconfig, roots only
   `internal/task6-indexed-query.ts` and its `.bun.test.ts`, preserving parsed
   options and disabling incremental/composite emit state — **2 roots, 0
   diagnostics**, exit0. No generated output or configuration mutation.
3. Fileless installed GraphQL **16.11.0** parse/buildASTSchema/validate check of
   the actual request captured through one injected Response.json({data:null}).
   **One operation, 11 roots, 0 validation diagnostics**. Persisted object fields
   came directly from actual `subgraph/schema.graphql`; only Graph's query/meta,
   scalar/directive, order and filter facilities were explicitly modeled.
   Facilities covered the exact queried entities, Bytes ID/filter inputs,
   txHash_in, treeHash, first/orderBy/orderDirection and meta deployment/hash.
   A negative control renamed the actual TreeOccurrence.logIndex field and
   produced exactly `Cannot query field "logIndex" on type "TreeOccurrence".`
   This improves on syntax-only checking, but is not live graph-node schema
   introspection or proof of the endpoint's deployed query facilities.
4. Fileless unsigned supplemental matrix — **18 assertions pass**, exit0:
   manually literal ID suffixes independent of Buffer.writeInt32LE; canonical
   timestamp 0 and uint64 maximum accepted with coherent root projections;
   overflow, leading zero, negative, decimal, exponent, trailing newline,
   numeric and null timestamps refused; below-minimum, above-Int-max, fractional
   and string indexed heights refused; Int maximum accepted; settlement input
   order normalized; metadata source refused. Synthetic timestamps only.

All test/AST transports were injected in memory; no endpoint was contacted.
The AST negative control deliberately changed only in-memory schema text, not
production source. The helper/source pins remained unchanged after this review.

## Evidence limits and later acceptance

Returned indexed height/hash and timestamps are provider observations. The
retained receipt projection contains no block timestamps; coherent uint64 text
does not independently verify them. No block-header inclusion, canonicality,
current-head or Studio-Synced claim follows. Exact historical event readback
would still not prove off-chain lineage, delivery, margin, per-skill attribution,
full marketplace or ERC-8004 coverage, nor authorize another purchase.

Parent separately reported the newly acknowledged deployment while this review
was finishing. I did not invoke it or incorporate that message as independently
observed chain/indexing evidence. Failure telemetry retaining request endpoint,
start and HTTP status without response-body cloning does not widen this helper's
proof; unavailable meta/hash fields must stay unavailable. Any additional query
or diagnostic remains a separate parent decision, never an automatic retry.

## Frozen SHA256 inventory

| Path | SHA256 |
| --- | --- |
| `internal/task6-indexed-query.ts` | `eef1fbab2d2319bb4da3db310c3f8b375f4ade67c8d66b8b765cfd430a0c38bb` |
| `internal/task6-indexed-query.bun.test.ts` | `ede1c60e0f10e55c80465ddfb5f267c5ec4db52f80ef7d613cb8cc4d312133e8` |
| `internal/task6-indexed-query-report.md` | `0701eb0f19392b2131d2f5c3142c99247a297ed248c486fa72daa0b60c4f7230` |
| `internal/task6-a9-event-evidence.json` | `0c2390f730be4fc0f4a495bcb590e0c51e9277153d9fe30cdc166d7f2872786c` |
| `internal/task6-a9-event-review.md` | `57847b3125698fb28d70acb9e5c4cc266d53e82ed75376d6afe0b0bc3d27f01c` |
| `subgraph/schema.graphql` | `eb08f3767b2916cbe0b4e66f73f81f6b23156b362b20f58cf925f6fae66e97db` |
| `subgraph/src/ids.ts` | `cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db` |
| `subgraph/src/fee-splitter.ts` | `50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642` |
