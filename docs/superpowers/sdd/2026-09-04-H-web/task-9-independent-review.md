> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H9 independent review — initial checkpoint

2026-09-06. **One bounded finding; correction pending.** Fully read the accepted
`h9-contract-preflight.md`, Tasks 9–10 and current readiness during preparation,
then all 151 source lines, 294 test lines and the complete final author report.
The ts-testing skill guided existing-runner public-API checks, not a new framework.
No source/test edits, browser, network, credentials, payments, Git or full gate.

## Frozen baseline and independent results

| Artifact | SHA-256 |
| --- | --- |
| apps/web/src/lib/job-store.ts | `bb851e53a2ee8c3ff09874b2ecaa8787ab90726cb830d0f098b9d6092d86b251` |
| apps/web/test/job-store.test.ts | `695c5f1e7cd891dbbc89c5dc577dd88b21b5231dddf7522d9ff60e515c0855f3` |
| internal/h9-author-report.md | `895204b2124d20b00d6037b8c61c91eacb2ab3ea1ba3ff329c3149d723841847` |

Source/test hashes matched before and after the independent checks.

- **12:43:51 IST:** canonical installed Node-hosted Vitest v3.2.7: **77/77 passed**,
  one file, 55 ms tests / 376 ms total, exit 0.
- Actual `apps/web/tsconfig.json`, exactly source plus test roots, strict:true:
  **zero diagnostics**, exit 0. No emitted output or replacement configuration.
- One separately attributed fileless offline probe reproduced uncaught TypeError
  in all three invalid-input/scope entry cases below. No storage or network exists
  in that probe; it imports only the dependency-free storage module.

Focused command from HROOT, login:false:

```text
env -i PATH=<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run apps/web/test/job-store.test.ts
```

Typing used the same clean environment with Bun `-e`, loaded and parsed the actual
nested config with its absolute path, and created a noEmit TypeScript program from
`src/lib/job-store.ts` and `test/job-store.test.ts` while cwd was `apps/web`.
Config-load, config-parse and pre-emit diagnostics were all included.

## Finding: revoked Proxy escapes the fixed validation refusal

**P2, `own()` at source line 28.** `Array.isArray(input)` executes before the
helper's try/catch. A revoked Proxy throws from this operation, so `remember`
throws instead of returning invalid, and malformed `get`/`forget` scopes throw
instead of undefined/invalid. The accepted contract requires fixed reflective
refusal. This is not a capability leak, signing issue or hostile-Proxy isolation
claim; no broader execution-sandbox investigation is needed.

Exact fileless probe body, executed using clean-env Bun `--no-env-file -e` from
HROOT against the pinned source:

```ts
import { remember, get, forget } from "./apps/web/src/lib/job-store.ts"
const target = Proxy.revocable({}, {})
target.revoke()
const outcomes = []
for (const [name, run] of [
  ["remember", () => remember(target.proxy)],
  ["get", () => get("job_0000000000000001", target.proxy)],
  ["forget", () => forget("job_0000000000000001", target.proxy)]
] as const) {
  try { outcomes.push({ name, threw: false, result: run() ?? null }) }
  catch (error) {
    outcomes.push({ name, threw: true, type: error instanceof TypeError ? "TypeError" : "other" })
  }
}
process.stdout.write(JSON.stringify({ revokedProxy: outcomes }) + "\n")
```

Observed all three entries with `threw:true,type:"TypeError"`. Desired results are
respectively invalid, undefined (rendered null by this diagnostic probe), invalid,
with `threw:false`. The narrow remedy is to include the potentially throwing array
check within the existing fixed-refusal boundary and add the three public-API
regressions. Parent accepted the finding; author owns any source/test correction.

## Other checked behavior and provenance

The source and passing suite cover closed own-scalar rows/scopes, canonical issuer
identity, amount/size limits, duplicate/conflict policy, defensive copies, complete
envelope refusal, explicit visible recovery, same-instance storage capture,
call-time availability, import/SSR inertness, fixed storage IO outcomes and scoped
deletion. Primitive-only serialization avoids invoking inherited object/array
toJSON hooks on captured capabilities. No additional material finding was identified
in this bounded read. Passing synthetic storage tests are not real browser custody,
cross-tab atomicity, durable backup or token-validity evidence.

Author chronology remains distinct: two zero-collected missing-module/path setup
failures; first complete implementation 69 Green; four trailing-terminator guards
refuted the parent's hypothesis; final 77 Green after supplemental cases. There was
no author product Red in that initial history. The revoked-Proxy counterexample is
the subsequently reproduced independent finding, not a relabeling of setup errors.

H10 direct-browser acceptance/custody/CORS, token-free UI projection and localhost
configuration remain separate prerequisites. H9 adds no F session export or paid
transport and proves no settlement, balance or refund. Review acceptance is pending
the narrowly coordinated correction and its final source/test pins.

## Narrow correction verification — CLEAN

2026-09-06. The complete initial report above remains the exact original prefix,
SHA-256 `ca7d8f97631a06aabf3903bacaff001222c2be878344e3c7d51aea7e8651413d`.
The earlier finding and baseline 77-test acceptance remain historical; the following
records only the parent-released correction and independent repetition.

Reviewed the source delta, all three new collected cases and complete author-report
appendix. The only source change moves Array.isArray inside the existing try/catch;
null/typeof remain outside. Removing precisely that move and the new parameterized
test group in memory independently reconstructs baseline source `bb851e53…` and
test `695c5f1e…` exactly. The author-report prefix independently matches `895204b2…`.
An initial reviewer prefix calculation appended an extra LF and did not match;
using the exact existing prefix, without adding a byte, matches. No file was edited
to obtain this comparison and no source defect is inferred from that calculation.

The author appendix records three genuine collected failures at 12:46:57 IST on
the original source (77 filtered), followed by 80 passing tests at 12:47:28 after
the narrow correction. Independent verification on the corrected pins:

- **12:49:58 IST:** the same canonical clean-env focused command passed **80/80**,
  one file, 56 ms tests / 274 ms total, exit 0.
- Repeated exact source/test two-root program under the actual nested web config:
  strict:true, **zero config/read/parse/pre-emit diagnostics**, exit 0.
- The unchanged fileless three-entry probe above now returns
  `remember → {status:"invalid"}`, `get → undefined`, and
  `forget → {status:"invalid"}`, each with `threw:false`. Its JSON output uses null
  to represent the undefined get result. The collected regression also verifies
  zero storage getter/getItem/setItem/removeItem calls at all three boundaries.

Final frozen inputs:

| Artifact | SHA-256 |
| --- | --- |
| apps/web/src/lib/job-store.ts | `70fc863885e7c4e1ba0166ad27390a8c4f743395bb16bdeecd3d6afb557b98c5` |
| apps/web/test/job-store.test.ts | `3035db94bbc0258615c60ca72ff64e906ee7dda0f85dd0189e564ef5710f6418` |
| internal/h9-author-report.md | `c378e9d5b22a6d80cc56742965a2394377034ddc15e43943cc52583d7a07c4b7` |

Both source/test pins matched before and after the checks. **The bounded finding is
resolved; no further correction requested.** No browser, network, Git, full gate,
H10 custody/transport or F-session work was performed or accepted by this review.
No test or process remains active. Parent retains full-gate/publication ownership.
