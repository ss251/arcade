# H12b2 local preview runtime — task brief

2026-09-06 after6bf0831. Root-only, no parallel reviewer. Use existing Vitest and
actual serial Bun child fixtures; one max4 full gate after freezing this chunk.

## Scope and correction
Add the Node-compatible fixed Bun preview launcher, bounded cleanup and trusted
local configuration. Wire actual production Bun and Vite loopback-only options
when ARCADE_PUBLISH_LOCAL=1; refuse known hosting markers. Defaults stay unchanged.
No route/UI is enabled until H12b3 supplies request enforcement and native proof.

The CLI directory path loads sibling manifests. Copy only the selected bounded
arcade.json (or OpenAPI JSON) into a fresh private snapshot preserving its relative
target, and run the real trusted CLI there. No seller code/assets are copied or
executed. Use explicit --out skills for generated previews so the hypothetical
targets do not disclose disposable paths. This is a snapshot preview, not a
claim of validating entry files or the entire directory's execution environment.

Trusted owner environment supplies absolute ARCADE_REPO_ROOT and
ARCADE_PUBLISH_BUN; browser input never selects the executable, root, flags or
credentials. Reject hidden/traversal/symlink file paths, non-regular/multilink
files and oversized input; read only after descriptor checks. Snapshot races
cannot cause the CLI to re-open live paths. This is not an OS sandbox against a
malicious local owner replacing trusted code or racing directory ancestors.

One owning runtime call at a time, fixed argv, empty environment except disposable
HOME/TMPDIR, fixed chain selection and executable-only PATH, --no-env-file and no
shell. Bound stdout1MiB, discarded stderr64KiB, elapsed35s, TERM then exact KILL
and reap. Fail fixed on nonzero, malformed, oversize, timeout or cancellation;
do not expose raw CLI errors. A cleanup that cannot prove child closure must
poison the process-local launcher rather than grant a new overlapping run.

Require actual loopback same-origin request metadata before any filesystem IO.
Bind output target/kind and all generated entry paths to the exact fixed command.
A successful directory/OpenAPI preview writes nothing to the source repository
or owner config; temporary snapshots are removed after owned child closure.

## Tests and evidence
Prewritten tests: disabled/platform/request refusal, real directory/OpenAPI
snapshots and source nonmutation, symlinks/private/special/oversize input, no
ambient env/config, concurrency and pre-abort. Actual child fixtures cover
success, nonzero, partial/bad JSON, output/stderr flood, deadline/abort, ignored
TERM and exact PID closure. Host option and real Vite resolved override tests
cover both entrypoints; native actual app proof remains H12b3.

Preserve Chat, buyer, seller, H12b1 parsing and CLI behavior. Document any fixture
or implementation correction separately from a genuine behavioral Red. No keys,
live MCP discovery, new spending, production env mutation, ENS/mainnet or push.
