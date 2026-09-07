# Reproducing the architecture diagrams

[The generator](../scripts/diagram.py) owns the labels and geometry for the
[light scene](architecture.excalidraw) and [dark scene](architecture-dark.excalidraw).
It also emits a [Mermaid semantic companion](architecture.mmd) from the same
labels and explicit relationships. The two palettes share geometry. The wider
Mermaid relationships and the detailed [escrow/delegate flows](architecture.md)
are technical references, not video-ready frames at fit-to-window scale.

The README/video overview uses the manually arranged, visually inspected PNGs.
Colors identify roles, not live readiness. The diagram describes implemented
paths; live evidence limits are printed on it. No workflow here runs a wallet,
paid call, deployment or model. It does not make the paused live proofs pass.

## Generate and test (Python3 + repository Bun dependencies)

```sh
python3 scripts/diagram.py
python3 scripts/diagram.py --dark
bun --no-env-file test --max-concurrency=4 scripts/diagram.bun.test.ts scripts/render-diagram.bun.test.ts
```

The source test compares separate Python hash seeds, both palettes, checked-in
artifacts, label bindings and current Mermaid output. Stable SHA-256-derived
seeds replace Python's process-randomized hash. Negative-direction arrows use
signed displacement for label centers. Widths are conservative estimates;
container-fit checks do not substitute for viewing the real render. The old
ID-only `.text-widths.json` is retained but no longer consumed.

## Export in an owned browser page

[The export helper](../scripts/render-diagram.ts) consumes the existing offline
`gstack-diagram-render` HTML bundle. Supply its path explicitly; the helper does
not install, download, modify or rebuild it. Required bytes9645479 and SHA-256:
`da9c363071afbe79e06807bd1e67dbacc1123187db7b99e2608dd4a1a9567e94`.
It bundles Excalidraw0.18.0, Mermaid11.12.2, the official converter1.1.2 and
React18.3.1. If it is absent or mismatched, stop; do not silently fetch another
version or bypass the pin.

```sh
env -i PATH="$PATH" HOME="$HOME" USER="$USER" TMPDIR="$TMPDIR" \
  bun --no-env-file scripts/render-diagram.ts --bundle /explicit/path/to/diagram-render.html
```

The command prints an owned loopback URL, PID and fresh temporary output
directory. Open that URL with the supported in-app browser, wait for `ready`,
then choose **Render all five diagrams**. Excalidraw performs real SVG export;
the browser decodes each SVG into a2000px-wide canvas PNG. Mermaid uses strict
security mode and real DOM rendering, with no DOMPurify shim or sanitizer bypass.
The served copy adjusts the base and inserts controls at the final document
boundary; the installed bundle bytes stay unchanged.

Inspect both overview PNGs for clipping, contrast, arrow direction and factual
meaning. Inspect the three Mermaid exports at a readable zoom; their natural
layouts are not the README overview or a completed video shot. Select **Stop
server**, close the owned tab and independently confirm its PID/port are gone.
The helper stops automatically after ten minutes. Preserve failed outputs as
failed: the manifest marks completeness only when all five pairs were received.

The helper binds only127.0.0.1 on a random port. CSP restricts connections to
the same origin and blocks external assets. Saving requires same-origin POST
plus a per-run token, closed output names, bounded bodies and create-only files
in a fresh owned directory. SVG/PNG validation is a transport/header boundary,
not an independent full image decoder. It is for these trusted repository
inputs, not a public upload service. Nothing automatically overwrites docs.

After successful inspection, verify manifest input/output hashes and copy only
`architecture.png` and `architecture-dark.png` to their explicit docs targets,
first checking that those targets have no unrelated changes. Retain the export
hash manifest in the task evidence. Intermediate SVGs and the three reference
PNGs stay local; a future export may differ with browser/font versions.
Generator scene bytes, unlike cross-browser raster bytes, are deterministic.

The legacy `scripts/render_diagram.py` remains inherited historical tooling.
Do not use its shared browser-harness/excalidraw.com/localStorage workflow for
this submission. Previous assembler and narration files remain untouched.
