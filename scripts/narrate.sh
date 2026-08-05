#!/bin/bash
# Generate the CP3 video's narration track with ElevenLabs — one clip per beat.
#
#   ./scripts/narrate.sh              # all beats
#   ./scripts/narrate.sh beat-3b      # one beat, after an edit
#
# Reads docs/narration/beat-*.txt (the VO lines — VERBATIM the caption text, which is both
# the a11y story and the submission-compliance pairing) and writes design/narration/*.mp3.
#
# The key is read from ~/.config/fleet/elevenlabs.key inside the script and never echoed.
# Voice: Eric — smooth, trustworthy, American middle-aged. The register the storyboard asks
# for is "calm, precise, unhurried"; a payments demo judged by Circle's own ecosystem team
# wants trustworthy over characterful.
#
# Beat windows (from ~/.buzz/PLANS/ARCADE_VIDEO_CP3.md):
#   1=18  2=14  3a=20  3b=28  3c=28  3d=24  4=22  5=16  6=10   (seconds, sums to 180)
#
# Every clip's measured duration is printed against its window, so drift is caught here
# rather than in the edit. A clip OVER its window is the only real failure: the edit can
# hold a shot longer, but it cannot make the voice shorter.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IN="$ROOT/docs/narration"
OUT="$ROOT/design/narration"
KEYFILE="${ELEVENLABS_KEY_FILE:-$HOME/.config/fleet/elevenlabs.key}"
VOICE="${ELEVENLABS_VOICE_ID:-cjVigY5qzO86Huf0OWal}"
MODEL="${ELEVENLABS_MODEL:-eleven_multilingual_v2}"

[ -r "$KEYFILE" ] || { echo "no ElevenLabs key at $KEYFILE" >&2; exit 1; }

# Window per beat, seconds. Keep in sync with the storyboard's budget table.
window_for() {
  case "$1" in
    beat-1) echo 18 ;; beat-2) echo 14 ;; beat-3a) echo 20 ;; beat-3b) echo 28 ;;
    beat-3c) echo 28 ;; beat-3d) echo 24 ;; beat-4) echo 22 ;; beat-5) echo 16 ;;
    beat-6) echo 10 ;; *) echo 0 ;;
  esac
}

mkdir -p "$OUT"
only="${1:-}"
over=0

for f in "$IN"/beat-*.txt; do
  beat="$(basename "$f" .txt)"
  [ -n "$only" ] && [ "$beat" != "$only" ] && continue

  python3 - "$f" "$MODEL" <<'PY' > "$OUT/.body.json"
import json, sys
text = open(sys.argv[1]).read().strip()
print(json.dumps({
    "text": text,
    "model_id": sys.argv[2],
    "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.0,
        "use_speaker_boost": True,
    },
}))
PY

  curl -sf -X POST \
    "https://api.elevenlabs.io/v1/text-to-speech/$VOICE?output_format=mp3_44100_128" \
    -H "xi-api-key: $(cat "$KEYFILE")" \
    -H "content-type: application/json" \
    --data @"$OUT/.body.json" \
    -o "$OUT/$beat.mp3"

  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$beat.mp3")"
  win="$(window_for "$beat")"
  flag=""
  # Only OVER matters. Under-window is a shot that holds a beat longer, which is free.
  awk -v d="$dur" -v w="$win" 'BEGIN{exit !(d>w)}' && { flag="  <-- OVER"; over=$((over+1)); }
  printf '%-9s %6.2fs / %2ss%s\n' "$beat" "$dur" "$win" "$flag"
done

rm -f "$OUT/.body.json"
echo
[ "$over" -eq 0 ] && echo "every clip fits its window." \
  || echo "$over clip(s) over window — shorten the TEXT, never speed the voice."
