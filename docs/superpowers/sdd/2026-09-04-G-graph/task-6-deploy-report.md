> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 secure Studio deployment command — author report

Frozen 2026-09-06, final verification checkpoint 03:32:47 UTC. This is local implementation and synthetic offline evidence only. Actual upload, credential lookup and deployment remain NOT RUN by this author.

## Scope and policy

- Owned only `scripts/graph-deploy.ts` and `scripts/graph-deploy.bun.test.ts`; this ignored report is the sole documentation write. Root owns the package alias, combined review/gate, reviewed upload/CID, publication and any separately authorized real invocation.
- Fully read actual Task 6, current readiness/parent decisions including deployment/post-G5 additions, and all three retained G1 runtime/test precedents. The `ts-testing` skill guided failure-first behavioral boundaries, actual owned-child tests and exact nested strict verification.
- No G1 source edit, execution or approval replay. No operational environment/key read, actual `/usr/bin/security` invocation, network, Graph deployment, upload/build, dependency change, full suite, Git mutation or payment occurred.
- Fixed endpoint `https://api.studio.thegraph.com/deploy`, slug `arcade-ledger-arc-testnet`, version `v0.1.0`, and completion URL `https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0`. The consumed G1 CID and old version are refused; latest/wrong-account/wrong-version/query-suffixed completion URLs never establish success.
- The caller must supply a separately reviewed CIDv0 and a fresh absolute journal. Validation decodes all base58btc bytes and requires the 34-byte sha2-256/32-byte-digest multihash, not merely a Qm regular expression. Format validation is not owner approval or proof that an arbitrary valid CID contains the reviewed build.

## Public interface and ownership

- `Usage`: fixed help text explicitly requiring separate exact-deployment approval.
- `parseDeployArgs(unknown)`: standalone `--help`, or exactly `--cid CID --version v0.1.0 --journal ABSOLUTE_FRESH_FILE`, in that order. Extra/duplicate flags, getters, malformed arrays/policy and reflected proxy exceptions yield a fixed refusal.
- `createDeployment(options, dependencies?)`: synchronously captures trusted dependencies/policy and returns a no-argument async operation. Its latch is claimed before evaluation; rerun/concurrent evaluation cannot re-enter. A separately created operation sharing the journal path also refuses through exclusive creation.
- `deployMain(argv, dependencies?)`: fixed `{exitCode, output}`; help 0, deployed 0, validated provider rejection 2, malformed CLI 2, refused/unknown execution 1. Import/help/invalid CLI do not look up a key, open a journal or dispatch.
- `readDeploymentKey(signal, spawnKey?)`: default exact `/usr/bin/security find-generic-password -s arcade-graph-deploy-key -a GRAPH_DEPLOY_KEY -w`, empty child environment, ignored stdin/stderr, 64-byte capped stdout, 2.5-second deadline, TERM then 100ms KILL, and resolution/rejection only after the exact child's `close`. The injectable spawn is a trusted test seam, never a CLI selector.
- No credential argument/environment fallback/global Graph config/key file. Only the consuming process holds the returned credential and uses it in the fixed POST authorization header. Local string clearing is best effort, not a claim of cryptographic RAM erasure.

## Durable operation and transport

