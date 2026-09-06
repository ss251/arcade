# Task 3B1 — bounded file generation checkpoint

Base 9ce2986. This is an internal file-generation stage, **not CLI integration**.
No network discovery, plugin installation, execution SDK/model run, credential
read, payment, source edit or production publish occurred.

The source collector reuses the loader's contained regular-file reads, preserving
nested references and binary assets as byte snapshots. It refuses hidden or
nonportable path names, links/hard links, a conflicting root arcade.json, changed
SKILL.md bytes, and excessive size/depth/count. It does not silently drop an
unsafe referenced file and claim a self-contained result. Empty directory-only
structure is not retained. It does not infer tools, credentials or capabilities
from any file; copying files alone does not make a skill ready to serve.

Limits: 2 MiB/file, 16 MiB/skill tree, 32 MiB/batch, 256 KiB/manifest, 512
source/output nodes per tree, 4,096 output nodes/batch, depth8, 256 listings.
Byte snapshots retain only actual content, not an entire limit-sized read buffer.
Existing manifest/UTF-8 loader behavior is unchanged.

The separate writer validates the whole manifest/path/byte/count/destination set
before any filesystem write. It snapshots mutable caller data before the first
await, refuses case-folded/path-prefix collisions and output inside the source,
and requires every listing directory to be new—even an existing empty directory
is refused. There is no overwrite/force mode. New directories/files use0700/0600,
with exclusive creation and repeated ancestor checks. Existing MCP/OpenAPI
generation and singular listing previews are untouched.

Validation failures write nothing. A later disk failure or concurrent destination
change can leave partial **new** output; errors say so, never retry automatically,
never delete those files or seller edits, and do not echo raw exceptions. Like
the existing local generator, repeated containment checks are not an OS sandbox
against a hostile concurrent filesystem writer.

## Verification before the sole full gate

- Initial new-suite check failed at collection because the writer module was
  absent; no executed behavioral Red is claimed.
- First implementation:86 loader/writer tests passed;four-root strict0.
- Review corrected a byte-cap fixture that was reaching an earlier missing-entry
  guard, then added disk-failure, mutable-caller-data, aggregate node and zero-byte
  file cases. The final bounded focused run passed255 tests in four files.
- Existing generator and skill/parser regressions are included. Disk fault
  injection proves seller notes remain unchanged and the error reports possible
  partial new output without its private cause.
- Self-review only, root-only/max4; no agents or concurrent independent review.
  Source freeze and one sequential full gate follow.

Next: CLI recognition, dry-run JSON, opt-in generation, fixed-tool MCP expansion,
selection/privacy tests and the pinned Circle fixture. The two Plan J live
listings are separate evidence. See the [task brief](task-3-brief.md).

## Sole full gate and publication audit

Gate97468 PASS:4,458 Vitest tests/198 files/63.55s;839 Bun tests/55 files/
6,114 assertions/163.86s;root/web strict0;client377ms/SSR207ms. Three frozen
source/test SHA-256 pins,seven scoped paths,twelve local links,unchanged existing
adapters/CLI/payment/projection/locks,privacy and diff-check PASS. No gate replay,
contract edit or new Forge run. Ready for the atomic file-generation checkpoint;
CLI ingestion and the Circle fixture are still next, not silently marked done.
