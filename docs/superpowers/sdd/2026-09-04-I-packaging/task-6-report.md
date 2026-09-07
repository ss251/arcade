# I6 architecture checkpoint

## Implemented

[Generator](../../../../scripts/diagram.py), [Mermaid companion](../../../architecture.mmd),
[light](../../../architecture.png)/[dark](../../../architecture-dark.png) overviews,
[owned export helper](../../../../scripts/render-diagram.ts) and
[reproduction guide](../../../diagram-rendering.md). The source plan predates J;
the wider59-element scene includes its rails/funding and their explicit live
limits. Colors retain the repository's role palettes; muted text contrast is
increased. No application behavior or payment authorization policy changed.

Stable SHA-256 seeds replace Python's process hash. Signed displacement fixes
left-arrow labels. Stale ID-only text-width caching is removed; conservative
container-fit checks supplement, not replace, visual inspection. Scene parity,
independent hash seeds, generated artifacts, Mermaid node prefixes and label
bindings are tested. No meaningless seed-only baseline commit was made.

## Actual rendering and scope

[Scrubbed hash record](../../../evidence/I/diagram-render.json) pins the existing
offline renderer and five source inputs. Real Excalidraw export + SVG decode
produced2000×1503 overview PNGs. Both were visually inspected for text, contrast,
container fit and direction. All three Mermaid sources rendered with strict
security in a real DOM. Their natural layouts are technical references requiring
zoom, not video-ready wide-flow frames. Intermediate SVG/PNG references remain
local; only the two overview PNGs enter docs. No cross-browser raster-byte
determinism is claimed. The checked-in scene generator is deterministic.

Two owned browser failures preceded success and remain disclosed: control
insertion matched a bundled closing-body string; then Mermaid rejected the
generated graph node's reserved name. Both were corrected (final document
boundary; prefixed node IDs). No bundle modification, sanitizer bypass, remote
renderer download or shared-browser use. The final native page reported all
five pairs saved, then stopped. All three exact process IDs were independently
absent, all three ports refused connections and all owned tabs closed.

The helper is inert on import; explicit startup checks the installed HTML pin,
binds only loopback, creates fresh outputs and has a ten-minute fuse. Saving
requires same-origin POST/token, closed names, bounded body and create-only
files. Transport/header checks do not purport to decode arbitrary uploaded
images; this is a trusted repository-input exporter, not a public service.
No wallet/model keys, chain RPC, live transaction or consumed approval replay.
The legacy Python renderer, old narration and assembler remain untouched.

## Verification

Initial two regression tests failed on the inherited generator as expected.
Focused source/renderer tests and three-root strict check passed before the
last generated-artifact assertions. Final focused count, sole full gate and
scope/hash audit are recorded below before commit.

- Final focused tests:11 Bun tests/104 assertions across2 files passed in1.192s;
  three-root strict check reported0 diagnostics.
- Sole94610 full gate passed:5327 Vitest/242 files in69.17s;1405 Bun/95
  files,11880 assertions in194.42s; root/web strict and client/SSR350/169ms.
- Scope audit:17 files,22 new local links, empty index and no privacy heuristic
  matches. Immutable source/artifact pins checked again after result annotations;
  then one atomic commit and exact-one main fast-forward, without a gate rerun.

I2/I3/J4 and J5 live remain paused; escrow has no deployment and its size/treasury
prerequisites remain. I6 does not close owner video/visual acceptance, ENS
production re-point, paid Graph proof, GitHub push or submission/mainnet gates.
