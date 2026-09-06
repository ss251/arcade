> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H9 browser-held ordinary job store — author report

2026-09-06. Two released source/test paths only, plus this private report.
Implemented the parent-approved seven-field contract and refinements from
`internal/h9-contract-preflight.md` (SHA-256
`1e11e918cd14a61831dc0b5eb67b22337e773034fddbcd8342138a073e483f51`).
The full preflight and ts-testing skill were read before implementation. The skill
kept tests on actual exported behavior using the existing Vitest stack; no new tool
or dependency was introduced. Source is frozen pending independent review.

## Delivered interface and behavior

- `KEY = "arcade.jobs.v1"`. Exported `StoredJob` extends `JobScope`, with exactly
  jobId/token/skillId/priceAtomic/createdAtMs/hubOrigin/realm; realm is ordinary only.
  `JobReadState`, `RememberOutcome` and `ForgetOutcome` expose fixed diagnostic
  statuses without raw input, capability or provider/storage exception text.
- `remember(input: unknown)` returns stored with `recovered: boolean`, or
  already_stored/invalid/unavailable/capacity/conflict. `list()` and `readState()`
  return fresh defensive copies. `get(jobId: unknown, scope: unknown)` and `forget`
  require both arguments; missing or malformed scope is not implicitly bound.
  Deletion returns removed/not_found/invalid/unavailable. `forgetAll()` removes only
  this one key, including malformed contents, and never calls Storage.clear().
- Rows and scope require exact enumerable own data fields and plain/null prototypes.
  Accessors, unknown/symbol fields, custom prototypes and non-scalars are refused;
  reflective exceptions stay fixed. Scalar bounds precede expensive money/URL work:
  job suffix 16–128 ASCII alphanumerics; skill ID 2–64 canonical lower-case slug;
  token exactly 32 lower-case hex; canonical 0..uint256-max decimal string; finite
  nonnegative safe-integer timestamp. Zero price is valid metadata, not proof of a
  free call. No input getter, coercion or toJSON is invoked.
- Origin is at most 2048 characters, exactly URL.origin, with HTTPS or HTTP literal
  127.0.0.1/[::1] only. No credentials, slash/path/query/fragment, whitespace,
  backslash, default-port normalization or implicit localhost/legacy issuer alias.
- Browser storage is resolved at call time after input/scope validation. Each
  operation captures one Storage instance for its read/write; later calls re-read
  and observe replacement or access denial. Module import is inert. SSR does not
  consult a server-global localStorage, and failed writes never fall back to an
  in-memory stored result.
- Raw JSON is bounded to 262144 UTF-8 bytes before parse, with an earlier code-unit
  ceiling, and at most 200 rows. A malformed row, duplicate composite identity,
  excess size/count, bad JSON or issuer-less legacy row invalidates the whole
  envelope. Reads do not salvage, repair, save or delete. An explicit valid remember
  can replace the malformed envelope with its row; only successful persistence
  returns stored/recovered:true. Failure preserves the prior bytes.
- Identity is hubOrigin/realm/jobId. Exact duplicates compare all seven fields and
  return already_stored without writing, including at capacity. Changed token,
  skill, amount or timestamp conflicts and preserves the original. New rows cannot
  evict old rows. Both row and actual compact serialized byte ceilings apply.
  Sorting is newest first, then raw lexical origin/realm/job ID, never locale/token.
- Serialization stringifies only known primitive scalar values, not input objects
  or arrays with inherited toJSON hooks. Read and returned row mutations cannot
  change persisted authority. No token-bearing result/error diagnostic is added.

## Chronology and actual checks

All test invocations ran in HROOT with login:false and the following clean command
prefix; the installed Node-hosted Vitest reports v3.2.7:

```text
env -i PATH=<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run apps/web/test/job-store.test.ts
```

1. **12:35:20 IST:** tests were written first under the parent's initial release
   filename jobs.test.ts. The missing jobs.ts run failed one suite with zero
   collected tests: setup evidence only. No jobs.ts implementation was created.
2. Parent corrected the paths to the original plan. apply_patch moved only the new
   test to job-store.test.ts and updated its two imports. **12:35:35:** missing
   job-store.ts again failed one suite, zero collected: setup only. No duplicate
   alias/module remains.
3. Wrote the complete functional implementation. **12:38:01:** all **69/69** tests
   passed, 21 ms tests / 261 ms total, exit 0.
4. Parent hypothesized unflagged JS `$` accepted final line terminators. Added
   actual LF/CR/U+2028/U+2029 cases for jobId/skillId/priceAtomic at remember and
   persisted readState, plus get/forget job ID boundaries. **12:40:24:** all **4/4**
   new cases passed (69 filtered), 4 ms tests / 245 ms total. The actual runtime
   refuted the hypothesis. No regex/source correction or behavioral Red is claimed.
5. Added exact compact write-byte-cap, pre-storage validation, same-instance capture
   and next-call refresh, and inherited serialization-hook controls. **12:41:49:**
   final **77/77** passed, 35 ms tests / 305 ms total, exit 0. Source remained the
   first complete implementation. No genuine product Red was observed in this slice.