- Validate CLI/policy before touching the journal. All parent components are checked as non-symlink directories; the immediate parent must be current-user-owned 0700. Open matching parent identity and fresh O_EXCL/O_NOFOLLOW/O_APPEND journal 0600.
- Before every append recheck parent identity/mode, journal path/open descriptor identity, owner/mode, single link and exact expected size. Preserve sequence/previous SHA256/row hash, fixed public policy, and closed local events in at most 16 KiB. Loop through partial writes; fsync file and directory synchronously. A write/fsync failure poisons this lease; no repair, truncate, deletion or retry.
- `prepared` is durably written before key lookup; `dispatch_intent` before at most one POST. Deadline/cancellation checks occur before and after durable IO, at key-reader entry, and at actual fetch entry. A cancelled/late key cannot trigger a later POST.
- One captured monotonic deadline, default/maximum 20 seconds, covers key acquisition, response headers and complete body. Fixed POST body follows the installed Graph JSON-RPC contract; redirect:error, credentials:omit, identity encoding, exact HTTP 200, and exact response endpoint when a URL is present.
- Read at most 16 KiB, enforce actual versus declared Content-Length, fatal UTF-8, and check current cancellation/deadline around every read. At most 1024 consecutive empty chunks; clone each retained byte chunk before later reads. A late response is cancelled, never processed/retried; uncooperative cleanup is bounded at 100ms and cannot produce a successful outcome.
- Require JSON-RPC 2.0/id 1 and exactly one result/error. Only the pinned version query URL establishes deployed. For a valid error, retain the int32 code and local text `Studio rejected deployment`; provider prose/data are never reflected, including split/base64 credential examples.
- Completion is an observed remote acknowledgement, not proof that later cleanup succeeded. Any journal close uncertainty downgrades the returned outcome to unknown after dispatch. Existing intent/journal is retained; no automatic re-upload/build/retry or restart continuation exists.

## Failure-first chronology

1. Before the module existed, the seven initial collected tests all failed at dynamic import: **0 pass / 7 missing-module failures**, no behavioral assertion reached. This is setup/API absence, not seven security defects.
2. First implementation: **7 pass / 55 assertions**.
3. Added actual boundary regressions against source SHA `6750cb1dd7d48f7034f531a493beafbcd0db895a826f288708525789c188ca2d`: **13 pass / 2 fail / 114 assertions**. A non-string credential object's `toString` was accepted and dispatched; an async injected sync hook was incorrectly treated as a synchronous durability fence. Both expected refusal but observed deployed. Test SHA at this Red: `799ce07ba57b372c3515c0893adad3d1d806df613e5b8f8d5f2b85ceae1f0477`.
4. Narrow corrections require actual string type before regex/interpolation and undefined-only synchronous IO returns, consuming a rejected Promise without treating it as a fence. Unchanged two regressions plus adjacent checks: **15 pass / 118 assertions**.
5. Supplemental transport/actual native-child/inert-entry coverage passed immediately: **26 pass / 231 assertions**. These are Green coverage additions, not invented Reds.
6. First exact strict check exposed six TypeScript control-flow narrowing diagnostics; changing the fixed never-returning helper to a function declaration resolved them without changing assertions/behavior. These are typing setup findings, not runtime Reds.
7. Added actual silent-key-child deadline coverage: final **27 pass / 235 assertions**, **2.97 seconds**, exit 0. Native reader deadline was **2506.65ms**, exact child close awaited. TERM-resistant synthetic child closed by SIGKILL in **122.21ms**; success/output-cap/import/help/invalid children also exited and were reaped. No author process remains active.

## Exact verification

Focused command, in GROOT:

```sh
env -i PATH=[BUN_BIN_DIRECTORY]:/usr/bin:/bin [BUN_BIN_DIRECTORY]/bun --no-env-file test scripts/graph-deploy.bun.test.ts
```

Exact nested TypeScript check used installed TypeScript, read/parsed the absolute GROOT `tsconfig.json`, and created a program with only the two absolute owned roots, preserving config options and setting `noEmit:true, strict:true`. `getPreEmitDiagnostics` returned **0** after the final run. No full-suite/Graph build invocation.

Final source pins:

| Path | SHA256 |
| --- | --- |
| `scripts/graph-deploy.ts` | `5b9b4d18559eef775631effc9f30bb78343580e3d2487cc10791eafebb9f1000` |
| `scripts/graph-deploy.bun.test.ts` | `f73b9b371f30004af6873cc5b637fcf2224e944e063c47a709b14223edae0b92` |

Retained G1 precedents, read only/unexecuted:

