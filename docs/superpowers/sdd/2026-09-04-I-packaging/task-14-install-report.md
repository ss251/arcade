# I14 isolated installation checkpoint

Source is locally merged I14 revision
`326d6e433aec8c5d1e12d42db2e9f61d9f4daf5e`. A fresh owned local clone
used no hardlinked Git objects and initially had no node_modules, tracked edits
or untracked files. No ignored source-checkout files or credentials were copied.
This is a same-Mac/local-repository check, not a fresh machine or GitHub fetch.

## Installation observation — September8,2026 IST

Bun1.3.14 installed1269 packages in62.00s with frozen lockfile, lifecycle
scripts disabled, concurrent-scripts4 and network-concurrency4. Installation
used a new private HOME and cache, not the warm dependency directory. Public
registry retrieval was allowed; no paid API or wallet was invoked.

The clone remained completely clean afterward, with a real new node_modules
directory and unchanged lock SHA256:
`ebb1b754ef14940ee2de10f9bc553894b416953859f5305b2a154a0c570eebe3`.
The source checkout's unrelated untracked foundry.lock remains untouched.

The installed direct versions included Vitest3.2.7, TypeScript5.9.3,
viem2.55.8, Effect3.22.0 and the locked Circle/x402/Graph/Anthropic packages.
The existing local Python3.12.4 executable directory is placed first on PATH
so the private test home does not depend on a user's pyenv version file.
No source patch, lockfile change, lifecycle enablement or xcodebuild was needed.

## Gate and limits

The sole41596 full-gate attempt ran **in the fresh clone only**. Vitest passed
5327tests/242files in69.20s. Bun passed1346 but recorded3import failures and
3errors across97files (11803assertions,196.44s). The missing modules were the
separate workspace's GraphQL and Graph ABI parser imports in schema, ABI and
escrow checks. Typecheck/web stages did not run because the gate short-circuited.
Root-only installation therefore did **not** establish a passing fresh gate.

Source inspection also found that the escrow checks read the recorded ERC8183
Solidity source. Recovery installed447 subgraph packages from its own frozen
lockfile in22.84s with scripts disabled and the same four-job limits, then
initialized only gitlink142e669c1fd318486a4628395b629f033654dd06, clean and
non-recursive. No package/lockfile change, source workaround or contract repin.
The README now makes both prerequisites explicit. Five documentation files
were byte-mirrored before the initial run; that README correction and result
annotations are included in targeted recovery. Application code is unchanged.

The targeted recovery ran only the three affected subgraph files plus the
README-sensitive packaging checks: **85 tests passed across four files,
225 assertions, 1.400s**. Root/web strict typechecks then passed, and the
previously unrun client/SSR builds passed in335/166ms. No full-suite repeat,
and no retrospective all-green first-attempt claim.

Final read-only integrity checks confirmed application code unchanged, both
dependency directories newly installed rather than symlinked, and the
submodule clean at its recorded revision. Root lock SHA256 remains the value
above; subgraph lock SHA256 matches the source checkout:
`850b4b28d9dc3951346a9c50d0b180cd6bcb94807900336dee24ae79ede7a5b1`.
These are same-host results after documented prerequisite recovery, not a
second complete cold-gate result. Final review found exactly six documentation
paths, four added local links resolving, an empty index before staging, no
privacy-heuristic matches and no whitespace errors.

This check does not run Forge/Matchstick, inspect a production service, replay
live integrations or establish public GitHub reachability. Owner recording,
voice, check-ins, upload/submission, ENS re-point and paused live work remain
separate. Scripts-disabled installation is the tested route, not a claim that
arbitrary third-party lifecycle scripts were audited or safe to execute.
