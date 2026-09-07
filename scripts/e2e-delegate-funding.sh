#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec env -i PATH="$PATH" HOME="$HOME" USER="${USER:-}" TMPDIR="${TMPDIR:-/private/tmp}" ARCADE_NETWORK=arc-testnet \
  bun --no-env-file scripts/e2e-delegate-funding.ts "$@"
