#!/usr/bin/env bash
set -euo pipefail

# The runbook starts the hub and runner with the funded, distinct sub-buy key. This script
# starts nothing. arcade-buy polls the private result URL; the verifier joins the public
# receipts by settlement tx, so an older successful demo cannot pass this run.
: "${ARCADE_BUYER_KEY:?set ARCADE_BUYER_KEY to a funded Arc testnet buyer key}"
export ARCADE_NETWORK=arc-testnet

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
hub_url=${ARCADE_HUB:-http://localhost:8787}
buyer_output=$(mktemp)
receipts_json=$(mktemp)
trap 'rm -f "$buyer_output" "$receipts_json"' EXIT

cd "$repo_dir"
bun run arcade-buy loop-probe \
  --input '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' \
  --max-amount 0.35 | tee "$buyer_output"
curl --fail --silent --show-error "$hub_url/receipts" > "$receipts_json"
bun scripts/verify-lineage-evidence.ts "$buyer_output" "$receipts_json"
