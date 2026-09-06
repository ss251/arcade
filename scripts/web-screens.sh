#!/bin/bash
# Explicit read-only source; no build, install, environment-file load or background shell.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bun --no-env-file --no-install "$ROOT/scripts/web-screens.ts" "$@"
