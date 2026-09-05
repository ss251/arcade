#!/usr/bin/env bash
# OWNER supplies six funded roles. Never create/read/echo keys or silently grant approval.
set +x
set -euo pipefail
if [[ "${ARCADE_NETWORK:-arc-testnet}" != "arc-testnet" ]]; then
  echo 'FAIL: only Arc testnet is permitted' >&2
  exit 1
fi
unset BUN_OPTIONS NODE_OPTIONS BUN_INSPECT
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
exec bun --no-env-file run scripts/e2e-erc8004.ts "$@"
