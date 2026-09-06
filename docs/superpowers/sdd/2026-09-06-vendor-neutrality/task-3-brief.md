# Task 3 — Agent Plugins ingestion

Owner-approved vendor task, with the Circle fixture specified by PlanJ. Base
9fe8196. Root-only, four-worker limits, one sequential full gate per commit.
No plugin installation, personal marketplace modification, model execution,
credential read, paid call or production publish during loader development.

## Primary-source preflight

The published Agent Plugins1.0.0 spec and both schemas were read completely at
agentplugins/agent-plugins-spec commitff8ab5e392cc87bd88d87c060815a87490e51003:
[spec](https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md).
Use local validation rules; never fetch a schema because a package asks for it.
Version1.1 is not selected merely because a file with that name exists upstream.

Portable plugins require root plugin.json with the exact1.0.0 schema identifier
and a valid name; fixed components are skills/ and mcp.json. Unknown manifest
fields and unsupported extensions are reported/ignored without interpreting
their contents. Other invalid metadata rejects the plugin. Independent component
failures must not hide valid skills or servers. Filesystem-resolved paths must
stay under the plugin root, with narrow component-level failure boundaries.

Circle uses a distinct Codex-compatible layout, not the portable core manifest:
.codex-plugin/plugin.json, skills/ and .mcp.json. Pinned Circle master revision
26dc09ea0746a038c969c6f197feee1267f834b5 has manifestversion1.4.0, Apache-2.0,
**18** immediate skill folders (not the16 in the earlier PlanJ probe), and one
headerless remote MCP server at https://api.circle.com/v1/codegen/mcp. Preserve
the revision/count distinction; do not relabel it as a conformant portable plugin.
[Pinned source](https://github.com/circlefin/skills/tree/26dc09ea0746a038c969c6f197feee1267f834b5/plugins/circle).

The plugin-creator skill's schema guidance applies only to the compatibility
fixture; its personal marketplace/install flow is outside this task. A portable
fixture uses the standard's root manifest, not a Codex scaffold. The existing
flat Agent Skill parser remains a documented subset, not full YAML/spec validation.

## Commit A — inert, bounded loader

Recognize the portable core first; an invalid root manifest cannot fall through
to a legacy manifest. Recognize .codex-plugin/plugin.json separately when no root
manifest exists. Validate bounded JSON, metadata, paths and immediate skill
children, using the existing parseSkillMd contract. Reject/skip unsafe symlinks,
wrong filesystem kinds, oversized data and invalid skill entries with fixed
diagnostics. Do not recursively discover nested skills, execute scripts, expand
environment variables, read credentials, contact servers or write generated files.

Return local-only descriptors, explicitly keeping full skill bodies and paths
out of any eventual public listing projection. Preserve independent good
components when another fails; report unsupported component/transport/auth kinds.
Initially support headerless HTTPS Streamable HTTP descriptors, including Circle's
equivalent legacy URL-only shape. Plugin stdio requires PLUGIN_ROOT/PLUGIN_DATA,
persistent data and cwd/expansion semantics not represented by the current adapter;
report it as unsupported rather than silently executing it with different semantics.
Likewise report legacy SSE, HTTP-only endpoints, query-bearing URLs, literal
headers/auth configuration and unimplemented extensions. Direct existing MCP
publishing is unchanged. No blanket claim of full Agent Plugins client conformance.

Use deterministic filesystem fixtures for both formats and failure boundaries.
Tests must prove no network/subprocess/env lookup occurs in this loader. Then
one bounded full gate and an atomic loader commit with this brief/report/ledger.
CLI behavior remains unchanged at this intermediate checkpoint.

## Commit B — preview and generation

Execution split after the loader checkpoint: B1 isolates bounded source snapshots
and exclusive nested file generation; B2 wires the CLI/adapters and pinned Circle
fixture. Each is an atomic checkpoint with its own single sequential full gate.

Wire arcade publish <plugin-dir> into existing adapters and public/private
projection. Preserve singular directory behavior for directories with arcade.json.
Preview by default; --json stays write-free; --yes is explicit local generation.
Copy a bounded, self-contained skill folder without following escapes, including
needed references; never overwrite unrelated seller edits. Preflight the complete
selected destination set before any write. Keep existing MCP/OpenAPI writer and
their contracts unchanged unless a narrowly tested extension is necessary.

Use existing MCP discovery and read-only tool filtering for supported server
descriptors; generate one fixed-tool listing per eligible tool, not an unrestricted
server endpoint. A failed server cannot erase valid skill listings. Do not call
discovered tools, authenticate automatically, execute bundled plugin commands,
install dependencies, or infer model tools from SKILL.md frontmatter. Generated
skills start with no model capabilities and need seller review of generic input/
output contracts and explicit credential configuration before serving.

Report every skipped/unsupported component and prevent namespace/id collisions.
Add actual CLI preview/generation/read-back tests, source containment and privacy
regressions, and a pinned Circle fixture/read-only discovery checkpoint. Retain
Apache attribution for copied fixture content. A full18-skill inventory and the
two PlanJ live listings are separate evidence, not implied by a small fixture.
Run one full gate for this commit, merge promptly without squash/push, and record
any remaining live PlanJ task separately.