| Path | SHA256 |
| --- | --- |
| `internal/g1-studio-deploy.ts` | `6b2eb10475d10649a97094015c2e0e1e956809b420487475c22b9b1a87b15f2e` |
| `internal/g1-studio-deploy.bun.test.ts` | `cb19ab118359d26f52606e8f4e052b912e290afcaeb16dcc6137df3e6f570967` |
| `internal/g1-studio-review.bun.test.ts` | `4dc83e0f405ecbf84c577fbba8c74a5a84dc0b90cdf986903365d53758a569dc` |

## Explicit evidence limits

- The 25-second CLI timer remains through cleanup, but is an event-loop backstop, **not an OS watchdog that preempts blocked synchronous filesystem calls**. The local cooperative filesystem/OS model excludes arbitrary storage hangs, compromised same-user races and unkillable-child recovery. No stronger finite crash-recovery guarantee is claimed.
- A journal's local hash chain detects accidental inconsistency; it is not an authenticated record against a writer who can replace/recompute local evidence. Exclusive-path refusal is not a global lock across arbitrary newly supplied journal paths. Separate exact owner approval is still mandatory for any actual invocation.
- All credentials in tests were deliberately public synthetic byte strings. Native tests intercepted the fixed Keychain spawn and ran owned inert Bun children instead. No real Keychain, provider response, Studio acknowledgement, deploy success, subgraph activation or live query evidence was obtained.
- Independent review, parent combined gate/publication/commit and any separately controlled real operation remain pending at this author freeze.

## Later independent native-reader ownership correction — 03:40:40 UTC

The entire original report above is preserved as a historical prefix, SHA256 `4a7b4f310f2f804c6111dc346d3762cc10edc974647a9104c7f4eb383d1d8055` including its original final LF.

G3 independently reproduced an integration gap on the original frozen source: `readDeploymentKey` itself waited for the actual child's close, but `createDeployment` raced that promise through its cancellation boundary and returned refusal first. The review observed operation return at 19.765ms with closedAtReturn:false, then native SIGKILL/close at 123.565ms; zero sends. This is an early cleanup-return defect, not a late POST or permanent child leak.

Parent released only the deployment source/test pair for correction. The collected real-child regression first failed on unchanged source: **1 pass / 1 fail / 5 assertions, 27 filtered**, 159ms. Expected closed:true at operation return, observed false; the test independently retained a two-second fuse and awaited the actual owned child in finally. The adjacent injected never-resolving reader test passed before correction.

The operation now retains its original key-reader promise and, after abort, awaits its settled cleanup in a separate **500ms** bounded window, sufficient for the normal TERM/100ms/KILL path. It does not treat rejection as proof of an unclosed process: the native reader rejects only at close. An injected reader that never settles cannot extend cleanup indefinitely and cannot yield a successful result. A timed-out cleanup remains a fixed refusal/unknown, not a reaping claim. No new key lookup or POST is introduced.

Final unchanged-command repeat: **29 Bun pass / 242 assertions / 4.18s**, exact two-root strict **0**, exit 0. Actual integrated child cleanup regression passed at 135.46ms; uncooperative injected reader returned refusal at 516.43ms with zero sends. Silent native deadline still reaped at 2507.28ms. No author process remains active. The reviewer's separate newline candidate was not reproduced and correctly required no source change.

Corrected final pins supersede only the two original source pins above:

| Path | SHA256 |
| --- | --- |
| `scripts/graph-deploy.ts` | `6e1397318b7f30e47842dc8fbd25994034fa33cd6cb084ba440fe3d1aca14de2` |
| `scripts/graph-deploy.bun.test.ts` | `8ce1071a0c4c5c80a2d730d85ad2d8ced5ecf2b678c10ffed1283736333d7907` |

The paused private indexed-query test scaffold was not run during this correction and is not part of this source freeze. All previous no-credential/no-network/no-deployment and cooperative-OS evidence limits remain unchanged. Independent correction acceptance and parent combined gate are pending.
