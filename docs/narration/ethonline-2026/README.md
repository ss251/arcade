# ETHOnline 2026 human-voice narration draft

Eight beats,225 seconds (3:45). The text is a **draft for the owner to read**, not
recorded audio or evidence that a capture already exists. These lines are also
the intended verbatim caption text. Match actual takes to these words; if a
live prerequisite changes, review both evidence and wording before recording.

The event requires a real human voice,2–4 minutes and at least720p. Do not use
text-to-speech, phone footage, speed-up or the inherited ElevenLabs script.
[Official video rules](https://ethglobal.com/events/ethonline2026/info/details)
were checked read-only on September8 IST. Owner voice, shots, measured in-points,
caption timing and final media verification remain I9/I10 work.

The existing `scripts/narrate.sh` reads only the non-recursive
`docs/narration/beat-*.txt` glob. These new files deliberately live one level
below it; do not modify that script or point it here. Preserve the earlier
hackathon's narration and assembly files unchanged.

## Read-only preflight

```sh
bash scripts/narration-budget.sh
```

The optional sole argument is a beat directory for local checks. The checker
requires exactly `beat-1.txt` through `beat-8.txt`, nonempty regular files, no
symlinked directory/beat, at most8192 bytes each and no extra matching beats.
It counts whitespace-delimited words with `wc`, allowing at most floor(window ×
2.5). This is a150-words-per-minute proxy, **not measured audio duration**.
Shorten the text if the owner's natural delivery overruns; never rush or speed
up a recording. Allow visual pauses within each window. Final duration still
must be measured after captions, holds and transitions have been assembled.

| Beat | Seconds | Max words | Evidence / intended view |
|---|---:|---:|---|
| 1 | 30 | 75 | [Publish and privacy boundaries](../../seller-guide.md), local preview only until capture |
| 2 | 22 | 55 | [Rail-specific guarantees](../../../README.md#guarantees-and-what-is-not-guaranteed); clearly labelled offline schema-failure demonstration |
| 3 | 45 | 112 | [A9 retained lineage proof](../../runbook.md#plan-a--evidence-lineage), not a new paid run |
| 4 | 23 | 57 | [G6 selected indexed match](../../superpowers/sdd/2026-09-04-G-graph/task-6-indexed-match-review.md); Base paid-query proof absent |
| 5 | 32 | 80 | [C10 canary](../../superpowers/sdd/2026-09-04-C-canary/task-10-report.md), [D13 identity](../../superpowers/sdd/2026-09-04-D-erc8004/task-13-report.md), [stopped ENS demo](../../runbook.md#ens-namespaces-sepolia) |
| 6 | 20 | 50 | [Gateway evidence categories](../../evidence/m6-gateway.md), explicitly offline20-call sequence |
| 7 | 23 | 57 | [Web/escrow limits](../../architecture.md), not invented global statistics or a deployed escrow |
| 8 | 30 | 75 | [Continuity](../../CONTINUITY.md), [current diagram](../../architecture.png), [CLI pause](../../interop/circle-cli.md) |

The source plan's sample script predates the measured gaps. This version does
not claim two live model vendors, a mined Gateway batch, paid Graph results,
trustless receipt completeness, universal refunds or an automatic mainnet date.
“Retained” means historical evidence shown with its date and source; “offline”
means actual application code with fixtures, not moved funds. The forthcoming
I8 shot list must keep those labels visible and must not replay spent approvals.
