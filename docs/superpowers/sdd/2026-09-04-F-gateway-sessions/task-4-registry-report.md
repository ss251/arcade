> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F4 pure registry checkpoint — 2026-09-05

Parent implements only apps/hub/src/rails.ts and apps/hub/test/rails.test.ts here.
Server boot/discovery and pipeline wiring remain held until F3's actual hardened
Gateway interface is frozen. This checkpoint is not complete F4 or live evidence.

At 18:02:21 IST, the focused Vitest run collected ten tests and all ten failed
because the module did not exist. After implementation, the same ten passed at
18:02:46. Tests bind exact default object identity, lookup of all built rails,
absence (including prototype-looking strings), deterministic first-wins duplicate
handling, input collection snapshotting, immutable public names and registry, and
the same default instance in both Effect service tags. All rail handles are local
test rails; no network, environment or key is consulted by the registry.

Exact root-options compilation including the new hub test was attempted. It found
one current F2 gateway-sign dependency diagnostic through payments/index (a widened
string return, not assignable to usdc|gateway), not a registry diagnostic. F2 is
actively authored independently; no change was made to its files. The complete
strict check must repeat after F2 freezes; do not count this attempt as passing.
The shell observation also read a nonexistent apps/hub/tsconfig.json after the
successful focused tests; that was an inspection exit1, not a Vitest failure.

No full suite, commit, server wiring, default-rail change or live action is claimed.
Independent source review and actual boot/override fixtures follow before F4 commit.
