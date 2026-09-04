#!/usr/bin/env bash
# OWNER must first provision/fund arcade-canary-key, distinct from seller/facilitator.
# Supply keys from Keychain inside the consuming command. Never paste them here.
set +x
set -euo pipefail
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
exec bun run scripts/e2e-canary.ts "$@"
