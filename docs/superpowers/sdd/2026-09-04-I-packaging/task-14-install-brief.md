# I14 follow-up — isolated local-clone installation reproducibility

Close the installed-worktree gap identified by I13 without pretending a local
clone verifies public GitHub reachability or a new host. Pin the merged I14
revision, create a fresh owned local clone with no hardlinked Git objects,
separate HOME/cache for installation and no copied node_modules or private
configuration. Never alter the source checkout or its untracked foundry.lock.

Use the pinned Bun lockfile, frozen installation, lifecycle scripts disabled,
four concurrent network requests and at most four lifecycle jobs. No dependency
upgrade, new package, submodule repin, source workaround or xcodebuild. Inspect
the actual command-local options before use. Retain failure evidence rather
than editing a lockfile to make installation succeed.

If installation succeeds, run exactly one sequential four-worker full gate in
that clone for this documentation checkpoint, not again in the warm worktree.
Record local toolchain/environment limitations. A local installation/gate does
not prove contract/subgraph tooling, remote deployment, owner configuration,
live integration, video or public source availability. Prepare a compact public
report with hashes and counts, not personal paths or private install diagnostics.
Commit only the reviewed documentation in the active branch and exact-one main
FF. No push, keys, paid calls, production action or consumed approval replay.

Recovery rule: if the sole gate exposes a missing isolated prerequisite, retain
the failure, install only the locked workspace/recorded gitlink needed, and rerun
only the affected checks plus previously short-circuited stages. Document any
bootstrap correction. Do not rerun the entire gate or recast the first attempt
as successful.
