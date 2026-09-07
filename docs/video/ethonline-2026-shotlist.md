# ETHOnline 2026 — evidence-qualified shot list

Draft capture plan, September 8, 2026 IST. Eight windows total **225 seconds
(3:45)**, matching the [human narration](../narration/ethonline-2026/README.md).
No takes, voice clips, measured in-points or final video were created by I8.
Target export: 1920×1080, normal speed, human voice, no phone footage or TTS.
The [official rules](https://ethglobal.com/events/ethonline2026/info/details)
require 2–4 minutes and at least 720p; they were checked September 8 IST.

This supersedes the source plan's executable sample, not its historical text.
All commands below prepare **content**, not a desktop recording. They never
authorize a new paid run. Keep each evidence label visible for its whole shot.
If a command or retained record changes, stop and review the claim before filming.

## Timeline and evidence labels

| # | Window | In → out | Take basename | On-screen content and mandatory qualification |
|---|---:|---|---|---|
| 1 | 30s | 0:00 → 0:30 | `b1-publish` | **LOCAL PREVIEW — NOT PUBLISHED**. Public metadata/schema/price only; explain that private execution configuration stays with the seller. No MCP server launch. |
| 2 | 22s | 0:30 → 0:52 | `b2-failed` | **IMPLEMENTED GUARANTEES / OFFLINE TESTS**. Show the documented schema gate and uncertainty boundary. No invented receipt row or identical live wallet balances. |
| 3 | 45s | 0:52 → 1:37 | `b3-hire` | **RETAINED ARC TESTNET — SEP 5**. A9's three distinct settlements, recorded tree hash and cycle refusal. No new hire; the hash commits hub-recorded lineage, not every possible action. |
| 4 | 23s | 1:37 → 2:00 | `b4-graph` | **RETAINED STUDIO MATCH — SEP 6**. Selected A9 events at the pinned deployment. **BASE PAID QUERY NOT RUN**; no paid-query receipt or complete global statistics. |
| 5 | 32s | 2:00 → 2:32 | `b5-trust` | **RETAINED CANARY / IDENTITY / ENS — SEP 5**. Dated C10, D13 and ENS milestones. Temporary URLs served only during that run and stopped after cleanup; production re-point remains pending. |
| 6 | 20s | 2:32 → 2:52 | `b6-session` | **RETAINED OFFLINE 20-CALL PROOF — NO FUNDS MOVED**. Twenty real application executions with fixture external services. Separate F1 deposit/payment acceptance from absent mined-batch/available-credit proof. |
| 7 | 23s | 2:52 → 3:15 | `b7-economy` | **RECORDED UI LIMITS / SYNTHETIC ESCROW**. Unavailable is not zero; a Gateway UUID is not a mined transaction. Escrow rendering is tested, deployment/live funding remain blocked. |
| 8 | 30s | 3:15 → 3:45 | `b8-continuity` | **PINNED GIT SNAPSHOT / LOCAL MAINNET REFUSAL**. Prior vs new work, current architecture and owner-controlled mainnet checkpoint. J4 remains paused with unchanged bounds. |

I9's intended take paths are `design/takes/ethonline-2026/<basename>.mp4`.
Owner source audio is one human-read clip per `beat-1` through `beat-8`; preserve
original recordings. I10's normalized media contract and cut are not implemented
yet. These windows are editorial targets, **not measured media durations**.

## Recording checkpoint — do not run the legacy recorder

The inherited [recorder](../../scripts/demo/rec.sh) captures avfoundation
display 0 with a fixed crop, uses `ffmpeg -y`, and does not fail its low-frame-rate
diagnostic. It is not a selected-window privacy boundary and can overwrite a
named take. On this shared Mac, do not invoke it unchanged. No substitute
screen-recorder command has been approved or tested for this capture region.

Before I9: select and inspect a dedicated terminal/browser recording region,
hide personal paths, shell history, notifications, account UI and unrelated
windows, and confirm the owner wants that region recorded. Use a fresh,
non-existing take destination, never overwrite existing media. Record a short
privacy/frame-rate probe, inspect the actual decoded frames, then freeze the
exact device/region/dimensions and self-stopping recorder command here. This
is the remaining I8 capture-command prerequisite; content preparation is ready.

Do not show handoff files, private journals, raw authorization headers, private
publish JSON, Keychain UI or Studio keys. Only the public projections/documents
below belong on tape. The committed diagrams are 2000×1503 references; frame
or pan them legibly without stretching into 16:9 or claiming every label fits.
No synthetic UI should be passed off as a live marketplace.

## Content commands, from the repository root

Use an inspected clean terminal. These commands are for the existing installed
workspace, not dependency installation or proof of a fresh clone. The native
preview may create Bun runtime caches in its new temporary home; it does not
publish. Do not add `--yes`, `--force`, a remote plugin/MCP URL or credentials.
The child environment excludes owner secrets and the real runner home. Only
its public projection is displayed; the full preview stays in process memory.

### Beat 1 — local public preview

```sh
env -i PATH="$PATH" bun --no-env-file -e '
import {execFileSync} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const home=mkdtempSync(join(tmpdir(),"arcade-video-preview-"));
const raw=execFileSync(process.execPath,["--no-env-file","--no-install",
  "packages/runner/src/cli.ts","publish","skills/diff-triage","--json"],
  {env:{PATH:process.env.PATH,HOME:home},encoding:"utf8",timeout:15000,
   maxBuffer:524288,stdio:["ignore","pipe","pipe"]});
const p=JSON.parse(raw);
if(p.skillId!=="diff-triage"||!p.public) throw Error("preview unavailable");
console.log("LOCAL PREVIEW — NOT PUBLISHED");
console.log(JSON.stringify(p.public,null,2));
'
```

Leave the owned temporary cache for ordinary later cleanup; do not issue a
broad recursive deletion. The [seller guide](../seller-guide.md) explains
Agent Skill, MCP and OpenAPI adapters. Showing the preview does not execute a
model or prove a paid listing. Do not film the CLI's non-JSON “PUBLISHED” heading
as evidence that a preview submitted anything.

### Beat 2 — documented failure boundary

```sh
sed -n '/^### Guarantees, and what is not guaranteed/,/^### Mainnet/p' README.md
```

Label this a documentation view backed by offline tests, not a fresh failure
transaction. The [pipeline tests](../../apps/hub/test/pipeline.test.ts) are
source evidence. If I9 needs a visible actual fixture failure, prepare and verify
a separate labelled fixture view first; do not invent balance observations.

### Beat 3 — retained three-hop proof

```sh
sed -n '43,62p' docs/runbook.md
```

Show the dated **live milestone**, not only the earlier pending paragraph.
A9 recorded $0.30/$0.05/$0.01 transactions at 2026-09-05T04:38:07.372Z;
root descendant commitment was 60000 atomic USDC. Do not execute the historical
commands printed in the runbook. By-name hiring is the separate ENS milestone,
not a new combined A9/ENS run. [Current A9 record](../runbook.md#plan-a--evidence-lineage).

### Beat 4 — retained Graph match, not paid cost-of-goods

```sh
sed -n '1,89p' docs/superpowers/sdd/2026-09-04-G-graph/task-6-indexed-match-review.md
```

The selected query was recorded 2026-09-06T05:07:47.534Z. Keep the fixed CID,
selected-source scope and unavailable marketplace data visible. The
[G15 readiness record](../superpowers/sdd/2026-09-04-G-graph/task-15-readiness.md)
explains why the paid Base evidence run is not ready. No previous paid result
exists to substitute. The owner's limited Base budget is not permission to run
an unjournaled demo or fund a new Arc purchase.

### Beat 5 — retained health, identity and stopped ENS demo

```sh
rg -n -A18 '2026-09-05T04:40:08.403Z|2026-09-05T04:42:24.773Z|owner-approved isolated demo passed' docs/runbook.md
```

Use three readable views if needed, with measured edit points later. Do not
replay canary purchases, registration, renewal, price changes or role grants.
The [ENS record](../runbook.md#ens-namespaces-sepolia) includes independent
post-cleanup on-chain checks and owner update authority; it is not a current
production URL or current availability claim. Expiry alone is not health proof.

### Beat 6 — retained offline session evidence

```sh
sed -n '117,175p' docs/evidence/m6-gateway.md
```

This is a retained report, not a newly filmed twenty-call run. A later explicitly
labelled offline capture can use its documented harness only after reviewing
its owned-loopback/process requirements; do not run it during another gate.
Twenty fixture transfer UUIDs cannot be captioned “one mined batch.” The
[F1 record](../evidence/m6-gateway.md) separately describes a consumed deposit
and accepted payment; recipient available credit remains unproved.

### Beat 7 — qualified UI and escrow observations

```sh
sed -n '1,100p' docs/evidence/J/public-escrow-browser.md
sed -n '1,100p' docs/evidence/J/declared-rails-browser.md
```

These are retained synthetic UI observations, not screenshots or current server
state. For a real UI take, I9 must recreate an owned, labelled fixture, inspect
the actual screen and stop its exact processes afterward. Existing public
production is not evidence that today's local main is deployed. Do not open
live wallets or manufacture global counts/margin totals to fill this window.

### Beat 8 — pinned continuity and pending-mainnet refusal

```sh
env -i PATH="$PATH" bun --no-env-file scripts/continuity.ts --check
env -i PATH="$PATH" bun --no-env-file scripts/continuity.ts --revision be98d15579f8e79ca0b64c0c1bd0232b83ffdc53
env -i PATH="$PATH" bun --no-env-file -e '
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
if(JSON.parse(readFileSync("config/chains/arc-mainnet.json","utf8")).status!=="pending")
  throw Error("STOP: mainnet manifest changed");
try {
  execFileSync(process.execPath,["--no-env-file","scripts/chain-check.ts",
    "--network","arc-mainnet"],{env:{PATH:process.env.PATH},encoding:"utf8",
    timeout:10000,stdio:["ignore","pipe","pipe"]});
  throw Error("unexpected_success");
} catch(e) {
  if(e.status!==1||!String(e.stderr).includes("pending")) throw Error("unexpected_refusal");
  console.log("EXPECTED LOCAL REFUSAL — NO MAINNET CONNECTION");
  console.log(String(e.stderr).trim());
}
'
```

Inspect [the current diagram](../architecture.png) separately at a readable
zoom. The snapshot is deliberately pinned; later commits are excluded, not
missing work. No `--write` is needed for this shot. The
[mainnet runbook](../mainnet-runbook.md) is an owner-controlled future checklist,
not something to execute on tape. A pending-manifest refusal is local and
does not establish current mainnet readiness.

## I9 / I10 measured acceptance, still pending

- Owner approves the privacy-safe capture region and supplies eight human voice
  clips. No TTS or phone substitute, and no speeding footage/audio to fit.
- Record each take longer than its window. Use `ffprobe` to measure decoded
  frames, actual dimensions, frame rate and duration; inspect beginning, middle
  and end frames for privacy, blank frames and legibility. Exit 0 alone is not
  enough. A fixed 1864×1080 crop is not itself a 16:9 final export.
- Example read-only inspection, after the named take actually exists:
  `ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height,avg_frame_rate:format=duration -of json design/takes/ethonline-2026/b3-hire.mp4`.
- Record a SHA256 per take and voice source, actual subject-appearance time,
  selected in/out points and reviewer acceptance. All are **UNMEASURED** now;
  no zero-valued placeholder may be presented as an observed in-point.
- Read each beat naturally and measure it. Shorten/re-read an over-window voice;
  a word-budget pass is not proof of runtime. Captions must match the actual
  spoken words and the evidence label must survive the cut.
- Validate the actual final export: 120–240 seconds including transitions,
  height ≥720, 16:9 target, audio present, decoded healthy frames and end-to-end
  human review. Do not stage old CP3 footage or claim a new export exists.

No fallback silently upgrades evidence. If a required shot cannot be produced,
use a clearly labelled dated source view, revise the narration to match, or
leave the capture pending. Missing `e2e-tree-settle.sh`, the read-only-only
`e2e-graph-cogs.sh` checkpoint, unimplemented Gateway live mode, paused Circle
CLI and blocked escrow deployment are not runnable live-proof capture commands.
