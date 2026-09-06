# M6 Gateway gate — September 5, 2026

## Later approved live result — PASS with pending-batch limits

The unchanged reviewed probe ran once with the owner's dedicated buyer and exact
0.5 USDC deposit / 0.001 USDC payment approval. It exited zero after closing the
private journal. Independent read-only reconciliation completed at 12:02:07.320
UTC: successful approval and deposit, exact calldata/events, sequential nonces,
accepted correlated transfer and buyer balance 499000 atomic. Actual approval plus
deposit gas totaled 0.003574125 native USDC.

Recipient credit is **0 available / 1000 atomic pending batch**. Transfer status
is `received` with no batch transaction hash. F1's acceptance/debit gate passed;
available recipient credit and independently mined batch settlement are **not**
proven. F2–12 code work is unblocked; no new paid run or F13 action is authorized.
See the [dated live report, exact CLI output and transaction references](../superpowers/sdd/2026-09-04-F-gateway-sessions/task-1-live-report.md).
The one-run approval is consumed: never replay its command or select a new journal
to bypass it. Private journals and key material remain excluded from the repository.

## Earlier local-only checkpoint — retained historical record

**Full funded gate: OWNER-PENDING / UNPROVEN.** The bounded local probe is
implemented and its offline tests pass. No F1 buyer key, approval transaction,
deposit, payment authorization, verify request or settle request has been used.
Tasks F2–12 remain gated. Missing owner authority is not a failed-network result
and does not activate the F13 fallback. EIP-3009 remains the application default.

## Observed public support, not payment proof

At approximately 09:56 UTC on September 5, the keyless command ran once against
Circle's testnet `/v1/x402/supported`, under an empty explicit environment with
dotenv disabled and an external 20-second process limit. It exited zero:

```json
{"network":"eip155:5042002","wallet":"0x0077777d7EBA4688BDeF3E311b846F25870A19B9","supported":true,"fullGate":"UNPROVEN","spending":false}
```

The parser checked one v2 exact Arc kind, `GatewayWalletBatched` version `1`, the
exact Gateway wallet and six-decimal Arc USDC. This was only an unsigned GET;
there was no wallet/RPC request, journal, credential or transaction. Reproduce
the keyless check, if needed, from the repository root:

```sh
bun --no-env-file scripts/g2c-nanopay.ts --supported
```

`--supported` and `--help` are deliberately separate non-spending modes; their
zero exit status is never the full funded gate's PASS. A full live invocation
without explicit owner-selected values refuses before network work.

## Owner inputs still required

The owner must confirm a dedicated faucet-funded Arc-testnet buyer's public
address and secure Keychain item name, a **distinct owner-controlled recipient**,
and approval for exactly **0.5 USDC deposit + 0.001 USDC payment + gas**. Existing
canary/deployer/ENS roles and consumed approvals are not substitutes. Private
values must not be pasted into a prompt or stored in this document.

The following is a command shape, **not a ready-to-run authorization**:

```text
bun --no-env-file scripts/g2c-nanopay.ts --live --buyer APPROVED_BUYER --pay-to APPROVED_DISTINCT_RECIPIENT --deposit-usdc 0.5 --payment-usdc 0.001 --journal /ABS/OWNED_0700_DIR/probe.jsonl
```

After approval, read the selected key only inline in the supervised consuming
command as `ARCADE_BUYER_KEY`, with no tracing, dotenv or inherited credentials.
Use an existing owned 0700 directory and a new 0600 exclusively created journal.
The CLI has a 315-second operation deadline and a 330-second owning-process fuse;
the consuming supervisor should additionally cap the process at 360 seconds.
Gas is separately capped at 0.1 native USDC per transaction, at most one exact
approval and one deposit. ERC-20 amounts are six-decimal integers; native gas is
18-decimal and is not represented as a payment receipt amount.

## What the full probe will establish

The implementation requires a matching signer/chain/token, zero initial Gateway
balance both on-chain and in the API, and sufficient wallet funds. It signs and
broadcasts at most one exact approval when required and one deposit. Each known
transaction hash is durably recorded before broadcasting; bounded read-only
receipt checks correlate successful receipt, transaction calldata and block.
Exact on-chain balance and API credit of 500000 atomic units must agree.

A local canonical Gateway authorization for 1000 atomic units is recorded by
nonce before signing, verified, then submitted once. The accepted transfer UUID
must correlate network, token, payer, recipient, amount and nonce, and the buyer's
Gateway API balance must become 499000. Only this complete path prints PASS.
No facilitator UUID or reported batch hash is labelled an independently mined
payment. The probe does not implement sessions, seller withdrawals or split fees.

The journal retains public checkpoints, hashes and nonce, never a private key,
signature or raw signed transaction. After any uncertain outcome, preserve it
and reconcile read-only. **Do not repeat the command, select another journal to
bypass the guard, or retry the whole deposit/settle operation.**

