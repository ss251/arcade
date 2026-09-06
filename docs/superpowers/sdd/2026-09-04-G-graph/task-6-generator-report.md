> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 splitter generator — author checkpoint

Frozen September 6, 2026 at 03:32:57 UTC. Implementation is ready for independent
review; this is not a claim of completed G6 deployment or live acceptance.

## Scope and applied decisions

Fully read Task6, task6-readiness.md, current task6-parent-decisions.md including
the post-G5 release, repo instructions, and ts-testing. The testing skill drove
behavioral fixtures against the actual public producer, explicit failure/Green
chronology, and separately attributed supplemental coverage. No missing-import
failure was counted as a behavior Red, and no deliberately wrong implementation
was seeded to manufacture one.

Only two released source/test files were created. The renderer/profile/list,
package scripts, mapping/schema, README/runbook and deployment command belong to
other authors. No dependency, Git, native AS, codegen, Graph build, remote request,
Keychain lookup, payment, upload or deployment was performed by this author.

The import-safe generator exports:

- `decodeSplitterDiscovery(hubOrigin, listings, wellKnown)` returning only current
  candidate address/seller/observed listing IDs, with no historical attribution.
- `planSplitterUpdate(existing, discovery)` returning canonical list JSON and
  added/total counts; it independently revalidates both arguments.
- `updateSplitterList(options)` with explicit file URLs, origin, read-only fetch
  seam, optional AbortSignal and required write boolean. Permission, fetch, signal
  and cloned URLs are captured before the first await.
- `parseSplitterArgs(args)` accepting only explicit `--hub <origin>`, optional
  `--write`, or standalone `--help`. CLI paths are repository-relative to the
  module, never caller-selected output/explorer paths or ambient configuration.

`SplitterFetch` is the plain fetch call signature, not Bun's additional
`fetch.preconnect` property. No production import of core money/chain selection:
the local price conversion matches the public grammar and six-decimal arithmetic
with an input-length bound, positive uint256 bound and no Number arithmetic.

## Actual trust and I/O contract

The sole source authority is B9's frozen `approvedSplitterPin(address)` lookup.
Pilot at historical block0 is mandatory. A9 may be added only at60460646 with
its exact reviewed seller. Unknown pins, seller mismatch, duplicate pins,
changed heights and inventory metadata are refused. Existing pins are never
pruned. Output contains only address/startBlock; it never emits listing context,
canonical links, Marketplace totals or registry/template activation.

Two sequential GETs target exactly `/listings` and `/.well-known/x402` at a
captured canonical HTTPS origin (explicit HTTP loopback is supported for local
callers). Requests have only Accept, credentials omitted, redirects refused,
no body and no auth/payment/session headers. There is no POST, retry, explorer,
RPC or metadata fetch. Exact default EIP-3009, one exact accept, Arc CAIP-2,
USDC, canonical positive atomic amount, path and inner/outer resource equality
are checked. Resource seller spelling is normalized only for identity matching;
raw inner/outer resource equality remains required.

JSON capture rejects accessors, exotic prototypes, symbols, sparse arrays,
non-JSON values, invalid scalar Unicode, depth above16, more than1000 array rows,
more than50000 nodes and more than1MiB captured string/key bytes. Each response
also has an exact1MiB raw byte bound and fatal streaming UTF-8 including EOF.
The catalogue uses a closed current-public field set and validates the fields
needed for payment discovery; this is not a replacement for the full core
PublicListing decoder. Description/output-schema/price drift and missing or
duplicate matches fail closed. Discovery-only entries are excluded because
current discovery retains ENS-expired records that `/listings` omits.

The two reads are not an atomic hub snapshot. Unobserved concurrent changes
cannot be disproved, and an announcement never assigns an emitter's historical
settlements to a skill. Valid empty discovery preserves every existing pin.
The retained empty production response lacking a rail is explicitly refused,
not silently upgraded into EIP-3009 evidence.

Transport has a10-second timer plus per-continuation monotonic deadline checks.
Uncooperative read-only promises race cancellation; late acquired response bodies
are cancelled and never decoded. No late network result can trigger a write.
Local file operations are awaited, regular-file/NOFOLLOW/nonblocking opened,
and read into a fixed65537-byte buffer with a65536-byte acceptance bound.
The deadline is checked before final rename; no claim of a hard kernel-filesystem
deadline or interruption of an already entered rename is made.

