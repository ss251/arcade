> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b5 confirmation lifecycle report

September6,2026, after H10b4 `afe2026`. Root-only under the owner shared-machine
restriction. Frontend/testing guidance preserved the existing paper/ink/USDC
design, full payee and verified-name presentation; no redesign or dependency
installation. This is a UI gesture boundary, not payment approval authority.

## Actual regression and fixture corrections

Before editing Confirm, a bounded owned browser fixture used the real component
under StrictMode, synthetic public terms, actual native pointer/key input and
approval/denial counters. Its first startup failed because Bun lacked Vite's
raw-SVG import handling; no browser started. A narrowly scoped raw-SVG loader
corrected the fixture without changing production source.

The next run reproduced a genuine defect: during a held pointer gesture, native
Shift+Tab and Enter denied the card, yet the old interval subsequently approved
it too (approved1/denied1, expectedapproved0). A changed-price case returned0
but did not assert nonzero starting progress; it is NOT claimed as a reproduced
price-drift defect. A separate tighter retry timed out on background mouse
movement before producing observations. The already-known browser-harness
background-input remedy was then applied only to the owned headless tab:
activate that exact tab and verify visible state. No shared user profile,
foreground user tab, harness update, account or consent interaction occurred.

## Changed behavior

Each card can decide only once; mark it consumed before invoking either callback.
Deny cancels the interval before notifying its owner. A genuine new decision
requires a new card instance, not re-enabling a consumed one. Price/payee/network/
ENS/private decision identity/blocking/connecting changes and callback replacement
cancel old holds. A per-tick current-render check also closes the interval before
passive effect cleanup has run. Focus loss, hidden-document state, pointer leave/
release/cancel and unmount cancel; setup/cleanup is StrictMode-compatible.

Primary-pointer, Space and Enter use the same900ms monotonic hold. Repeated keys
and modified shortcut starts do not create another timer; ordinary clicks do
not approve. Invalid/backward clocks refuse. Connecting blocks payment even if
the caller omitted a separate blocker. Full decisionKey is private and never
rendered; subsequent Chat integration must bind original approval/tool/input/
complete context to it. Existing markup/color tokens and marks remain intact.

## Verified browser behavior and limitations

After the source change, twelve actual DOM interaction cases passed:
complete primary hold, repeated gesture after completion, early pointer release,
changed visible price, changed private input identity, blocked mid-hold, the
native denial regression, Space/Enter holds with key repeat, early key release,
focus leaving the button and unmount. Prop changes are test-controlled renders;
the pointer/key input is native CDP, not synthetic DOM click fabrication.

That run then failed a test-fixture assertion: a deliberately constant mocked
clock could not satisfy the helper's nonzero-progress precondition. Production
source did not change. Only the remaining supplement ran with an offset clock:
backward monotonic time, connecting mid-hold, invalid initial time and callback
replacement all passed (fourcases). The original twelve were not repeated.

Two captured layouts were inspected:1280px/light and390px/dark, both contained
at their viewport widths with full address, readable instruction, ENS and buttons.
The390px case is a width emulation, not touch-device proof. No manual native
document hide/window blur, multi-touch gesture or screen-reader session was
performed; those cancellation branches were source-reviewed. The fixture's
one-origin CSP forbids page connections and contains no wallet/payment code.
This does not prove the pending actual Chat/SDK/two-origin purchase integration.

## Owned execution and cleanup

Five separate private runs retained their original artifacts without overwrite.
All supervisors bound startup, drained streams with64KiB retention, owned their
fixture/installed Chrome-for-Testing/harness/check children and reaped them.
The final successful supplement exited0; the earlier expected regression,
background-input and clock-fixture failures remain nonzero historical runs.
No process was detached; parent loss and finite fuses stop owned services.

Independent later checks verified all22 recorded supervisor/child PIDs absent
with ESRCH and all8 former local HTTP/CDP endpoints refused with ECONNREFUSED.
The initial pre-browser failure had only a supervisor and fixture, no listener.
No KILL escalation was used in these records. Screenshot hashes:
desktop `92a47ac69485db235bacbee530c7f70115f8796029033a7fbeb21e6e1ca02bc5`;
mobile-width `cfa7ce0e55797504227f4cf623f9ee6d20fd031afcaab681b02cb8c92ec7ef12`.
Actual deny-regression stdout hash:
`50004afd2aaff1632fbbd09400faaead3e7620c8557e3947de8f83fd524a9991`;
twelve-case stdout:
`937a7638d3758fe6523f1300b579b41e28c17e3677fbc95dca36efdc733fd721`;
four-case stdout:
`5d9e4268ba3cede202fea7fbfd579f267ae6d222288d018825f0f880a001501f`.

## Automated checks and frozen source

First37 focused Vitest/3files passed15:19:44IST (1.01s,68ms tests), comprising
four new SSR/keyboard-cue/private-identity cases plus unchanged8ENS and25Thread
cases. These do not pretend to execute DOM events; the browser record does.
Exact nested4-root strict and separate root-config server-fixture strict each
passed0 diagnostics. One max4 sequential full gate began after browser cleanup;
source stayed frozen. Full results and the public-copy audit follow separately.

- `apps/web/src/components/confirm.tsx`: `731a187e3d8d5e6cecc1a6fca9748e9468922410685a49e973cb946d17b8995e`
- `apps/web/test/confirm-accessibility.test.tsx`: `0c3e3fa249419ffdedb4ba70f89ddf044054c22ae192e405c1463d13be66fce4`
- `apps/web/test/fixtures/confirm-browser.tsx`: `b65d9318eb8f45edc2191a6c5e1a92af88506ee7e8fa4e0353725351f7c1105c`
- `apps/web/test/fixtures/confirm-browser-server.ts`: `f575da01b2bbd6c2e430416a603d6c58e0b4bbf3f48300128e0712baff07417b`
- `apps/web/test/confirm-ens.test.tsx`: `b60f0ed451f1ccc024ad30e8a81826d8cf618c0e66b6089d82bae60c37e702b0`
- `apps/web/test/thread.test.tsx`: `a9ec7cd8515476f2349e9d32f647e7498c1acf4a297188e28428c93409e5494b`
- `apps/web/src/styles.css`: `b986bc5df513af48e1ae8908a38c48773c7514ab15103689c6853f01667d1d7a`

No independent review or delegation, real funds/key reads, prior approval replay,
production ENS/mainnet change or push. H remains unmerged. Active Chat still uses
its old signing/courier path; H10b4 one-use integration, courier retirement,
two-origin/restore proof, buyer/session completeness and H11–14 remain next.

## Final full-gate checkpoint

The sole max4 sequential full gate began15:27:21IST and passed3,886 Vitest/159
files in49.50s,834 Bun/54/6,091 assertions in162.69s, root/web strict and
client317ms/SSR144ms builds. Session9636 closed exit0. Local socket permission
was requested before the gate, source remained frozen and no repeat/overlap
occurred. Exact public-copy and source/preservation audit precede the commit.
