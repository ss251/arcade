#!/bin/bash
# Record one take of the CP3 video.
#
#   ./scripts/demo/rec.sh <name> <seconds>
#
# Self-terminating by design: it records for exactly <seconds> and exits. Nothing to stop,
# no pid file, no process to keep alive between calls — which is the whole point, see below.
#
# ## Why ffmpeg and not `screencapture -v`
#
# `screencapture -v` is the obvious tool and it does not work here. It produces a valid file
# containing exactly 48 frames — about 0.85 seconds — no matter how long it is left running
# or what `-V` is set to. Six seconds requested, 0.85 recorded, exit code 0. A recorder that
# reports success and captures nothing is the same shape as every other bug in this repo, and
# it cost an hour of chasing process lifecycles that were never the problem.
#
# ffmpeg's avfoundation input captures the display directly, at a real frame rate, for the
# real duration.
#
# ## Why a fixed duration instead of start/stop
#
# Each shell here is its own process group, so a backgrounded recorder is reaped when the
# call that launched it returns — and the takes have to be driven from OTHER calls while the
# recording runs. A fixed `-t` removes the problem rather than fighting it: launch the
# recorder as a background task, drive the beat, and it closes its own file on time. Every
# take's length is known from the narration anyway (`scripts/narrate.sh` prints them).
#
# ## The region
#
# Chrome runs fullscreen with a tab sidebar, so the content area is 1864×1080 starting at
# x=56 on a 1920-wide display — measured with `window.innerWidth`/`screenX`, not assumed. The
# display is 2× retina, so the crop is in device pixels and the output is scaled back to
# 1864×1080. Cropping to the CONTENT means no dock, no menu bar, no tab strip in frame.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/design/takes"

name="${1:?usage: rec.sh <name> <seconds>}"
secs="${2:?usage: rec.sh <name> <seconds>}"

# x,y,w,h of the browser content area in POINTS. Doubled below for the retina framebuffer.
X="${ARCADE_REC_X:-56}"
Y="${ARCADE_REC_Y:-0}"
W="${ARCADE_REC_W:-1864}"
H="${ARCADE_REC_H:-1080}"

mkdir -p "$OUT"
dest="$OUT/$name.mp4"

ffmpeg -y -v error \
  -f avfoundation -capture_cursor 1 -framerate 30 -pixel_format uyvy422 -i "0:none" \
  -t "$secs" \
  -vf "crop=$((W * 2)):$((H * 2)):$((X * 2)):$((Y * 2)),scale=$W:$H" \
  -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p \
  "$dest"

# Verified by DECODING, not by exit code — that is exactly what `screencapture` got wrong.
frames="$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$dest")"
dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dest")"
printf '%s  %.1fs  %s frames  %s\n' "$name" "$dur" "$frames" "$dest"

# A proof frame from the middle of the take, always, next to the take.
#
# Frame COUNT says something was recorded; it says nothing about WHAT. Beat 1 was shot with
# the wrong card on screen — 540 frames, 30.1 fps, a perfectly healthy take of the wrong
# thing — and it survived all the way into a finished cut because every check asked "did it
# record?" and none asked "did it record the shot?". This makes the second question a
# one-look answer rather than an assumption.
mid="$(python3 -c "print(max(0.5, $dur / 2))")"
ffmpeg -y -v error -ss "$mid" -i "$dest" -frames:v 1 -vf scale=760:-1 "$OUT/$name.proof.png"
echo "  proof → $OUT/$name.proof.png"

# A take should carry ~30 frames per second. Well under that means dropped frames, which
# reads as stutter in the cut and is worth catching now rather than in the edit.
python3 -c "
import sys
f, d = $frames, $dur
fps = f / d if d else 0
print(f'  {fps:.1f} fps effective' + ('' if fps >= 25 else '  <-- DROPPED FRAMES'))
sys.exit(0)
"
