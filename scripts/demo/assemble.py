#!/usr/bin/env python3
"""
Cut the CP3 video: takes + narration + burned captions → one file.

    python3 scripts/demo/assemble.py

## The cut is a MANIFEST, not a pile of ffmpeg commands

Every beat is one row below: which take, where to enter it, which narration clip, and the
caption text. Changing the edit means changing data. That matters because this video will be
recut — a beat gets reshot, a line gets rewritten, the hop lands — and an edit expressed as
a shell script would have to be re-read and re-reasoned each time.

## Video length follows the VOICE, not the other way round

Each segment runs for its narration clip plus a short tail of silence. Any take is longer
than its clip (deliberately, when shooting), so this TRIMS rather than stretches: nothing is
sped up, slowed down, or looped to fit. If a clip ever outran its take the assembler would
be padding a frozen frame, so it refuses instead — see `check`.

## Captions are burned, not a sidecar

They are the same words as the voice, so the video is legible with the sound off (which is
how a judge scrubbing through twenty submissions will first meet it) and readable by anyone
who needs them. A .srt file alongside would be neither.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAKES = ROOT / "design" / "takes"
VO = ROOT / "design" / "narration"
TEXT = ROOT / "docs" / "narration"
WORK = ROOT / "design" / "work"
OUT = ROOT / "design" / "arcade-cp3.mp4"

# The recorded frame, and the frame this SHIPS in.
#
# Chrome's tab sidebar makes the content area 1864 wide, which is 1.726:1 — not 16:9. A
# submission that is not 16:9 is at the mercy of whatever player a judge opens it in:
# letterboxed on one, pillarboxed on another, cropped on a third. So the picture is padded
# out to 1920×1080 rather than stretched, and padded with the design's own paper colour
# instead of black, which makes the 28px either side invisible on this composition.
W, H = 1864, 1080
OUT_W, OUT_H = 1920, 1080
PAPER = "0x161513"
FPS = 30

# take, in-point (s), narration beat, tail of silence after the voice (s)
CUT = [
    ("beat1-problem", 0.0, "beat-1", 1.2),
    ("beat2-marketplace", 0.5, "beat-2", 1.2),
    # The purchase is ONE take; these three enter it at different points, and every entry
    # point below was MEASURED off the footage rather than guessed.
    #
    # That distinction cost a whole cut. `beat-3b` was set to 33.0 by estimating where the
    # card "should" be; the card actually appeared thirteen seconds later, so the hero beat
    # opened on a near-empty screen while the narration described a confirmation card that
    # was not there. Nothing caught it — the take was healthy, the segment was the right
    # length, the caption was the right words. It was pointed at the wrong part of the take.
    #
    # `take-purchase.py` now prints a timesheet; these numbers come from it, cross-checked
    # against extracted frames. Re-derive them after every reshoot: the model takes anywhere
    # from 9 to 30 seconds to reach the card, so these do NOT survive a new take.
    ("take-purchase", 23.0, "beat-3a", 1.0),   # catalogue up
    ("take-purchase", 41.0, "beat-3b", 1.0),   # card at 42, held to ~56, wallet 58+
    ("take-purchase", 72.0, "beat-3c-a", 0.4),  # settled result on screen
    ("take-arcscan", 2.0, "beat-3c-b", 1.4),
    # The hop — one buyer action, two settlements. The shot is the hub's own receipt tape
    # rather than the chat, because the tape is the stronger evidence: both hops appear as
    # adjacent rows with separate transactions and separate fee splits, and an unsettled
    # "$0 charged" row sits underneath them, which demonstrates settle-on-success on the
    # same screen as the successes.
    ("take-hop", 1.0, "beat-3d", 1.4),
    # 1.0, not 1.2: this line runs 20.85s against a 22s take, so the tail is what is left
    # rather than what is preferred. The assembler refuses to stretch, which is the right
    # trade — a shorter pause beats a frozen frame.
    # ONE narration line, TWO shots. The last sentence — "the runner dials out, so a seller
    # can sell from a laptop behind NAT, with no open ports" — is the architecture, so the
    # picture cuts to the diagram while the voice keeps going. No new voice-over, no change
    # to the running time; only what is on screen changes.
    #
    # A list means "fill this beat from these takes in order"; the last entry takes whatever
    # time is left, so the split point is the only number to tune.
    ([("beat4-guarantee", 0.0, 11.0), ("beat4b-architecture", 0.0, None)], None, "beat-4", 1.0),
    ("beat5-stack", 0.0, "beat-5", 1.2),
    ("beat6-close", 0.0, "beat-6", 1.6),
]


def run(args: list[str], cwd: Path | None = None) -> str:
    p = subprocess.run(args, capture_output=True, text=True, cwd=cwd)
    if p.returncode != 0:
        sys.exit(f"failed: {' '.join(args[:6])}…\n{p.stderr[-1500:]}")
    return p.stdout.strip()


def duration(path: Path) -> float:
    return float(
        run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    )


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


# Broadcast-ish caption geometry: two lines, ~42 characters each.
LINE = 42
CUE = LINE * 2


def cues(text: str, start: float, end: float) -> list[tuple[float, float, str]]:
    """
    Split one narration line into timed subtitle cues of at most two lines each.

    A beat's narration runs 8-23 seconds and 150-300 characters. Emitting that as ONE cue
    produces a wall of text that either overflows the player's caption band or gets wrapped
    into five lines across the middle of the picture — the first version did exactly that,
    with a 200-character second line.

    So the line is broken on sentence boundaries where it can be and on words where it
    cannot, and the beat's duration is shared out in proportion to how much text each cue
    carries. That keeps the captions in step with the voice without needing word-level
    timings, which nothing here produces.
    """
    words = text.split()
    chunks: list[str] = []
    cur = ""
    for w in words:
        cand = f"{cur} {w}".strip()
        if len(cand) > CUE and cur:
            chunks.append(cur)
            cur = w
        else:
            cur = cand
        # Prefer to break where the sentence does — a cue that ends on a full stop reads as
        # a unit rather than as a slice.
        if cur.endswith((".", "?", "!")) and len(cur) > CUE * 0.55:
            chunks.append(cur)
            cur = ""
    if cur:
        chunks.append(cur)
    if not chunks:
        return []

    total = sum(len(c) for c in chunks)
    out: list[tuple[float, float, str]] = []
    t = start
    span = end - start
    for c in chunks:
        dt = span * (len(c) / total)
        out.append((t, t + dt, wrap_two(c)))
        t += dt
    return out


def wrap_two(text: str) -> str:
    """Balance a cue across two lines, so neither is a stub next to a full one."""
    words = text.split()
    if len(" ".join(words)) <= LINE:
        return " ".join(words)
    best, score = None, None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        if len(a) > LINE or len(b) > LINE:
            continue
        d = abs(len(a) - len(b))
        if score is None or d < score:
            best, score = (a, b), d
    if best is None:
        # Cannot fit two lines; break at the midpoint and let the player handle the rest.
        mid = len(words) // 2
        best = (" ".join(words[:mid]), " ".join(words[mid:]))
    return "\n".join(best)


def encode(pieces: list[tuple[str, float, float]], seg: float, dst: Path) -> None:
    """
    Build one segment's video from one or more takes, cut back to back.

    Most beats are a single piece. A beat that needs the picture to change while the voice
    keeps going — the guarantee line cutting to the architecture diagram — supplies several,
    and they are encoded to identical parameters then concatenated, so the join is a clean
    frame boundary rather than a re-encode seam.
    """
    parts: list[Path] = []
    for n, (name, st, want) in enumerate(pieces):
        out = dst.with_name(f"{dst.stem}_{n}.mp4")
        run([
            "ffmpeg", "-y", "-v", "error",
            "-ss", f"{st}", "-i", str(TAKES / f"{name}.mp4"),
            "-t", f"{want:.3f}",
            "-vf", f"scale={W}:{H},fps={FPS},format=yuv420p",
            "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            str(out),
        ])
        parts.append(out)

    if len(parts) == 1:
        parts[0].replace(dst)
        return

    lst = dst.with_suffix(".txt")
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", str(lst), "-c", "copy", str(dst)])


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    segments, subs, clock = [], [], 0.0

    for i, (take, start, beat, tail) in enumerate(CUT):
        voice = VO / f"{beat}.mp3"
        words = (TEXT / f"{beat}.txt").read_text().strip()
        if not voice.exists():
            sys.exit(f"missing narration: {voice}")

        vlen = duration(voice)
        seg = vlen + tail

        # A beat is either one take, or a list of (take, start, seconds) filling it in order
        # with the last entry taking the remainder. Normalising here means everything below
        # only ever sees the list form.
        pieces = take if isinstance(take, list) else [(take, start, None)]
        used = sum(d for _, _, d in pieces if d is not None)
        pieces = [(n, st, (seg - used) if d is None else d) for n, st, d in pieces]

        for name, st, want in pieces:
            src = TAKES / f"{name}.mp4"
            if not src.exists():
                sys.exit(f"missing take: {src}")
            have = duration(src) - st
            # A take shorter than the time it must fill would mean holding a frozen frame —
            # say so rather than silently producing it.
            if have < want - 0.05:
                sys.exit(
                    f"{name} has only {have:.1f}s after {st:.1f}s but {beat} needs {want:.1f}s "
                    "from it — reshoot the take or shorten the line"
                )

        dst = WORK / f"seg{i:02}.mp4"
        encode(pieces, seg, dst)
        segments.append(dst)

        subs.append((clock, clock + vlen, words))
        clock += seg

    # ── captions ────────────────────────────────────────────────────────────
    #
    # A real SUBTITLE TRACK, not pixels burned into the picture.
    #
    # The first version composited them in, which meant they could never be turned off — and
    # they sat over the bottom of the frame, which on this product is exactly where the
    # composer lives. The one surface a viewer most wants to see clearly was permanently
    # covered by a description of it.
    #
    # As a track they are the viewer's choice, and they default to OFF: the video is
    # narrated, so captions are an accessibility and sound-off affordance rather than part of
    # the composition. The .srt is also written beside the .mp4, because some upload targets
    # want the sidecar and every player can read one.
    srt = WORK / "captions.srt"
    split = [c for a, b, t in subs for c in cues(t, a, b)]
    srt.write_text(
        "\n".join(
            f"{n}\n{srt_time(a)} --> {srt_time(b)}\n{t}\n"
            for n, (a, b, t) in enumerate(split, 1)
        )
    )
    (OUT.with_suffix(".srt")).write_text(srt.read_text())

    # ── video ───────────────────────────────────────────────────────────────
    lst = WORK / "segments.txt"
    lst.write_text("".join(f"file '{s}'\n" for s in segments))
    silent = WORK / "video.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)])

    # ── audio: each clip placed at its own segment's start ──────────────────
    # Built with adelay rather than concat so a clip's position is its cue time, and the tail
    # after each line is real silence rather than the next line arriving early.
    inputs, filters, clock = [], [], 0.0
    for i, (_, _, beat, tail) in enumerate(CUT):
        voice = VO / f"{beat}.mp3"
        inputs += ["-i", str(voice)]
        ms = int(round(clock * 1000))
        filters.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
        clock += duration(voice) + tail
    # `loudnorm` belongs INSIDE the filtergraph. As `-af` it is a simple filter on a stream
    # already fed by a complex one, which ffmpeg refuses outright — the two cannot be mixed
    # for the same stream. Chaining it onto [out] is the same normalisation, legally placed:
    # broadcast-ish loudness, so this is not the one submission a judge reaches for the
    # volume knob on.
    mix = (
        "".join(f"[a{i}]" for i in range(len(CUT)))
        + f"amix=inputs={len(CUT)}:normalize=0[mixed];"
        + "[mixed]loudnorm=I=-16:TP=-1.5:LRA=11[out]"
    )
    voiced = WORK / "voice.m4a"
    run([
        "ffmpeg", "-y", "-v", "error", *inputs,
        "-filter_complex", ";".join(filters) + ";" + mix,
        "-map", "[out]",
        "-c:a", "aac", "-b:a", "192k",
        str(voiced),
    ])

    # ── burn captions, mux, ship ────────────────────────────────────────────
    run([
        "ffmpeg", "-y", "-v", "error",
        "-i", str(silent), "-i", str(voiced), "-i", str(srt),
        "-vf", f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2:color={PAPER}",
        "-map", "0:v", "-map", "1:a", "-map", "2:s",
        "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        # mov_text is the subtitle codec MP4 carries; SRT cannot be muxed as-is.
        "-c:s", "mov_text",
        "-metadata:s:s:0", "language=eng",
        "-metadata:s:s:0", "title=English",
        # Clear the default flag so players do NOT show them unless asked. The video is
        # narrated; captions are the viewer's option, not the composition.
        "-disposition:s:0", "0",
        "-movflags", "+faststart",
        "-shortest", str(OUT),
    ])

    # ffmpeg's mov muxer marks every track enabled in this build, whatever `-disposition`
    # says, so the bit is cleared where it actually lives — in the track header. Run here
    # rather than by hand, because a step you have to remember is a step that gets skipped.
    run(["python3", str(Path(__file__).with_name("subs_off.py")), str(OUT)])

    total = duration(OUT)
    print(f"\n{OUT}")
    print(f"  {int(total // 60)}:{total % 60:04.1f}   {W}x{H} @ {FPS}fps")
    for i, (take, start, beat, _) in enumerate(CUT):
        shots = take if isinstance(take, list) else [(take, start, None)]
        where = " + ".join(f"{n}@{st:g}s" for n, st, _ in shots)
        print(f"  {i:>2}. {beat:<10} {where}")


if __name__ == "__main__":
    main()
