# Agent Plugins ingestion

`arcade publish <plugin-dir>` expands a plugin's Agent Skills and supported MCP
tools into separate local listings. It does not install a plugin, configure a
personal marketplace, start a runner, register listings at a hub or pay a service.

Portable [Agent Plugins 1.0.0](https://agent-plugins.org/) uses root `plugin.json`
with the exact versioned schema, fixed `skills/` and `mcp.json` locations.
ARCADE also recognizes the separate `.codex-plugin/plugin.json` compatibility
layout, including Circle's `skills/` and `.mcp.json` paths. This does not turn a
Codex-format manifest into a conformant portable manifest. Invalid portable
manifests never fall back to the compatibility format. An existing `arcade.json`
keeps the ordinary single-listing path, even beside a plugin manifest.

## Preview and generate

```bash
# Select an Agent Skill without contacting any bundled MCP server.
arcade publish ./plugin --skill summarize --json --out ./generated

# Explicitly write to new listing directories after reviewing the preview.
arcade publish ./plugin --skill summarize --price '$0.02' --yes --out ./generated

# Discover a selected supported MCP server; no tool is executed.
arcade publish ./plugin --server docs --json --out ./generated
```

Without selectors, all supported components are considered. Repeat `--skill`
and `--server` to select a subset; selecting either kind excludes the other kind
unless it is also selected. Skill selectors are immediate folder names, or
plugin-relative directory paths when folder names are ambiguous. Use direct
`mcp://` publishing when you need its existing `--tool` selector.

Default behavior previews only. `--json` emits one batch with `source:"plugin"`,
the detected format, `written:false`, `hasListings`, entries, skipped reasons
and review warnings; it cannot be combined with `--yes` or `--force`. Each entry
uses the existing public/private projection and adds local relative file names.
Keep the complete preview local; only its `public` object is the hub payload.

A preview may contact supported remote MCP servers to inspect tool metadata.
`--skill`-only selection does not. `hasListings` means generation candidates
exist—not that credentials are configured, a runner is serving, or a paid call
has succeeded. An all-unsupported JSON preview has no entries and reports why;
`--yes` refuses an empty batch.

## Supported subset

| Component | Behavior |
| --- | --- |
| Agent Skill | Immediate SKILL.md folders using the existing flat name/description/body parser; nested regular reference/asset files copied locally |
| HTTPS Streamable HTTP MCP | One fixed-tool listing per eligible tool; server-declared read-only tools by default |
| stdio, SSE, HTTP-only MCP | Skipped and reported; bundled commands are never run |
| Literal headers/auth/env, URL credentials/query/fragment, unsupported connectors/extensions | Skipped or reported; never expanded into credentials or executed |

`--include-writes` explicitly includes MCP tools not marked read-only. These
annotations are server claims, not a security audit; discovery never calls a
tool. Discovery is sequential: at most eight servers, no new server starts after
90 seconds, with the existing30-second/20-page/1,000-tool limit per server.
A failed server or unsupported tool does not erase valid sibling listings.
Diagnostics use bounded fixed reasons and zero-based component/tool indexes.

Skill manifests start with no model capabilities or secret declarations, generic
`{input:string}` / `{text:string}` contracts, and a bounded inference budget.
Frontmatter never grants tools or sets a model. Review contracts, provider/model
configuration, capabilities and third-party licensing before serving; generated
metadata cannot infer those choices safely. The existing `skill` adapter uses
its current Agent SDK runtime; the [Chat Completions engine](openai-api.md) can
run the same folder after explicit private configuration. Reading copied
references requires an appropriate explicit capability.

## Files and identity

Listing IDs contain a readable plugin/component prefix plus a stable identity
hash, independent of checkout location. Final collisions fail closed. File
snapshots preserve nested text/binary content, but not empty directory-only
structure. Hidden/nonportable paths, links/hard links, changed SKILL.md bytes and
a conflicting source arcade.json are refused—not silently omitted.

Reads and output are bounded:2 MiB/file,16 MiB/tree,32 MiB/batch,512 nodes/tree,
4,096 output nodes/batch,depth8,256 listings. Manifest inspection has its own
256 KiB JSON/512 KiB SKILL.md/8 MiB retained-text limits.

Every generated listing directory must be new, even if an existing one is empty.
Plugin generation has no `--force` mode; existing MCP/OpenAPI generator behavior
is unchanged. The complete selected batch is preflighted before writing.
Validation errors write nothing; a later disk failure or filesystem race may
leave partial new files, reported explicitly. No automatic retry, overwrite or
cleanup deletes seller files. New directories/files use0700/0600. These local
containment checks are not a hostile-concurrent-writer OS sandbox.

## Evidence scope

The CLI and file-generation checkpoints use deterministic offline fixtures,
including native subprocess and actual MCP SDK discovery tests. A pinned Circle
fixture and its read-only discovery checkpoint follow separately. The full
18-skill Circle checkout and the two Plan J paid listings are not claimed by
these offline tests.