Final renderManifest validation and all12 real schema/mapping/helper/ABI file
prerequisites complete before the exclusive same-directory temporary file is
created. Explicit write uses rename only after another cancellation and
cooperative concurrent-output check. Temporary files and handles are cleaned.
This is single-file atomic replacement, not hostile-filesystem CAS, multi-file
atomicity, fsync/crash-durability or a power-failure experiment.

## Preserved test chronology

1. Tests were authored before the new implementation. The first actual collected
   run was46 cases:44 PASS /2 FAIL /88 assertions. Both failures were fixture
   issues: a ReadableStream pulled and aborted before the generator acquired it,
   and Bun interpreted an empty `test.each` row as a done-callback test. Corrected
   stream acquisition timing and wrapped parameter rows; neither is a source Red.
   Initial source SHA3fbd6fa58d7dc76a1ffb980acf558367e54e0db458f5ab408e2a6222cdd41c9a;
   initial test SHA353d7e2f4881e5b586bf070fbb72424a4bb0cc73cfaf89caa5d5fded8ef23342.
2. Supplemental actual-producer mixed-case seller fixture reproduced a genuine
   source Red:46 PASS /1 FAIL /89 assertions. Producer preserves seller spelling;
   the draft required lowercase paths. Canonical address-key matching corrected
   this without loosening exact inner/outer path equality:47 PASS /90 assertions.
3. A hostile thrown Proxy whose getPrototypeOf throws reproduced a genuine fixed
   diagnostic Red:0 PASS /1 FAIL /47 filtered, raw PRIVATE_THROWN_VALUE observed.
   Replace instanceof inspection with a private WeakMap of owned failures. The
   unchanged selected test passed1/1 assertion; raw errors are never interpolated.
4. Supplemental bounds, actual uint256/price parity, absent-rail refusal, drift,
   invalid inventory, no-retry second-GET failure, late fetch cancellation,
   concurrent output preservation and actual import/help tests passed57/116.
5. A mutable caller options test reproduced a genuine dry-run Red:0 PASS /1 FAIL
   /57 filtered. The injected GET changed write:false to true and the draft wrote
   the owned output. Capture write/fetch/signal/file URLs before awaits; unchanged
   selected test passed1/1 assertion. This concerns direct API callers, not a
   demonstrated CLI remote-data permission bypass.
6. Fixed-size/nonblocking local read is supplemental source hardening, not an
   executed FIFO or oversized-local-file regression. Final suite passed58/117.

Initial exact two-root typing found three test-only diagnostics: Headers.keys
was not in the configured library, and two mock fetch casts lacked Bun's
preconnect property. Switched to Headers.forEach and the actual used fetch-call
signature, without suppressing diagnostics. Final exact two-root strict:0.

## Final verification and pins

`bun --no-env-file test scripts/graph-splitters.bun.test.ts`:
58 PASS,0 FAIL,117 expect calls, one file,322ms at the final checkpoint.
The three owned Bun children use empty env, ignored stdin, an8192-byte stream
cap and a3-second fuse; actual import/help/invalid-argument paths exited normally
and all were awaited/reaped. No child binds a socket or issues a request.
Owned temporary directories were removed in finally; no running process remains.

Exact typing used installed TypeScript: read and parse the root tsconfig,
`createProgram(["scripts/graph-splitters.ts", "scripts/graph-splitters.bun.test.ts"],
{...parsed.options, incremental:false, composite:false})`, then
`getPreEmitDiagnostics`;2 roots,0 diagnostics. This includes real transitive
imports and is not the full repository gate.

| Frozen path | SHA-256 |
| --- | --- |
| scripts/graph-splitters.ts | 2507b8241c9ed373ef5d9e4f239c8e649cf0e784a9f510e631c2dd299555e766 |
| scripts/graph-splitters.bun.test.ts | 4894bd0037005bf7c07aba2da66aa50d39618518e8e793d9fdcab4e102b7844f |
| subgraph/build-manifest.ts (B9, unchanged by this author) | 853f1f1a5133e0c643f2a030e355cfe0d21a89d9ac8a04cc7f7fbb6c26efcc9d |
| subgraph/splitters.json (B9, unchanged by this author) | 2bb81f7ba113799c9204a85c30cad13279826c4763708b3d835adb7d2a7dd2c9 |

No independent review, root full gate, deployment, live hub join, indexed A9
query or fresh source-identity observation is claimed by this checkpoint.
