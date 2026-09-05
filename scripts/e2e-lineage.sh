#!/usr/bin/env bash
# OWNER supplies existing funded roles. This command never retrieves or provisions keys.
set +x
set -euo pipefail
if [[ "${ARCADE_NETWORK:-arc-testnet}" != "arc-testnet" ]]; then
  echo 'FAIL: only Arc testnet is permitted' >&2
  exit 1
fi
unset BUN_OPTIONS NODE_OPTIONS BUN_INSPECT
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
exec bun --no-env-file run scripts/e2e-lineage.ts "$@"
