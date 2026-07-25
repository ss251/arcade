#!/bin/bash
# Two-machine end-to-end proof.
#
# The single most important claim ARCADE makes is that a seller's code runs on the seller's
# OWN machine and the hub only ever receives outputs. On one host that claim is unfalsifiable.
# This script runs the hub on this machine and the runner on a genuinely different one, then
# asserts the hub holds no engine config, entry path, or egress rule.
#
#   HUB_HOST     address the remote runner should dial (e.g. a Tailscale IP)
#   REMOTE       ssh target for the seller machine
#   REMOTE_BUN   path to bun on the seller machine (login PATH is not used over ssh)
#   REMOTE_REPO  checkout path on the seller machine
#
# usage:
#   HUB_HOST=100.98.128.65 REMOTE=user@host REMOTE_BUN=~/.bun/bin/bun \
#   ARCADE_FACILITATOR_KEY=0x… ARCADE_BUYER_KEY=0x… SELLER=0x… \
#   bash scripts/e2e-two-machine.sh
set -eu

HUB_HOST="${HUB_HOST:?set HUB_HOST to an address the remote can reach}"
REMOTE="${REMOTE:?set REMOTE to an ssh target}"
REMOTE_BUN="${REMOTE_BUN:-~/.bun/bin/bun}"
REMOTE_REPO="${REMOTE_REPO:-~/arcade}"
PORT="${PORT:-8790}"
SELLER="${SELLER:?set SELLER to the address that receives USDC}"
: "${ARCADE_FACILITATOR_KEY:?set a funded Arc testnet key for the facilitator}"
: "${ARCADE_BUYER_KEY:?set a funded Arc testnet key for the buyer}"

HUB_LOG=$(mktemp)
cleanup() {
  kill ${HUB_PID:-0} 2>/dev/null || true
  ssh "$REMOTE" "pkill -f 'runner start' || true" 2>/dev/null || true
}
trap cleanup EXIT

echo "== hub (this machine) =="
ARCADE_RAIL="${ARCADE_RAIL:-eip3009}" PORT=$PORT bun run apps/hub/src/server.ts > "$HUB_LOG" 2>&1 &
HUB_PID=$!
sleep 2
curl -sf "http://localhost:$PORT/healthz" && echo

echo "== hub reachable from the seller machine =="
ssh "$REMOTE" "curl -sf --max-time 8 http://$HUB_HOST:$PORT/healthz" && echo

echo "== runner (seller machine) =="
ssh "$REMOTE" "cd $REMOTE_REPO && $REMOTE_BUN run packages/runner/src/cli.ts runner init --seller $SELLER --hub http://$HUB_HOST:$PORT" >/dev/null
ssh -f "$REMOTE" "cd $REMOTE_REPO && nohup $REMOTE_BUN run packages/runner/src/cli.ts runner start > /tmp/arcade-runner.log 2>&1 &"
sleep 4
curl -sf "http://localhost:$PORT/listings" | bun -e "const j=await Bun.stdin.json(); console.log(j.length ? j.map(l=>'  '+l.id+' '+l.price).join('\n') : '  (no listings — runner did not connect)')"

echo
echo "== paid call =="
ARCADE_HUB="http://localhost:$PORT" bun run packages/buyer/src/cli.ts usdc-flow-check \
  --input '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' --max-amount 0.05

echo
echo "== the work ran on the seller machine =="
ssh "$REMOTE" "tail -4 /tmp/arcade-runner.log"

echo
echo "== secrecy assertions =="
FAIL=0
if grep -qE "systemPrompt|\"adapter\"|\"egress\"|\"entry\"" "$HUB_LOG"; then
  echo "  FAIL — private data appears in the hub log"; FAIL=1
else
  echo "  OK — hub log carries no engine/entry/egress"
fi
curl -sf "http://localhost:$PORT/listings/usdc-flow-check" | bun -e "
const l = await Bun.stdin.json();
const bad = ['engine','secrets','egress','workdir'].filter(k => k in l);
if (bad.length) { console.log('  FAIL — hub API exposes ' + bad.join(',')); process.exit(1) }
console.log('  OK — hub API exposes no private field');
" || FAIL=1

exit $FAIL
