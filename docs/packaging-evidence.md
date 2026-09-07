# Local packaging evidence checker

```sh
sh scripts/packaging-evidence.sh
sh scripts/packaging-evidence.sh --json
sh scripts/packaging-evidence.sh --help
```

The [entry](../scripts/packaging-evidence.ts) is **read-only local preparation**,
not a live test, full gate or submission certificate. It uses the script's
checkout regardless of caller directory. No `.env`, Keychain, model, chain RPC,
payment, browser, upload or package-install operation is invoked. There is no
`--live`, force/accept override, shared temporary log or artifact overwrite.

At this checkpoint default/JSON exits **1 / incomplete**, even if local checks
pass. Circle captured-header verification and owner review are explicitly
`not_checked`, not silently green. Help exits0; invalid arguments exit2 before
work. Creating a file with a plausible name cannot clear those unimplemented
proof gates. Completing them later requires a separately reviewed verifier.

## What it checks

| Check | Actual operation | What a pass does not prove |
|---|---|---|
| Continuity | Re-derive the README's committed snapshot through the existing Git-only checker | Newer excluded commits or actual dashboard registration |
| README | Require the exact seven headings inside one ETHOnline section | Accuracy of every prose claim |
| Private paths | Local Git index lists no internal/handoff files | A complete secret scan of all public content |
| Diagram source | Import the actual Python generator in isolated/no-bytecode mode and produce both scenes/Mermaid in memory; compare with checked files | Fresh browser rendering or pixel-identical cross-browser output |
| Diagram record | Compare all five source hashes and both public PNG hashes to the retained I6 DOM record | Independent provenance or a new visual review |
| Narration | Run the existing exact-eight-file word checker | Human voice or measured duration |
| Shot list | Validate all eight indices, fixed windows and contiguous endpoints, total225s | Real footage or measured cut points |
| Partners | Require one intended row each for Arc/Circle, Graph and ENS | Saved form selections or prize eligibility |
| Video | If the actual export exists, decode/count frames with bounded `ffprobe` and validate metadata | Human narration, semantic truth, privacy or caption quality |

The existing generator now exposes its scene object as a pure function, also
used by its unchanged writing entry. The checker **does not call that writing
entry**. Scene and Mermaid bytes in the checkout remain untouched; no shared
`/tmp/pe.log`, source regeneration in place, test-suite invocation or nested gate.

## Media and resource bounds

Only `design/arcade-ethonline-2026.mp4` is probed; no caller path or URL flag.
The file and its parents inside the checkout must be non-symlinked, the file
regular/single-link and at most2GiB. It remains open read-only while the child
reads the inherited descriptor, avoiding a final-path replacement between the
check and probe. `ffprobe` permits only local `file` protocol and MOV/MP4 demuxing,
uses four decoder threads, a30-second timeout and bounded JSON output. This is
a trusted-local-media check, **not a sandbox for hostile codecs or filesystems**.

Require exactly one video and one audio stream;120–240 seconds,16:9 geometry,
720–2160p,24–60fps and a decoded-frame count within10% of duration × frame rate
(or two frames). Those frame-rate/upper-size limits are our capture-quality
policy, not additional ETHGlobal rules. Audio presence cannot verify that a
human spoke or that speech spans the picture. Reconcile actual audio duration,
captions, privacy and content during I9/I10's end-to-end review.

Text/assets use bounded regular-file reads with no final symlink, hardlink or
traversal acceptance. Git/word/Python children are sequential and time-limited;
their raw errors/output are not dumped on failure. Missing tooling/artifacts
and malformed inputs cannot count as passing. Trusted installed executables
are resolved on PATH; a compromised checkout/toolchain is outside this check.

## Current observed result

Eight local rows pass; the final export is missing; Circle live capture and
owner review remain unchecked. The native wrapper was exercised from outside
the checkout and left the README/diagram bytes unchanged. Tests separately
reject wrong headings, timelines, media metadata and unsafe file aliases.

A separate owned codec fixture exercised the actual descriptor/probe path:
120 seconds,1280×720,24fps,2880 decoded black frames plus silent audio;
152452bytes. It was generated with four-worker limits and removed afterward.
Only its **technical media row** passed; `submissionReady:false` remained.
It is not an ARCADE take, human voice, uploaded video or task-I10 deliverable.
No synthetic fixture media was retained or committed.

See the [submission checklist](submission-checklist.md) for remaining owner and
live prerequisites, and the [I14 record](superpowers/sdd/2026-09-04-I-packaging/task-14-report.md)
for author gates. The source plan's all-green sample is not the current result.
