# How to move ARCADE to Arc mainnet

This is the future **OWNER-only** procedure for Plan I Task 15. Writing this runbook does not authorize executing it. Obtain explicit approval before spending mainnet funds, confirm each seller address, and use dedicated mainnet keys, never the testnet/demo keys. Keep the manifest `pending` if any published parameter is missing. Do not bypass boot checks.

Prerequisites: Bun, Foundry, the tested checkout, a backed-up testnet deployment, and the persistent-process/volume configuration in [the deployment checklist](runbook.md#deploy-checklist). Run commands from the repository root. Disable shell tracing; retrieve secrets only inside the command that consumes them. Never save keys, job tokens or private result URLs in evidence files.

## 1. Read the published parameters

Read Arc's [contract addresses](https://docs.arc.io/arc/references/contract-addresses) and [RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints). Record the mainnet chain ID, RPC URLs, USDC address, explorer and EIP-712 domain from official sources. **As checked on September 5, 2026, those pages document testnet and say mainnet parameters will be published separately.** Testnet's chain ID or RPC is not a mainnet default.

```bash
open https://docs.arc.io/arc/references/contract-addresses
open https://docs.arc.io/arc/references/rpc-endpoints
```

Dual-decimal warning, verbatim from [chain.ts](../packages/core/src/chain.ts):

> ⚠️ The single most important fact in this codebase: this ONE address is simultaneously
>  - the NATIVE gas token, denominated in 18 decimals (what `eth_getBalance` returns), and
>  - the ERC-20 interface, denominated in 6 decimals (what `balanceOf`/`transfer` use).
>
> Prices, payments and receipts are ALWAYS 6-decimal atomic units. Gas costs are 18-decimal.
> Never mix them; see `money.ts`, which only speaks 6-decimal atomic units.

## 2. Fill the mainnet manifest

```bash
${EDITOR:-vi} config/chains/arc-mainnet.json
git diff -- config/chains/arc-mainnet.json
```

Replace every sentinel: `chainId`, matching `caip2`, `rpcHttp`, `explorerBaseUrl`, USDC `address`, `decimals`, `nativeDecimals`, `eip712Name` and `eip712Version`. Set `status: "ready"` only after every field is verified. Remove the pending note or replace it with dated source links. Keep `gateway: null` until Circle explicitly supports Arc mainnet and publishes its wallet, domain, facilitator URL and validity requirements; do not copy the testnet Gateway entry. Add ERC-8004 fields only when corresponding mainnet registry addresses are published and verified.

Before deploying this release, update tests that intentionally assert the bundled mainnet manifest is pending: core chain-config, deployment config, hub checker/CLI/boot and browser network tests. Move pending-network scenarios to explicit synthetic fixtures (including isolated config for subprocess tests), and add assertions for the newly verified ready manifest. **Do not delete or weaken pending-network protection tests.** This is a required release-code change, not a flag to bypass failing gates. Then require:

```bash
bun run test && bunx tsc --noEmit && bun run web:build && forge test
```

## 3. Check the chain before any signature

Set the **public** address of the dedicated facilitator, not its key. Remove any stale RPC override. Network precedence in this CLI is `--network`, then `ARCADE_NETWORK`, then `arc-testnet`.

```bash
export ARCADE_FACILITATOR_ADDRESS=OWNER_CONFIRMED_MAINNET_FACILITATOR_ADDRESS
export ARCADE_RAIL=eip3009
unset ARCADE_RPC_URL
bun run scripts/chain-check.ts --network arc-mainnet
```

This reads chain ID, token domain, token decimals and facilitator balance. Exit 0 and `ok: arc-mainnet ...` are required before serving paid traffic. A new, unfunded facilitator initially fails its balance check: complete the OWNER funding step below, then rerun. A wrong chain/domain/decimals or RPC failure is not a funding issue. Pending networks refuse before credentials or RPC access.

## 4. Deploy FeeSplitterV2 per seller

**OWNER confirmation required:** seller, treasury and fee basis points are immutable. Approve them before running this transaction. Fund the dedicated deployer for gas first. Set `SELLER` and `TREASURY` to the approved public addresses; `FEE_BPS=500` means 5%.

```bash
export SELLER=OWNER_CONFIRMED_MAINNET_SELLER_ADDRESS
export TREASURY=OWNER_CONFIRMED_MAINNET_TREASURY_ADDRESS
export FEE_BPS=500
DEPLOYER_KEY=$(security find-generic-password -s arcade-mainnet-deployer-key -w) \
  bun run scripts/deploy-splitter.ts --v2 --network arc-mainnet
```

The script checks the actual RPC chain ID before deploying and reads back the immutables and version. Record the deployment transaction and contract address. Repeat for each seller; never use one seller's splitter for another. Set the resulting `ARCADE_FEE_SPLITTER` on that seller's **runner**, not on the hub.

## 5. Fund the facilitator

**OWNER action:** transfer an explicitly approved amount of mainnet USDC to `ARCADE_FACILITATOR_ADDRESS` using the owner's wallet. Gas is USDC. Do not use the testnet faucet or an automated transfer as a workaround. Also fund the dedicated buyer for the approved canary price. Keychain items used below must be provisioned by the owner before starting; their names do not mean the keys exist.

```bash
bun run scripts/chain-check.ts --network arc-mainnet
```

Record the funding transaction publicly, without private keys. Require a passing check before proceeding; a nonzero balance is only a minimum sanity check, not a long-term gas budget.

## 6. Start the mainnet services

Use a separate mainnet database/volume, hub secret and service configuration. Preserve the testnet database and runner configuration for rollback. Set `ARCADE_PUBLIC_URL`, `ARCADE_HUB_SECRET` and `ARCADE_DB` according to the deployment checklist; do not launch a public service with laptop defaults. Keep `ARCADE_CHAIN_CHECK` enabled.

```bash
ARCADE_FACILITATOR_KEY=$(security find-generic-password -s arcade-mainnet-facilitator-key -w) \
  ARCADE_NETWORK=arc-mainnet ARCADE_RAIL=eip3009 bun run hub
```

Gateway refuses while the selected manifest has no Gateway entry. A hosting-platform boot refuses failed checks; a laptop only warns on live mismatches, so the operator must still require the CLI check to pass.

On the dedicated mainnet runner, edit the public `hubUrl` and `sellerAddress` in its existing config to the owner-confirmed values; keep its runner ID/concurrency. `ARCADE_HUB` alone does **not** repoint an existing runner. Never replace a funded identity accidentally. Prepare the fixture in section 7 before starting. Use an isolated skill parent directory containing **only** audited mainnet-safe skills, never the default bundled `skills/` directory.

```bash
${EDITOR:-vi} "$HOME/.arcade/config.json"
export ARCADE_FEE_SPLITTER=OWNER_VERIFIED_MAINNET_SPLITTER_ADDRESS
ARCADE_SELLER_KEY=$(security find-generic-password -s arcade-mainnet-seller-key -w) \
  ARCADE_NETWORK=arc-mainnet bun run arcade start --skills "${MAINNET_SKILLS_DIR:?set the audited skill parent}"
```

Configure `ARCADE_HUB` to the mainnet hub on the buyer and web service. Web network selection is compiled into its browser bundle: rebuild and redeploy, do not merely change the hub environment.

```bash
ARCADE_NETWORK=arc-mainnet bun run web:build
```

Skill subprocesses have scrubbed environments. The runner's `ARCADE_NETWORK` does not automatically reach them. In particular, `usdc-flow-check` currently hardcodes a testnet RPC/token and egress rule. Do not advertise it as mainnet data until its code, manifest egress and sandbox configuration have been migrated and tested. The settlement canary below deliberately performs no chain reads.

## 7. Prove failure first, then success

After explicit mainnet approval, prepare this network-neutral fixture on the dedicated runner. Choose a new isolated directory and keep its path for every runner start:

```bash
export MAINNET_SKILLS_DIR=$(mktemp -d "${TMPDIR:-/tmp}/arcade-mainnet-skills.XXXXXX")
mkdir "${MAINNET_SKILLS_DIR}/settlement-canary"
```

Save the following as `${MAINNET_SKILLS_DIR}/settlement-canary/arcade.json`:

```json
{
  "id": "settlement-canary", "version": "0.1.0",
  "serviceName": "Settlement Canary", "description": "Owner-controlled settlement proof",
  "tags": ["canary"], "price": "$0.01", "bounds": { "timeoutSec": 10 },
  "inputSchema": {
    "type": "object", "required": ["mode"],
    "properties": { "mode": { "type": "string", "enum": ["refuse", "success"] } }
  },
  "outputSchema": {
    "type": "object", "required": ["ok"], "properties": { "ok": { "type": "boolean" } }
  },
  "engine": { "adapter": "script", "entry": "run.ts" }, "secrets": [], "egress": []
}
```

Save this as `${MAINNET_SKILLS_DIR}/settlement-canary/run.ts`. Refusal returns schema-valid output with a refusal stop reason, testing the settlement rule rather than input rejection:

```ts
const { input } = JSON.parse(await Bun.stdin.text())
const ok = input?.mode === "success"
process.stdout.write(JSON.stringify({ output: { ok }, stopReason: ok ? "end_turn" : "refusal" }))
```

```bash
bun run arcade publish "${MAINNET_SKILLS_DIR:?set the audited skill parent}/settlement-canary"
```

Start or restart the configured mainnet runner with section 6's explicit `--skills` argument after saving the fixture so it announces only the audited listings. Do not reset `MAINNET_SKILLS_DIR` between preparing and starting. Verify the public listing's seller, splitter and price before buying. Set `ARCADE_HUB` to that mainnet hub. Save a public feed snapshot before the refusal:

```bash
export MAINNET_EVIDENCE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/arcade-mainnet-evidence.XXXXXX")
curl --fail --silent --show-error "${ARCADE_HUB:?set the mainnet hub}/receipts" \
  --output "${MAINNET_EVIDENCE_DIR}/before.json"
```

In separate commands, using the same owner-approved dedicated buyer:

```bash
ARCADE_BUYER_KEY=$(security find-generic-password -s arcade-mainnet-buyer-key -w) \
  ARCADE_NETWORK=arc-mainnet bun run arcade-buy settlement-canary \
  --hub "${ARCADE_HUB:?set the mainnet hub}" --seller "${SELLER:?set the confirmed seller}" \
  --input '{"mode":"refuse"}' --max-amount 0.01
curl --fail --silent --show-error "${ARCADE_HUB:?set the mainnet hub}/receipts" \
  --output "${MAINNET_EVIDENCE_DIR:?set the evidence directory}/after-refusal.json"
```

Require a refused/unsettled receipt, **no `settleTx`**, and unchanged buyer USDC balance. Compare the snapshots and require exactly one new matching refusal for this seller and skill, identified by `createdAtMs` and network. Preserve that redacted public row; the public feed intentionally has no job ID. This is an actual dispatched failing job, not just a 400 input rejection. Verify the facilitator did not broadcast this authorization. **Stop if it settled.**

```bash
ARCADE_BUYER_KEY=$(security find-generic-password -s arcade-mainnet-buyer-key -w) \
  ARCADE_NETWORK=arc-mainnet bun run arcade-buy settlement-canary \
  --hub "${ARCADE_HUB:?set the mainnet hub}" --seller "${SELLER:?set the confirmed seller}" \
  --input '{"mode":"success"}' --max-amount 0.01
curl --fail --silent --show-error "${ARCADE_HUB:?set the mainnet hub}/receipts"
```

Require `status succeeded`, `settled true` and an explorer transaction with a successful mainnet receipt. Match that exact transaction in the public feed to the seller, skill, selected network and price. Verify the on-chain splitter event and token movement. The buyer CLI can exit 0 for a failed terminal job, so exit status alone proves nothing. Never reuse the testnet-only `e2e-lineage.sh` as mainnet evidence.

## 8. Roll back without losing evidence

Stop mainnet paid traffic and runners first; drain or account for in-flight jobs before shutting down. Preserve the mainnet database and evidence. Restore the saved testnet database, service URLs, runner config, keys and testnet splitter together; do not attach a mainnet database to a testnet hub. Then:

```bash
export ARCADE_NETWORK=arc-testnet
ARCADE_NETWORK=arc-testnet bun run web:build
```

Restart hub and runner with their original **testnet** settings and run the testnet chain check with the testnet facilitator's public address. Reverting an environment variable cannot undo a broadcast transaction or refund a settled call.

## 9. Append evidence, never a claim in advance

```bash
${EDITOR:-vi} README.md
git diff -- README.md
```

After both canaries pass, append a `## Proven on Arc mainnet` section: date, chain ID, source links, seller/splitter addresses, deployment and successful-call explorer links, price/seller/fee, and the refused public receipt row (`seller`, `skillId`, `createdAtMs`, network, `settled: false`). A failed call has **no transaction hash** and the public row has no job ID. Keep testnet evidence intact. Never put private receipt URLs, job tokens or keys in the README.

## 10. Dates and troubleshooting

The execution plan targets **September 16, 2026** for the public-mainnet flip and **September 30, 2026** for the Arc prize evidence deadline. These are planning dates, not proof that mainnet is available; recheck the official launch information and event deadline before acting. Missing published parameters means remain `pending`, even after September 16.

- `pending`: leave the manifest blocked until official parameters are available.
- `Gateway is not available on this network`: use EIP-3009; do not fabricate Gateway config.
- Wrong chain/domain/decimals: correct the manifest or RPC selection and rerun the check.
- `RPC failed`: inspect availability privately, without pasting authenticated RPC URLs into logs.
- Facilitator unfunded: owner funds the correct address on the correct network, then reruns the check.
- Empty catalog: inspect the runner's stored `hubUrl`, seller key match and websocket connection.
- Browser still selects testnet: rebuild the web bundle with the selected network.

Related: [Plan A](superpowers/plans/2026-09-04-A-settlement-core.md), [owner actions, item 20](superpowers/plans/2026-09-04-01-owner-actions.md), [operations runbook](runbook.md).
