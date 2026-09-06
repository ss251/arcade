> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H8 pure skill-page data loader — author freeze

2026-09-06. Bounded two-path implementation; no H8 route/UI/full-gate acceptance is inferred.

## Frozen scope and contract

Only new `apps/web/src/lib/skill-page-data.ts` and `apps/web/test/skill-data.test.ts` were authored. The complete current H8 readiness note, full Task 8, relevant H4 decoder/client/format source and ts-testing skill were read before implementation. The literal public-receipt-to-tree converter was not implemented.

`loadSkillPage(input: unknown, reads: Pick<typeof import('./hub.ts'), 'describeSkill' | 'listingReceipts' | 'resolveName'>, now = Date.now)` accepts only the closed own-data `{name: string}` wrapper. It validates the bounded name using H4's `skillIdOk`/`nameOk` before any read. Invalid inputs have fixed `invalid_name` without reflected values.

An ENS input resolves once. Only the real `EnsNameExpired` class produces `name_expired`; resolver faults/malformed identity produce `name_unavailable`. The resolved skill ID and seller are checked against detail. A valid but different detail identity suppresses the listing and produces `name_mismatch`, retaining independent public receipts. `resolvedName` is populated only after matching detail, never used as payment authority.

After resolution, `describeSkill(id)` and `listingReceipts(id,20)` are issued once each in parallel. Synchronous throws and rejected reads are contained independently. Missing detail is `listing: null`/`listing_unavailable`; missing receipts is `receipts: null`/`receipts_unavailable`; a successful empty list remains `[]`. The loader adds no retry, polling, tree read or cancellation mechanism. H4 continues to own its bounded HTTP operations.

The return boundary explicitly projects known fields before server serialization. Pay-test and history job IDs are always the empty compatibility string, not a correlation handle. Unknown root, stats, bounds, pay-test and descendant fields are omitted without invoking their accessors. H4 remains the scalar/receipt validator. Public schemas receive bounded own-data copying: finite numbers/plain objects/arrays only, depth 16, 8192 nodes, string/key ceiling 65536 and conservative 131072-byte accounting per schema. Functions, accessor values, cycles and unsupported object prototypes are refused without calling `toJSON`. This is not a hostile-Proxy sandbox or a classifier for secrets embedded in legitimate public seller prose/schema text.

H4's already-flattened identity metadata is preserved without fabricating raw chain/registry context. Counter bundles require agent ID, verified true, stale false, all bounded count values and passes no greater than reads; otherwise counters are omitted while qualified metadata remains. `settlementReferenceKind(raw)` runs before receipt whitelisting, so inherited/malformed presence cannot regain legacy absence. Public descendants remain flat records.

`SkillPageData` has the exact required nullable fields. Its listing is the assignable `SkillPageListing` subtype with recursive `JsonValue` schemas and numeric bounds, rather than an `unknown` serialization escape. No `strict:false`, `any`, or unknown-as-serializable assertion was introduced.

Parent's final observation policy is one safe integer `observedAtMs` captured after all allowed reads and projection, or at an early refusal return. This is a display timestamp, not an atomic upstream snapshot or paid clock. An invalid/throwing injected clock produces only `Skill page observation unavailable`; it does not invent zero or claim that no reads occurred.

## Actual TDD chronology

Times below are local Vitest-reported starts (IST); all runs were this one collected file through canonical Node-hosted `bun --no-env-file x --no-install vitest`.

