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

W, H = 1864, 1080
FPS = 30

# take, in-point (s), narration beat, tail of silence after the voice (s)
CUT = [
    ("beat1-problem", 0.0, "beat-1", 1.2),
    ("beat2-marketplace", 0.5, "beat-2", 1.2),
    # The purchase is ONE take; these three enter it at different points.
    #
    # 16.0, not 12.0: macOS paints a "To exit full screen, press and hold esc" hint whenever
    # a window takes focus in a fullscreen space, and it sits over the top of the frame until
    # about t=16. Entering after it is free — the beat has headroom — and it is the only one
    # of these tooltips that CAN be avoided. The one over the wallet prompt cannot: it
    # overlaps MetaMask's own header, so patching it would cover real content, and a brief
    # system hint is a better artifact than an edited-over dialog.
    ("take-purchase", 16.0, "beat-3a", 1.0),
    ("take-purchase", 33.0, "beat-3b", 1.0),
    ("take-purchase", 68.0, "beat-3c-a", 0.4),
    ("take-arcscan", 2.0, "beat-3c-b", 1.4),
    # 1.0, not 1.2: this line runs 20.85s against a 22s take, so the tail is what is left
    # rather than what is preferred. The assembler refuses to stretch, which is the right
    # trade — a shorter pause beats a frozen frame.
    ("beat4-guarantee", 0.0, "beat-4", 1.0),
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


def ass_time(t: float) -> str:
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360_000)
    m, cs = divmod(cs, 6_000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02}:{s:02}.{cs:02}"


CAPTION_HTML = """<!doctype html><meta charset="utf-8">
<style>
  html,body{{margin:0;background:transparent}}
  body{{width:{w}px;display:flex;justify-content:center;align-items:flex-end;
        height:{h}px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}}
  /* The plate is the app's own card surface at 62%, not a black bar: it sits ON the design
     instead of interrupting it, and it stays legible over the near-black takes. */
  p{{margin:0 0 40px;max-width:1180px;padding:14px 26px;border-radius:10px;
     background:rgba(22,21,19,.62);color:#e8e6e1;font-size:27px;line-height:1.42;
     text-align:center;text-wrap:balance;
     -webkit-font-smoothing:antialiased}}
</style>
<p>{text}</p>"""


def render_captions(subs: list[tuple[float, float, str]]) -> list[Path]:
    """One transparent PNG per line, rendered by the browser at frame width."""
    band = 260  # tall enough for two lines plus the bottom margin
    out: list[Path] = []
    script = [
        'cdp("Emulation.setDeviceMetricsOverride", width=%d, height=%d, '
        'deviceScaleFactor=1, mobile=False)' % (W, band),
        'cdp("Emulation.setDefaultBackgroundColorOverride", '
        'color={"r": 0, "g": 0, "b": 0, "a": 0})',
        "import base64, pathlib, time",
    ]
    for i, (_, _, text) in enumerate(subs):
        html = WORK / f"cap{i:02}.html"
        html.write_text(CAPTION_HTML.format(w=W, h=band, text=escape(text)))
        png = WORK / f"cap{i:02}.png"
        out.append(png)
        script += [
            f'goto_url("file://{html}")',
            "wait_for_load()",
            "time.sleep(0.35)",
            'r = cdp("Page.captureScreenshot", format="png")',
            f'pathlib.Path("{png}").write_bytes(base64.b64decode(r["data"]))',
        ]
    script.append('cdp("Emulation.clearDeviceMetricsOverride")')
    subprocess.run(
        ["browser-harness"], input="\n".join(script), text=True, cwd=ROOT,
        capture_output=True, check=True,
    )
    missing = [p for p in out if not p.exists()]
    if missing:
        sys.exit(f"caption render produced nothing for: {missing[0].name}")
    return out


def escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    segments, subs, clock = [], [], 0.0

    for i, (take, start, beat, tail) in enumerate(CUT):
        src = TAKES / f"{take}.mp4"
        voice = VO / f"{beat}.mp3"
        words = (TEXT / f"{beat}.txt").read_text().strip()
        if not src.exists():
            sys.exit(f"missing take: {src}")
        if not voice.exists():
            sys.exit(f"missing narration: {voice}")

        vlen = duration(voice)
        seg = vlen + tail
        have = duration(src) - start

        # A take shorter than its narration would mean holding a frozen frame — say so rather
        # than silently producing it.
        if have < seg - 0.05:
            sys.exit(
                f"{take} has only {have:.1f}s after {start:.1f}s but {beat} needs {seg:.1f}s — "
                "reshoot the take or shorten the line"
            )

        dst = WORK / f"seg{i:02}.mp4"
        run([
            "ffmpeg", "-y", "-v", "error",
            "-ss", f"{start}", "-i", str(src),
            "-t", f"{seg:.3f}",
            "-vf", f"scale={W}:{H},fps={FPS},format=yuv420p",
            "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            str(dst),
        ])
        segments.append(dst)

        subs.append((clock, clock + vlen, words))
        clock += seg

    # ── captions ────────────────────────────────────────────────────────────
    #
    # Rendered in the BROWSER as transparent PNGs and composited, rather than burned by a
    # subtitle filter. Not a preference — this ffmpeg is built without libass AND without
    # libfreetype, so `subtitles` and `drawtext` both fail to parse at all ("No option name
    # near 'captions.ass'", which reads like a syntax error and is actually a missing
    # library). Rebuilding ffmpeg to burn nine lines of text is the larger detour.
    #
    # It is also simply better here: the captions are set in the same face, colour and
    # measure as the product, on the same plate token, so they read as part of the design
    # rather than as a player's default subtitle track pasted over it.
    caption_pngs = render_captions(subs)

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
    # Each caption is one overlay, gated to its own cue window. The band sits at the bottom
    # of the frame, so `H-h` rather than a magic y.
    args = ["ffmpeg", "-y", "-v", "error", "-i", str(silent), "-i", str(voiced)]
    for png in caption_pngs:
        args += ["-i", str(png)]

    chain, prev = [], "0:v"
    for i, (a, b, _) in enumerate(subs):
        label = f"v{i}"
        # +0.25s of lead so the line is legible the instant the voice starts, and a short
        # hold after so it does not vanish on the last syllable.
        chain.append(
            f"[{prev}][{i + 2}:v]overlay=x=0:y=H-h:"
            f"enable='between(t,{max(0.0, a - 0.25):.2f},{b + 0.45:.2f})'[{label}]"
        )
        prev = label

    args += [
        "-filter_complex", ";".join(chain),
        "-map", f"[{prev}]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart",
        "-shortest", str(OUT),
    ]
    run(args)

    total = duration(OUT)
    print(f"\n{OUT}")
    print(f"  {int(total // 60)}:{total % 60:04.1f}   {W}x{H} @ {FPS}fps")
    for i, (take, start, beat, _) in enumerate(CUT):
        print(f"  {i:>2}. {beat:<10} {take}@{start:g}s")


if __name__ == "__main__":
    main()
