# I14 restart — main reinstall and complete fresh-clone gate

Source for both requested environment checks:
`d5cb5960d9322f8e6d5e585c9d7d4fd1edf55cc9`, September8,2026 IST.
This follows the [restart brief](task-14-restart-brief.md); the
[earlier isolated-install failure and recovery](task-14-install-report.md)
remain historical and unchanged.

## Reproduced problem and recovery

Before installation on main, Bun could not resolve
`@circle-fin/unified-balance-kit` from the buyer source directory.
The buyer manifest already declared version1.6.0 and the frozen lock contained
it. No new dependency, version bump, source workaround or lockfile repair was
needed. Main used a forced frozen reinstall, with lifecycle scripts disabled and
four concurrent network/script jobs:1269packages in3.65s. Resolution then pointed
to the installed1.6.0 package. Existing dependency directories were not deleted;
the independent clone below supplies the empty-install proof.

The fresh local clone used no hardlinked Git objects and had no node_modules,
private configuration or tracked/untracked changes before installation. It used
a separate initially empty HOME/cache:1269root packages in90.20s and447subgraph
packages in18.74s. No installed dependency directory or ignored source data was
copied. Unified Balance Kit resolved in this clone without a patch too.
Bun1.3.14 and the existing host Python3.12.4 executable were used; this is not a
claim of a fresh machine, public GitHub clone or audited lifecycle scripts.

## Full sequential gates

Each environment ran once, with at most four test workers, never concurrently.
Both complete attempts exited0; no skipped-stage recovery or whole-gate rerun.

| Gate | Reinstalled main | Fresh local clone |
|---|---|---|
| Vitest | 5371tests/242files PASS,72.29s | 5371tests/242files PASS,73.26s |
| Bun | 1877tests/100files/14595assertions PASS,329.94s | 1877tests/100files/14595assertions PASS,319.54s |
| Root and web strict TypeScript | PASS | PASS |
| Client / SSR build | PASS,344/173ms | PASS,384/186ms |
| Forge | 31tests PASS | 31tests PASS;74files compiled with Solc0.8.28 in3.14s |

The clone's entire tree and ERC8183 submodule remained clean afterward.
Main remained tracked-clean; its unrelated pre-existing untracked lock was
preserved and never staged. The application and dependency-lock bytes were
unchanged. Test signing/funding fixtures are local simulations, not new payments.

## Frozen prerequisites

Root lock SHA256:
`ebb1b754ef14940ee2de10f9bc553894b416953859f5305b2a154a0c570eebe3`.

Subgraph lock SHA256:
`850b4b28d9dc3951346a9c50d0b180cd6bcb94807900336dee24ae79ede7a5b1`.

Recorded contract gitlinks, not upstream tips:

- ERC8183:142e669c1fd318486a4628395b629f033654dd06.
- forge-std:620536fa5277db4e3fd46772d5cbc1ea0696fb43.
- OpenZeppelin contracts:5fd1781b1454fd1ef8e722282f86f9293cacf256.
- OpenZeppelin upgradeable:7bf4727aacdbfaa0f36cbd664654d0c9e1dc52bf.

Follow the [fresh-checkout commands](../../../../README.md#tests). Root and
subgraph frozen installs plus the ERC8183 source gitlink support the JS gate;
Forge additionally needs the three recorded nested libraries. No dirty submodule
may be force-updated. Passing local contract tests does not remove J6's
deployment/treasury/bytecode checkpoint.

## Follow-through

The owner-submitted check-in then fast-forwarded as21c641b, rebased from377e6bb.
Its document blob7a37058c47cc861abff35effbea98a99e82bc9b3 stayed identical.
The separate [I11 receipt](task-11-report.md) records owner confirmation without
rewriting the submitted historical snapshot. These subsequent changes are
documentation only, not a different dependency fix.

The new documentation checkpoint's sole sequential full gate also passed:
5371Vitest/242files69.00s;1877Bun/100files14595assertions319.17s; root/web strict,
client/SSR382/185ms and31Forge tests. Focused packaging/continuity checks passed
41tests/127assertions in4.11s. Final scope/link/privacy audit covers seven files,
14 local links and five frozen non-result document pins. No source/lock or
submitted-document change, extra full-gate retry or historical-failure relabel.
No push, live service verification, Graph payment, Circle authorization, owner
key, treasury choice or deployment occurred.