| Checkpoint | Actual result |
| --- | --- |
| 12:01:00, tests written before module | Missing module; one failed suite, **zero collected tests**. Setup only, not a behavioral Red. |
| 12:02:45, first functional draft | 33/33 passed. These existing assertions are passing coverage, not retroactively claimed Reds. |
| 12:03:43, added ENS skill-mismatch regression | 33 passed / 1 failed: expected `name_mismatch`, received null because detail decoding collapsed the mismatch into listing unavailability. |
| 12:04:44, identity correction | 34/34 passed; explicit output JSON types also in place. |
| 12:05:45, parent-approved post-read observation contract | 34 passed / 1 failed: request-start 1700000000000 versus expected post-read 1700000000002. The old bad-clock no-IO assertion was removed to reflect the explicit changed policy, not hidden as an implementation fix. |
| 12:06:21, return-time observation correction | 35/35 passed. |
| 12:08:40, parent projection follow-ups | 35 passed / 6 failed. Five count-invariant cases were actual failures; the inherited-kind test initially used the wrong label `unknown` and ordinary inherited property lookup. That expectation defect is not retained as correct-contract proof. |
| 12:09:23, corrected inherited-kind contract and sixth count case | 35 passed / 7 failed. Own `settleRefKind` was absent instead of actual H4 `unrecognized`; five malformed qualification/group cases retained counters, and out-of-bound counters discarded the whole listing instead of retaining qualified metadata. |
| 12:09:59, final projection corrections | **42/42 passed**, one file, 131 ms test time, 1.10 s total; exit 0. |

The inherited-kind test prepares valid H4 rows before temporarily defining that property on `Object.prototype`, checks the projected own descriptor and null explorer, and restores the exact prior descriptor in `finally`. This is a bounded local metadata regression, not a live prototype attack claim. No assertions were weakened to obtain Green.

## Verification and reproducibility

Working directory: HROOT (`.claude/worktrees/h-web`). Focused command:

```sh
<owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run apps/web/test/skill-data.test.ts
```

Final exact nested strict check: **two explicit roots, zero diagnostics**, using installed TypeScript and the actual web options, including their config-file path. The relevant compiler body, run with `bun --no-env-file -e`, was:

```ts
import ts from "typescript"
const configPath = process.cwd() + "/apps/web/tsconfig.json"
const config = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd() + "/apps/web", undefined, configPath)
const program = ts.createProgram([
  "apps/web/src/lib/skill-page-data.ts", "apps/web/test/skill-data.test.ts"
], { ...parsed.options, noEmit: true, incremental: false, composite: false })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
for (const d of diagnostics) process.stdout.write(ts.formatDiagnostic(d, {
  getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n"
}))
process.stdout.write("exact roots 2; diagnostics " + diagnostics.length + "\n")
process.exitCode = diagnostics.length ? 1 : 0
```

Earlier exact two-root checks were also zero, but the final result above was repeated after both projection corrections. No whole-suite command, source dependency change, Git operation, actual HTTP fixture, browser, Graph request, operational key, model, wallet or spend occurred. All author commands had exited at freeze. Parent owns actual route/Start integration, broader checks, build, independent review and publication.

## Exact freeze and consumed-source pins

```text
4496ffb12f2b988141a6b6c05ecfd53a374ae50b6a81f3a53663e881f8205f89  apps/web/src/lib/skill-page-data.ts
87776e404b5c1cf5d4aebf8374b8c2904c0923e24f3458156437b71860788ce9  apps/web/test/skill-data.test.ts
506b21a5585be87fc2b4523fa9d2fb686bbef2fa1f60fa49bff0b48afc1abb99  apps/web/src/lib/hub.ts
25d571ddba8f4114e927ed23653e5a9e6eeeb3db7f044e7d9fdf05c71a7b6110  apps/web/src/lib/hub-http.ts
2b2d10c48a363d7f5dc7379ebfdf7963de0e5c11b61e58791d691b575dc2f6af  apps/web/src/lib/hub-decode.ts
279097cb9490e51559336d74dead3210dccfe926ec5b66a76c1c2949cc3e5855  apps/web/src/lib/format.ts
23308425de38f847c31342fabe80a675518a85e5589b6e0760134a5c78e449b9  internal/task8-readiness-current.md
```

The first two paths are authored/frozen; the remaining hashes identify consumed current contracts, not ownership or new changes to H4. Private this report is the sole additional artifact. No further source changes are planned absent a concrete coordinated finding.
