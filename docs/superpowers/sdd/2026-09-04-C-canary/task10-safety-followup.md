> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# C10 safety follow-up — 2026-09-05

Scope: `scripts/e2e-canary.ts` and new `scripts/e2e-canary.bun.test.ts`. Root requested three pre-live safeguards only. No main-checkout changes, commits, staging, keys, real services, transactions or funding.

Preflight: C worktree tracked-clean at `c5c1d75`; only existing untracked `.superpowers` reports. `c5c1d75` is an ancestor of main. Read full work order, C10, current script/runbook and ts-testing skill.

Mechanically extracted existing launch/stop/cleanup behavior into `OwnedProcesses` and `withEvidenceCleanup` before changing behavior. Genuine Red at **2026-09-05T00:46:38Z**: 4 failed / 2 passed. Failures observed actual Bun execArgv missing `--no-env-file`, a real live child incorrectly marked done after an injected signal error, PASS despite failed cleanup, and publication while the actual owned child remained alive. This was not an import/missing-symbol Red.

Fixes: actual children receive `--no-env-file`; repeated signal-error events do not resolve exit unless spawn produced no PID; completion callback runs only after successful cleanup. Existing signal escalation, PID > 1 guard, ownership set, reverse cleanup and private-diagnostic suppression preserved. Evidence RPC, paid pipeline, scheduling, two-purchase amount and fixture skill unchanged.

Verification:

- **00:47:03Z:** `bun --no-env-file test scripts/e2e-canary.bun.test.ts` — 6 passed, 19 assertions. Harmless local printing/waiting child fixtures only, all reaped.
- **06:17:30 IST:** `bunx vitest run apps/hub/test/canary-evidence.test.ts` — existing 19 passed.
- `bunx tsc --noEmit` — no diagnostics; `git diff --check` — clean.
- No full gate run by child agent; root owns gate, review and commit.

Public-only prerequisite read at **2026-09-05T00:43:23.826Z** used an empty environment plus PATH and `bun --no-env-file`, no keys. Canonical Arc RPC reported chain 5042002, canary `0x2890ccF322155641545c6B4482Ea896B479aa937` balance 20,000,000 ERC-20 atomic units and 20e18 native units, facilitator/seller `0xcf821769ED3c0E55e152745377bb833d7155A78a` native balance 20.246261414999706250 USDC. Splitter `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf` reports version 2, feeBps 500, exact seller, canonical USDC. These are readback facts, not a live evidence PASS.

Live remains unrun pending root GO after merges. Intended effect budget remains two $0.01 testnet purchases plus facilitator gas, one isolated loopback hub/runner/SQLite/skills directory, five-minute controller and bounded owned-child cleanup. No automatic rerun after unknown settlement. Runtime entry should also use `bun --no-env-file` from an environment-isolated consuming shell; shell wrapper itself is outside this patch scope.
# Root completion — 2026-09-05 06:24 IST

Reviewed complete source diff and six actual Bun subprocess/cleanup tests. Full pre-commit gate passed 1,247 Vitest + 43 Bun tests, TypeScript and diff checks. Committed c5c1d75..bc90069 with Codex trailer and two intended files only; main fast-forwarded, all-four main gates running. Necessary focused follow-up deviation from the original one-commit-per-task plan: live prerequisite was supplied after C merged, and pre-live review exposed three process-safety defects. No lifecycle check was weakened; no key or live purchase used for tests.
