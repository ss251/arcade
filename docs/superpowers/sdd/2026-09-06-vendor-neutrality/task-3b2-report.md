# Task 3B2 — CLI plugin ingestion checkpoint

Base b2cd4d7. The CLI recognizes plugin directories and expands selected Agent
Skills / supported MCP tools into separate local listing candidates. This
checkpoint does **not** claim the pinned Circle fixture or any live paid listing;
those follow separately.

Existing arcade.json directories retain their singular public/private preview
contract, including beside an invalid plugin.json. Local plugin directories with
a .json suffix are recognized by filesystem kind; MCP/remote document routing
remains explicit. New --skill/--server selectors restrict the component kinds;
missing/ambiguous selectors fail before discovery. --json is write-free and
cannot combine with --yes; plugin generation refuses --force.

Generation uses stable plugin/component identity hashes, the existing fixed-tool
MCP adapter, canonical public projection, least-privilege skill manifests and the
exclusive nested writer. Public description clipping never changes SKILL.md.
Source frontmatter does not grant tools, credentials or model choices. Generic
contracts and provider configuration require seller review before serving.

MCP discovery is sequential, capped at eight server starts and no starts after
90 seconds, reusing the existing per-server30-second/20-page/1,000-tool limits.
No discovered tool is called. Server-declared read-only tools are the default;
write inclusion is explicit. Bad servers/tools/skill files are separately
reported without erasing valid siblings. Final ID/resource collisions fail the
whole batch before preview/write. An empty unsupported JSON batch is honest:
hasListings:false, not a claim that an endpoint is ready or serving.

The writer's pure batch preflight/snapshot is shared with dry runs. Existing
MCP/OpenAPI writer semantics, engine behavior, public schema, payment code and
lockfiles remain unchanged. CLI generation does not start a daemon or publish
to production. See the [operator guide](../../../agent-plugins.md).

## Verification before the sole full gate

- Genuine native CLI Red: a selected plugin-directory JSON preview exited1 with
  the ordinary directory-option refusal before the new branch existed.
- First native CLI/writer run:50 passes. Actual Bun subprocesses exercise
  preview-only JSON, --yes self-contained output, singular read-back, seller edit
  protection, option refusals and actual MCP SDK initialize/tools-list behavior
  against an offline fetch fixture. No tools/call occurred.
- Expanded first run:141 passes/one incorrect privacy assertion. The assertion
  wrongly prohibited a tool's intentionally public service name/description;
  corrected it to test endpoint/private-field exclusion using the real core
  projection. Also repaired an unused test fixture filename typo.
- Five-root strict0. Final focused run:197 tests/seven files/11.10s, including
  existing publisher, loader, file writer and wording contracts. Covers
  selection/collision/Unicode/budget guards, server/tool failure isolation,
  no frontmatter authority, finite sequential discovery and all-unsupported
  reports without writes.
- Root self-review only; no agents, concurrent independent reviews, credentials,
  real model/MCP requests, paid queries or production changes.

Source freeze and one sequential max4 full gate follow. A separate small
fixture/evidence commit will retain the pinned Circle source and license; its
18-skill checkout and two Plan J paid listings remain separate claims.

## Sole full gate and publication audit

Gate18105 PASS:4,490 Vitest tests/200 files/63.93s;839 Bun tests/55 files/
6,114 assertions/164.36s;root/web strict0;client337ms/SSR165ms. Five frozen
source/test pins,twelve scoped paths,sixteen local links,privacy/diff checks PASS.
AST/text comparison confirms existing direct publisher functions, the writer's
preflight rules and its filesystem-write body are preserved. Core/payment/engine/
lock files remain unchanged. No gate replay or new Forge run. Ready for the CLI
commit/fast-forward; the separate Circle fixture/evidence checkpoint remains next.