6. Final TypeScript program used exactly the two owned source/test roots and the
   actual web tsconfig with strict:true: **zero diagnostics**, exit 0. No casts to
   disable strictness, replacement config or whole-project gate was used.

Exact strict body (executed with clean env and `bun --no-env-file -e`):

```ts
import ts from "typescript"
const configPath = process.cwd() + "/apps/web/tsconfig.json"
const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys,
  process.cwd() + "/apps/web", undefined, configPath)
const program = ts.createProgram([
  "apps/web/src/lib/job-store.ts", "apps/web/test/job-store.test.ts"
], { ...parsed.options, noEmit: true, incremental: false, composite: false })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
// Format any diagnostics; report exact roots/strict/count; exit nonzero if nonempty.
```

The capacity tests distinguish exactly 200/201 rows, exact 262144/+1 raw bytes
before parse, multi-byte UTF-8 overflow before parse, and exact compact serialized
write capacity independently of the row ceiling. Long synthetic URL-origin hosts
exercise accepted canonical URL shape, not real DNS reachability. Test-local
prototype serialization hooks and browser globals are restored in finally/afterEach.
Only synthetic token-shaped values were used; no operational key or capability.

## Limits and scope preservation

This is a browser storage primitive, not H10 purchase/retrieval integration. It does
not establish issuer/token validity, confirmed settlement, budget, balance, refund,
payment idempotence, remote proof, XSS resistance, cross-tab atomicity, backup or
cross-device recovery. Same-origin scripts can read localStorage; concurrent
read-modify-write operations can lose updates. Invalid-envelope recovery can replace
otherwise recoverable bytes, hence the explicit recovered flag for UI disclosure.

Current H4's localhost default and current server-held ordinary purchase/poll
capability flow remain unchanged and separately documented prerequisites. F session
capabilities are not exported or inferred from token shape. No receipt/output/token
was added to model history, SSR props or UI. No H10, H4, Chat/Confirm, hub, F/core,
public documentation, package, dependency, network, browser, Git or full-gate work
occurred. Parent owns independent review, publication and the single complete gate.

## Frozen inventory

| Path | SHA-256 |
| --- | --- |
| apps/web/src/lib/job-store.ts | `bb851e53a2ee8c3ff09874b2ecaa8787ab90726cb830d0f098b9d6092d86b251` |
| apps/web/test/job-store.test.ts | `695c5f1e7cd891dbbc89c5dc577dd88b21b5231dddf7522d9ff60e515c0855f3` |

151 source lines, 294 test lines. Scope readback found only job-store.ts and
job-store.test.ts, with no jobs.ts/jobs.test.ts alias. All author commands are stopped.

## Independent-finding follow-up — fixed reflective refusal

2026-09-06. The entire original report above is preserved byte-for-byte at SHA-256
`895204b2124d20b00d6037b8c61c91eacb2ab3ea1ba3ff329c3149d723841847`.
Its initial no-product-Red history remains historical; the following is a later
independently discovered and subsequently reproduced correction, not a relabeling.

Fully read `internal/h9-independent-review.md`, initial SHA-256
`ca7d8f97631a06aabf3903bacaff001222c2be878344e3c7d51aea7e8651413d`.
The reviewer found that own() called Array.isArray outside its fixed-refusal catch.
A revoked Proxy therefore escaped as TypeError from remember(input), get(scope),
and forget(scope). Parent released only the original two paths and this appendix.
The ts-testing workflow was read and used to capture the public-entry Red first.

- Added three collected regressions with a revoked Proxy at those exact boundaries.
  Finally assertions independently check zero browser storage getter access and
  zero getItem/setItem/removeItem calls, including during the failing run.
- **12:46:57 IST:** unchanged original source `bb851e53…` produced **3 failed /
  77 filtered** (80 total), 6 ms tests / 280 ms total, exit 1. Each actual failure
  was the IsArray TypeError; this is genuine behavioral Red evidence.
- Moved only Array.isArray(input) into the existing try/catch. The nonthrowing
  null/typeof precheck remains outside. No broader Proxy sandbox, schema change,
  Storage behavior, capability or signing change was added.
- **12:47:28:** complete focused suite **80/80 passed**, 34 ms tests / 312 ms total,
  exit 0. Fixed outcomes are invalid/undefined/invalid with zero storage access.
- Exact two-root strict using the actual web config: **zero diagnostics**, exit 0.
  This repetition includes config-read, config-parse and all pre-emit diagnostics.
  Commands use the same clean env, canonical Node-hosted Vitest and no-env-file Bun
  compiler invocation documented above. No full gate, browser, network or Git.

Corrected freeze:

| Path | SHA-256 |
| --- | --- |
| apps/web/src/lib/job-store.ts | `70fc863885e7c4e1ba0166ad27390a8c4f743395bb16bdeecd3d6afb557b98c5` |
| apps/web/test/job-store.test.ts | `3035db94bbc0258615c60ca72ff64e906ee7dda0f85dd0189e564ef5710f6418` |

Original private preflight and initial independent review remain unchanged. Source
and tests are frozen again; independent correction verification and the parent's
single full gate remain separately owned. All author commands are stopped.
