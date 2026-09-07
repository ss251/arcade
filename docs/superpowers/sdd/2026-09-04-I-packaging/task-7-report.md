# I7 human-voice narration checkpoint

[Eight draft beats](../../../narration/ethonline-2026/README.md) and a
[read-only word checker](../../../../scripts/narration-budget.sh) are implemented.
No recorded voice, captions, takes or finished video exist from this task.
The intended caption text is verbatim narration; actual shot matching and
timing remain I8/I9/I10 prerequisites, with the owner providing human voice.

The checker requires exactly the eight numbered files, rejects missing/extra,
empty, oversized or symlinked inputs, and allows an optional fixture directory.
It emits counts only, not file contents or personal paths. No network, model,
wallet, secret read or synthesis. Whitespace word counts are a planning proxy,
not a linguistic tokenizer or actual audio measurement.

Actual initial invocation refused `narration_directory_invalid`. Seven native
fixture tests passed while the real-script test failed before the new text
existed. After writing it,8 tests/20 assertions passed in0.387s. The test caller
runs from a temporary directory, proving lookup is script-relative. Counts:

| Beat | Words | Budget | Window seconds |
|---|---:|---:|---:|
| 1 | 57 | 75 | 30 |
| 2 | 41 | 55 | 22 |
| 3 | 89 | 112 | 45 |
| 4 | 44 | 57 | 23 |
| 5 | 65 | 80 | 32 |
| 6 | 41 | 50 | 20 |
| 7 | 46 | 57 | 23 |
| 8 | 61 | 75 | 30 |

Total444 words in a225-second planned window. Shorten wording if natural
delivery overruns; never speed up the voice. The source-plan's universal-refund,
paid Graph/mined Gateway, trustless completeness and mainnet-date claims were
not copied. The new drafts label retained/offline proof and current pauses.
The old non-recursive TTS script and original media files are unchanged.

- Final strict/shell syntax: one-root TypeScript check0 diagnostics; `bash -n`
  passed. The checker is executable and its direct read-only invocation passed.
- Sole54073 full gate passed:5327 Vitest/242 files in70.10s;1413 Bun/96
  files,11898 assertions in195.21s; root/web strict and client/SSR335/167ms.
- Scope audit:15 paths,17 new local links, empty index, no privacy heuristic
  matches. After the gate, only three result records and the narration README's
  A9 link changed: it now cites the runbook's verified live milestone rather
  than an earlier pending report. Eight beat texts, checker, test and brief
  remained at their frozen hashes. Atomic local commit/exact-one main FF follows.

No application behavior, payment constants/caps/replay protection or live
authorization changed. Owner check-in posting, capture/voice, current production
deployment/ENS re-point, paused live integrations, push/submission/mainnet remain.
