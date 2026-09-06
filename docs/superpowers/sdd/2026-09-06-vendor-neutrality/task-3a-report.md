# Task 3A — inert plugin loader checkpoint

Base 9fe8196. This is the read-only loader, **not completed CLI ingestion**.
No plugin installation, server connection, model/SDK execution, credential read,
tool call, paid query, wallet action or production publish occurred.

The loader recognizes portable Agent Plugins 1.0.0 root manifests first and the
separate Codex-compatible layout only when no root manifest exists. It retains
valid independent components and emits fixed skip reasons for unsupported
transports, authentication, extensions and connectors. Legacy supplemental
paths and inline MCP descriptors do not replace the default locations. A
duplicate server cannot silently overwrite an earlier definition.

Supported server descriptors are headerless HTTPS Streamable HTTP; stdio,
SSE, auth/env-bearing and unknown config fields, credentials in URLs, URL
queries/fragments and placeholders are refused or reported. No remote schemas
are fetched and no subprocess/SDK is imported by inspection. This is an
explicit subset, not full Agent Plugins or Codex client conformance.

Filesystem reads reject links (including in-root links), hard-linked metadata,
nonregular files, escaping paths and malformed UTF-8. Limits are 256 KiB JSON,
512 KiB per SKILL.md, 8 MiB retained skill text, 128 directory children and 64
server entries. Reads use bounded buffers, no-follow/nonblocking opens, inode
checks and repeated containment checks. These checks reduce substitution risk;
they are not a claim of an operating-system sandbox against a concurrent writer.
Only immediate skill folders are discovered; reference contents are not read in
this checkpoint. Safe self-contained copying remains the next commit's work.

The existing flat SKILL.md parser moved verbatim into a dependency-free module;
the old engine reexports the same function and type. Existing skill execution,
secrets, models, capabilities, public projection, payment code and CLI behavior
remain unchanged. Source bodies and paths in loader descriptors are local-only,
not public listing data. Frontmatter is never converted into execution authority.

## Verification

- First new-suite run failed at collection because the loader module did not yet
  exist. This was an implementation-absence check, not executed behavioral Reds.
- First implementation run passed 49 loader tests. An incorrectly named existing
  test filter matched no extra file; no existing-parser coverage was claimed.
- Inspection found and corrected a mechanical extraction mistake (the engine's
  missing-file helper had moved with the parser) before existing-engine checks.
- Four-root strict check passed with zero diagnostics.
- Expanded final focused run: 104 tests in five files, 4.21 seconds. Includes 54
  loader cases and existing skill/parser, harness and offline wording regressions.
  Covers component isolation, invalid metadata, portable precedence, legacy
  supplemental paths/inline servers, no env/config authority, URL refusals,
  symlink/hard-link boundaries, byte/count caps and malformed UTF-8.
- Self-review only; no agents or parallel independent review. One sequential full
  gate follows on frozen source, at the owner's four-worker limits.

## Remaining Task 3 work

Wire preview/generation into the CLI without changing singular arcade.json
behavior; preserve nested skill references and preflight all generated targets;
reuse fixed-tool MCP discovery with per-server failure isolation and privacy
tests. Add the pinned Circle compatibility fixture and document honest scope.
The full Circle inventory and two live listings belong to Plan J evidence, not
to this inert fixture. See the [task brief](task-3-brief.md).

## Sole full gate and scope audit

Gate56532 PASS on frozen source: 4,422 Vitest tests in 197 files (61.15s),
839 Bun tests in 55 files with 6,116 assertions (163.67s), root/web strict0,
client build356ms and SSR185ms. No full gate repeated. Eight source/fixture
SHA-256 pins remained unchanged; all12 scoped paths, verbatim parser move,
unchanged CLI/payments/public projection/lockfiles, privacy and diff checks PASS.
No new contract code or Forge run. The compatibility fixture is not represented
as a plugin installed into Codex, and no personal marketplace was modified.
