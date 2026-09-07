#!/bin/bash
# Read-only human-voice word-budget proxy. Never synthesize or speed up audio.
set -euo pipefail
shopt -s nullglob

TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ "$#" -le 1 ] || { echo "usage: narration-budget.sh [beat-directory]" >&2; exit 1; }
NARRATION_DIR="${1:-$TASK_ROOT/docs/narration/ethonline-2026}"
[ -d "$NARRATION_DIR" ] && [ ! -L "$NARRATION_DIR" ] || { echo "narration_directory_invalid" >&2; exit 1; }
files=("$NARRATION_DIR"/beat-*.txt)
[ "${#files[@]}" -eq 8 ] || { echo "narration_requires_exactly_eight_beats" >&2; exit 1; }
windows=(30 22 45 23 32 20 23 30)
total=0
over=0
for index in 0 1 2 3 4 5 6 7; do
  number=$((index + 1))
  file="$NARRATION_DIR/beat-$number.txt"
  [ -f "$file" ] && [ ! -L "$file" ] || { echo "narration_beat_invalid: beat-$number" >&2; exit 1; }
  bytes="$(wc -c < "$file")"
  [ "$bytes" -le 8192 ] || { echo "narration_beat_too_large: beat-$number" >&2; exit 1; }
  words="$(LC_ALL=C wc -w < "$file")"
  [ "$words" -gt 0 ] || { echo "narration_beat_empty: beat-$number" >&2; exit 1; }
  window="${windows[$index]}"
  budget=$((window * 5 / 2))
  flag=""
  if [ "$words" -gt "$budget" ]; then flag=" OVER"; over=$((over + 1)); fi
  total=$((total + window))
  printf 'beat-%s %3d words / %3d budget (%ss)%s\n' "$number" "$words" "$budget" "$window" "$flag"
done
printf 'total window: %ss (%dm%02ds)\n' "$total" "$((total / 60))" "$((total % 60))"
[ "$total" -ge 120 ] && [ "$total" -le 240 ] || { echo "narration_total_invalid" >&2; exit 1; }
[ "$over" -eq 0 ] || { echo "narration_over_budget: shorten text, never rush or speed up the voice" >&2; exit 1; }
echo "word-budget proxy passed; actual human voice duration is still unverified."