## Source-grounded corrections to the historical plan

- Circle's current settle API lists `self_transfer` as a refusal. The historical
  self-payment fallback is therefore removed; recipient approval is separate.
  [Circle settle API](https://developers.circle.com/api-reference/gateway/all/settle-x402payment).
- Its successful `transaction` is a transfer UUID. Transfer status and nullable
  batch `txHash` are separate metadata, not independent chain finality.
  [Circle transfer API](https://developers.circle.com/api-reference/gateway/all/get-x402transfer-by-id).
- Installed batching SDK 3.2.0's `deposit()` waits for transaction receipts inside
  the operation. Retrying that entire operation can duplicate mutations. This
  probe instead retains the locally known hash, broadcasts once and polls only
  bounded reads; it never calls `waitForTransactionReceipt`.
- The authorization domain is Gateway's, not USDC's. The probe retains the
  installed SDK/core's conservative 604900-second window and ten-minute backdate;
  this is an explicit local constant, not a claim that current documentation
  universally requires seven days.
  [Circle signing guide](https://developers.circle.com/gateway/nanopayments/howtos/eip-3009-signing).

See the [F1 report](../superpowers/sdd/2026-09-04-F-gateway-sessions/task-1-report.md)
for genuine test failures, review and the local verification boundary. Actual
deposit/transfer evidence will be appended only after the separately approved run.

## F12 — offline twenty-call session evidence, September 6, 2026

**Offline PASS; fundsMoved:false; liveEvidence:NOT_RUN.** This addition does not
change the dated F1 result or reuse its consumed spending approval. The F12 live
entry is not implemented: `--live`, missing arguments and unknown options refuse.
There is no implicit deposit, withdrawal, funding, fallback rail or replacement
session.

From the repository root, with permission to bind owned loopback listeners:

```sh
sh scripts/e2e-gateway-session.sh --offline
```

The [harness](../../scripts/e2e-gateway-session.ts) runs the actual Promise buyer
SDK, Gateway signing and verification, hub boot, Broker, native WebSocket,
`startDaemon`, `execSkill` and SQLite. Only external boot RPC and facilitator
responses are finite local fixtures; unexpected requests prevent PASS. The buyer
and seller are distinct deliberately public deterministic fixture identities.
No live chain balance was queried and no operational key was read.

The dedicated childless `gateway-session-probe` script executes twenty original
inputs at 10000 atomic USDC each. Its 200000-atomic session ceiling is local
authorization accounting, not a wallet or Gateway balance. Independent signer,
paid-forward, runner launch/exit/result, hub begin/finish and facilitator counters
must all equal twenty. Twenty distinct `gateway-transfer` UUIDs are required;
they prove neither one batch nor mined settlement, available credit or live funds
movement. No fee sweep, attestation, canary, ENS, AI or child purchase runs.

Before opening the session, a fresh private journal records the fixed policy and
actual manifest, original probe, executed copy and implementation hashes. Every
call, signer entry and paid forward is preceded by an fsynced one-shot record.
Any uncertain call stops the sequence without fill-in or a finally-close. A lost
close acknowledgement permits only the same handle's bounded read-only status
check. Failed attempts remain separate; their journals are not resumable HTTP
capabilities.

The outbound request audit also checks the same private session headers across
status, probe, paid retry, result and close requests, plus per-job result-token
continuity. Public/open requests must omit those capabilities. Expected values
stay in memory only; this observes the SDK boundary without replacing hub auth.

PASS follows writer shutdown, exact owned-process cleanup and listener refusal.
An independent read-only SQLite connection then requires globally exactly one
session and twenty calls, jobs and receipts, using 2/21-row sentinel limits. It
checks canonical stored data, indexed columns, original input/output digests,
nonces, UUIDs, lineage, amounts and times against the original closed artifact.
The complete closed artifact is retained in an exclusive 0600 private file; the
87-record journal is re-read and hash-chain checked. Public output contains only
counts, amounts, hashes and explicit evidence limits—no tokens or private IDs.

The focused author gate passed **26 Bun tests / 123 assertions**, including the
actual twenty-execution run, malformed control EOF, stop-on-uncertainty, lost-close
read recovery, artifact correlation and process guards. Exact nested TypeScript
checking of the three implementation/test roots passed. The committed probe's
four-second stalled-input guard and parent-death disappearance were exercised;
observing an orphan disappear is not a claim that the observer reaped it. This
is a cooperative local-process/filesystem test, not a hostile-script OS sandbox
or proof of arbitrary storage-fault recovery. Mainnet and live twenty-call proof
remain untested. Parent review and full-repository gates are recorded separately
in the F12 SDD artifacts.
