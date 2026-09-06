# H12a — canonical CLI JSON for generated previews

After H11 `eb57aff` and its documentation correction `348dec1`. Root-only,
single sequential max4 test gate; no fan-out, network proof, keys, spending or push.
This is the first small H12 dependency, not a completed web wizard.

The complete literal H12 plan was read. Current directory publishing already
supports one JSON object, but MCP/OpenAPI introspection explicitly refuses --json
and prints only names/prices. A web parser cannot manufacture missing public/private
projections or honestly label these generated paths as already written.

The [B9 mismatch record](../2026-09-04-B-publish-adapters/plan-h-preview-contract-mismatch.md)
explicitly defers this resolution to H: define source discovery/selection and a
contract, or scope the wizard to directories. H12a chooses the former, preserving
the singular directory shape and all unrelated interfaces. This is a documented
integration deviation from the original collision note that H would only spawn
the CLI; B is already merged and no other task owns this CLI edit concurrently.

Own a small runner publish-preview helper, CLI wiring, existing CLI tests plus a
focused helper test if useful, and these execution records. No web route, runner
execution adapter, manifest schema, transport, generated writer or auth policy
changes. Reuse the actual publishability gate and toPublicListing in one canonical
helper for existing directory and new generated outputs. Directory JSON keeps its
existing shape; human output and explicit --yes generation keep their behavior.

Generated --json is preview-only: version1, kind generated, source adapter,
written false, caller target, entries of canonical per-manifest previews, and
structured skipped MCP names/reasons. Hypothetical output paths are marked as
unwritten, never implied runnable. Reject --json with --yes/--force or duplicate
--json before discovery, document reads, output or writes. Application flags stop
at --; literal server argv remain private and unchanged. Whole-batch validity and
duplicate IDs must pass before any JSON output. Do not execute discovered tools.

Prewrite real behavioral CLI tests before changing its implementation. Preserve
existing directory/human/write tests, add actual bounded no-env CLI subprocess
proof on the checked-in local OpenAPI fixture, and synthetic MCP discovery tests.
No live remote introspection or owner configuration. Check strict types, retained
source pins and docs, one full sequential gate, then an atomic local commit.

H12b still needs an explicit local-only browser/process boundary, platform refusal,
loopback binding and same-origin protection, contained targets, bounded output and
deadline/cleanup, fixed errors, passive hosted explanation and actual-route native
verification. Empty tool grants do not prove no network for MCP/OpenAPI/script.
The old prose-parser/sample spawn path cannot be treated as secure implementation.
