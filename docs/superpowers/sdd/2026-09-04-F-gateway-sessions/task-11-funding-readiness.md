> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 funding readiness — explicit funds, one attempt, retained uncertainty

September 6, 2026. Bounded planning only. This ignored note is the only write.
No source/test changes, test runs, Git, network, key/approval/environment access,
signing, deposit, withdrawal or other live operation occurred. F1's approval is
consumed; its journal is not opened or reused here. G/H remain held.

Parent accepts funding-independent F9 and moves the unsafe ensureGatewayDeposit
convenience into this explicit F11 boundary. This note proposes implementation
contracts and technical release prerequisites, not owner-action requests.

## Inspected evidence and material plan corrections

- Full Plan F Task11, `docs/superpowers/plans/2026-09-04-F-gateway-sessions.md:2522`:
  buyer deposit/session CLI, seller withdrawal and sessions documentation. Its
  implicit withdraw-all, Number/regex-cleaned amount, raw key environment example,
  SDK convenience calls and instant/available-credit claims are unsafe to copy.
- `scripts/gateway-gate.ts:6`, `:127`, `:173`, `:198` and complete
  `scripts/gateway-gate-runtime.ts`: pinned coordinates, bounded transport, exact
  gate policy, exclusive fsynced journal, one-shot mutation latches, pre-broadcast
  local transaction hash and read-only receipt polling. `scripts/g2c-nanopay.ts`
  separately owns import safety, explicit modes and the process deadline.
- F1 public task-1-report/live-report and `docs/evidence/m6-gateway.md`: actual
  single 500000-atomic deposit / 1000-atomic payment; buyer 499000 available,
  recipient 1000 pendingBatch / zero available. No seller withdrawal was tested.
  Historical local report lists 49 focused cases / 2021 assertions; not rerun here.
- Full `packages/payments/src/gateway-sign.ts`, F2 readiness and final integration
  report: pinned own-data validation, signer capture, exact money, actual recovery,
  one signing attempt and fixed failure channels. F2 signs GatewayWalletBatched
  TransferWithAuthorization; it is NOT the withdrawal BurnIntent signer.
- `task-9-buyer-readiness.md` and `task-8-parent-decisions.md`:
  no implicit funding, both headers through quote/probe/retry/poll, held settlement
  uncertainty, read-only closed_receipt recovery and independent seller-funded hire.
- Installed Circle 3.2.0 `dist/client/index.js:832–974`: getBalances reads wallet
  and API separately; API decoder selects the first row and drops pendingBatch.
  deposit can approve, send deposit, then throw in waitForTransactionReceipt.
  `:1234–1372`: withdraw signs BurnIntent, POSTs /transfer, then sends gatewayMint
  and waits. Default maxFee is 2.01 USDC, maxBlockHeight is maxUint256, and every
  invocation gets a fresh salt. Response attestation bytes are not locally bound
  to the requested recipient/amount; destination transport is freshly constructed.
  `:1384–1429` exposes x402 transfer queries, not a demonstrated BurnIntent recovery
  API. `:1510–1626` is a separate delayed trustless flow, not an automatic fallback.
- `packages/buyer/src/cli.ts:1–89` currently performs import-time dispatch/key
  lookup, permissive flag lookup, unchecked listing JSON and Cause.pretty errors.
  New funding/session modes need an import-safe strict dispatcher before that
  legacy path; no opportunistic rewrite of unrelated sessionless diagnostics.
- Core `chain-config.ts` and `config/chains/arc-testnet.json` pin wallet/domain/API
  but contain no Gateway Minter. Installed SDK pins testnet Minter at
  0x0022222ABE238Cc2C7Bb1f21003F0a260052475B; this is local compatibility evidence,
  not a current deployed-code/attestation verification result.

Read repository Arc/Gateway guidance and its self-managed EVM deposit, EVM-to-EVM
transfer and balance references. They clarify token units, deposit versus plain
transfer, and the burn/attestation/mint distinction. Their sample broad defaults,
raw errors and receipt-wait helpers do not override the repo's stricter F1 policy.
No Circle wallet/bootstrap/terms command or online documentation lookup occurred.

## Smallest buildable implementation boundary

Keep the browser-safe buyer/session exports funding-independent. Add a small
import-safe funding policy/decoder module plus a separate Bun-only IO/journal
adapter; expose explicit funding helpers only through a deliberate funding entry,
not from openSession/call/close, MCP purchase, runner or hire broker. No SDK upgrade
or new dependency is needed for deposit, local policy tests and journal mechanics.
Do not import/broaden the fixed F1 runtime or edit its consumed-gate parser/events.

Retain two unambiguous amount meanings if supporting both plan and convenience:

- `gateway-deposit --amount A`: deposit exactly A, irrespective of an already
  funded account. Never print already-funded success in lieu of this exact action.
- `ensureGatewayDeposit({ minimumAvailableAtomic, maxDepositAtomic, ... })`, with
  explicit CLI spelling `--minimum-available A`: inspect available balance and
  deposit exactly max(0, target - available). Mutually exclusive with --amount.
  A zero shortfall is a validated no-op, not a synthetic transaction or deposit.

Missing/duplicate/unknown flags or both modes fail before credential or network IO.
Help/imports and explicit balance/inspect/reconcile modes require no signer. Use a
named execution mode plus explicit public account, pinned network/token, amount,
gas/fee ceilings and private operation journal; a script invocation or existing
key does not itself authorize movement. No default deposit, default withdrawal
amount, withdraw-all, faucet call, gas top-up, chain bridge or approval reset.

The eventual runtime receives one captured signer from the supervised credential
boundary after strict arguments are validated. No raw key CLI flag or persisted
key/secret, dotenv, arbitrary account provider or uncontrolled ambient override.
Keep credential acquisition out of reusable modules and read-only modes. New CLI
paths print only whitelisted typed outcomes, never Cause.pretty/provider errors.

## Exact deposit authority and shortfall

Capture a frozen plan: operation ID/kind, public account, Arc-testnet chain 5042002
/ eip155:5042002 / domain 26, USDC 0x3600000000000000000000000000000000000000,
Gateway Wallet 0x0077777d7EBA4688BDeF3E311b846F25870A19B9, trusted RPC/API origin,
amount mode/target/maximum, exact shortfall, observed block/balance and gas ceilings.
Select the explicit ready core config and compare installed SDK coordinates;
untrusted CLI/remote metadata cannot substitute token, spender, beneficiary or
deployment. Recheck RPC chain before signing each transaction and refuse drift.
Validate token decimals six and deployed contract code at the pinned coordinates.

Amounts are canonical positive decimal USDC strings with <=6 fractional places,
converted exactly to bigint and bounded by uint256; zero is allowed only in
nonnegative balance/fee fields or computed shortfall. No Number, exponent, sign,
whitespace, currency-symbol stripping, coercible object or silent rounding.
Pure helper inputs are own-data closed shapes; snapshot and reject accessors.

Query one exact domain/depositor tuple. Bound the response and require exactly
one correlated row, valid token identity and exact available amount. Do not select
rows[0] without validation or use pendingBatch/withdrawing/withdrawable as spendable
available. Preserve these other categories when actually present; missing optional
categories remain unavailable, not fabricated zero. Do not trust SDK total as a
complete assets view: it omits pendingBatch. Chain totalBalance is not API available.

For target mode, shortfall is computed once from a fresh validated available
snapshot and must not exceed the explicit maximum deposit. An unavailable/malformed
balance cannot become zero. Before each mutation, revalidate the captured relevant
balance/allowance assumptions; a changed target shortfall refuses instead of
silently increasing/decreasing the signed plan. Never loop deposits until a later
balance reaches target. After credit, concurrent external spending may still lower
available; report observations honestly rather than guaranteeing future liquidity.

Read allowance(owner=account, spender=pinned Gateway Wallet) as bounded uint256.
If already sufficient, submit no approval. Otherwise approve exactly the frozen
deposit amount, never maxUint256, a UI-derived value, approveAmount override or
skipApprovalCheck. Confirm that exact approval before deposit, then re-read
allowance. A failed/unknown approval stops the deposit phase; do not reset/revoke/
reapprove automatically. Existing excess allowance is not silently changed.
Deposit uses deposit(USDC, exactAmount), zero native value and the same signer as
depositor; reject depositFor/arbitrary recipients and ordinary ERC20 transfer to
the Gateway contract. The Gateway wallet is the contract destination, not a seller
payee. No session listing/fee-splitter/payTo metadata participates in funding.

Budget all potentially required transaction gas explicitly. Native 18-decimal
USDC and ERC20 six-decimal USDC are the same pool, not two additive balances.
Require depositAmount*10^12 plus maximum authorized aggregate gas <= the validated
native balance; also validate six-decimal transfer funds. Bound each gas limit,
gas price/maxFee and maxPriorityFee, their aggregate and arithmetic. Do not inherit
F1's 120000/0.1 caps as new live authorization or apply them blindly to gatewayMint.

## Durable one-shot journal and read-only reconciliation

Use F1's mechanics, but a separately versioned closed schema and account-scoped
operation ownership. Required chain: validate -> exclusive claim -> fsynced plan
and intent -> prepare/sign once -> fsynced known hash -> one broadcast -> bounded
reads -> persist correlated terminal evidence. Journal failure at any stage
prevents the next mutation. An already cancelled operation performs no signing/IO.

- Use an owned non-symlink 0700 parent, exclusive/no-follow 0600 file, fsync file
  and parent on claim, serialized bounded writes and poison-on-write/sync failure.
  Never truncate, overwrite, auto-resume, delete or replace an existing journal.
  Strictly validate file/record sizes, versions, ordering and request fingerprint
  during recovery; partial/corrupt records fail closed, not repaired into success.
- A unique journal filename alone is not process-wide ownership. Serialize this
  tool's funding attempts for the normalized chain/account and persist unresolved
  intent ownership in a fixed private namespace. Two different filenames must not
  bypass a held attempt. No timeout-based automatic stale-lock takeover; no claim
  of protection against unrelated external wallets using the same account.
- Latch an operation before its first asynchronous mutation preparation and retain
  it on all failure/interruption paths. Re-running its Effect or directly invoking
  its adapter again cannot sign, approve, deposit, burn or mint again.
- Prepare/sign locally with transport retryCount zero. Validate/recover the actual
  signed transaction: account, chain, nonce, exact to/calldata/value and gas fields.
  Compute hash locally. Fsync operation/stage, expected binding/calldata digest,
  nonce and hash before the sole eth_sendRawTransaction. Check returned hash agrees.
  Persist no key, signature, raw signed transaction or arbitrary response text.
- Unknown send, timeout, malformed/mismatched acknowledgement or cancellation
  retains the known hash and uncertainty. No rebroadcast (even identical raw bytes),
  fresh nonce, replacement transaction or whole-operation retry. Read absence or
  a lower balance cannot prove the send never occurred. A successful approval
  followed by interruption does not authorize a resumed deposit.
- Reconciliation is remote read-only: bounded transaction/receipt/canonical block
  and correlated balance reads, optionally appending safe local observations.
  Successful receipt must bind hash/from/to, exact calldata/value, canonical block
  and token/contract effects. A revert is not success and still consumed gas.
  Receipt pending/unavailable/corrupt stays unresolved; balance alone is not proof.
  Deposit receipt confirmed and API credit pending are separate outcome states.
  Never equate historical F1 zero-balance equality with general nonzero accounts.

Transport needs trusted fixed URLs, explicit allowlisted RPC methods, no redirects
or ambient credentials, bounded request/response bytes and fatal UTF-8/JSON decoding,
total header+body deadlines and cancellation that itself cannot hang completion.
Only explicitly read-only RPC/balance queries may retry, with finite backoff and
an owning process fuse that also covers filesystem cleanup. No SDK receipt waiter.
Fixed errors expose phase plus safe hashes/operation ID only; unknown is never
reported as no charge. No session token or journal-private locator in public logs.

## Seller withdrawal: independent burn and mint boundaries

Smallest proposed withdrawal scope is explicit amount to the captured seller's
own wallet on the same pinned Arc testnet, not a generic cross-chain sender.
Recipient must equal the validated signer/depositor; no listing lookup chooses a
key or destination. Buyer/session credentials never reach the seller helper.
Require independently available seller Gateway balance, exact requested amount,
an explicit maximum Gateway fee and destination gas ceiling. Conservatively bound
amount+maxFee by available and uint256 until exact debit semantics are verified.
No default 2.01 fee, zero-by-assumption fee, pending-credit withdrawal or all-funds
fallback. A read-only balances mode may display both wallet and Gateway categories.

Withdrawal is NOT F2 payment signing and NOT Wallet.withdraw(token). Preserve the
exact locally reviewed GatewayWallet/version1 domain and BurnIntent/TransferSpec
types from the installed source/reference, including domain IDs and all address
bytes32 fields; do not add F2's chainId/verifyingContract to this different domain.
Capture source/destination domain 26, wallet/minter/token, depositor/signer/self
recipient, value, fee limit, reviewed height bound, fresh salt, zero caller and
empty hookData. No remote hook, arbitrary contract or mutating signer callback.
Recover the signature against the captured fields before any submission.

Journal the exact public intent/hash/salt before signing, then submission intent
before the single /v1/transfer POST. This is a fund-authorizing mutation, even
though the next stage is called attestation. A lost response can mean funds were
committed; never re-sign with a new salt or retry that POST. If a valid response is
received, strictly decode and correlate its attestation to the captured intent
before preparing a single pinned gatewayMint transaction under the journal rules.
An API response is not a mined mint; print a withdrawal success only with matching
canonical receipt/effects and truthful before/after balance observations.

Concrete withdrawal release prerequisites still absent from inspected evidence:

1. Trusted Gateway Minter configuration/deployed-contract checks and an actual
   attestation format/verifier that proves all expected recipient/token/domain/
   amount/intent bindings, with valid and tampered protocol fixtures. SDK checks
   only presence of two byte strings; treating that as strict decoding is unsafe.
2. Verified BurnIntent fee/debit and maxBlockHeight semantics for a finite local
   policy. SDK/reference maxUint256 is an indefinite authority default, not a
   reviewed bounded expiry; do not invent a block/time conversion or zero fee.
3. A documented, authenticated/correlated remote read-only recovery path after a
   lost /transfer response (by retained intent hash/salt/ID), or an explicit
   unrecoverable-uncertainty limitation. Installed x402 UUID transfer queries do
   not demonstrate this burn-attestation capability. Do not invent a route or
   claim balance movement reconstructs a missing attestation. Even recovered
   evidence must not automatically trigger another mutation.
4. An explicit capability-storage policy if crash recovery needs attestation
   payload/signature bytes. F1's public-facts-only journal deliberately excludes
   signatures; silently adding bearer-capable material to it is not reuse.

These are technical source/contract verification gaps, not a request to read keys,
spend or prompt the owner now. Deposit and read-only balance machinery can be
built/tested independently. Until these are resolved, a safe partial F11 may
publish deposit/session CLI and accurately marked seller balance/reconciliation
support, but must not claim Task11 withdrawal acceptance or provide a success stub.
Never substitute the separate delayed trustless withdrawal as a hidden fallback.

## Session CLI, claims and focused local acceptance

Session CLI depends on frozen F9: strict finite calls 1–100, canonical budget and
per-call ceiling, required input/skill/seller/origin, captured account/rail/network
and sequential bounded calls. No deposit on open, insufficiency, error or close.
Stop on uncertainty; retain capability locally and report read-only recovery, not
fresh session/payment. F8's fixed session_settlement_uncertain 503 remains held
and has no terminal artifact/output. Only a validated persisted closed_receipt
can recover a lost close. Do not print tokens or close success in a finally block.
No session authority, funding mode or budget reset leaks into seller-funded hire.

Docs must distinguish wallet funds, Gateway available, pending batch, withdrawal
categories, hub budget/held and local issued-authorization exposure. A session is
a ceiling plus rail, not escrow/prepay/discount. Gateway acceptance/UUID and a
complete session receipt do not establish mined batch or withdrawable seller
credit. Closing does not move funds, settle a batch or refund child purchases.
No unconditional instant-withdrawal/one-batch/zero-total-fee claim. State the actual
selected ready testnet-only implementation; do not imply pending Arc mainnet works
merely because EIP-3009 is the intended future/default rail.

After source release, focused tests can run fully offline with existing Bun,
Vitest, Effect and viem plus injected transport/filesystem/clock/public dummy
signers. Root owns complete gates. Proposed genuine behavior checks:

- Import/help/malformed flags/read-only modes perform no credential/sign/send;
  exact versus target amounts, >2^53 and uint256 boundaries, changed account/config,
  hostile own-data objects, missing/duplicate balance rows and pending-only funds.
- Exact shortfall/no-op, allowance adequate/insufficient/changed, bounded aggregate
  gas against the single underlying pool, shortfall drift between approval/deposit,
  recovered actual RLP sender/chain/calldata/nonce and zero native deposit value.
- Actual private temporary files: permissions/symlinks, competing account claims,
  different-path bypass, partial/corrupt journals, sync/write/close failure, crash
  at each intent/send edge and preserved evidence after cancellation. Assert no
  mutation before durable checkpoint and at most one send per approved phase.
- Lost approval/deposit acknowledgement, wrong returned hash, rejected receipt,
  canonical-block mismatch, API credit lag and permanent read timeout: only bounded
  reads follow uncertainty; repeat Effect/direct invocation/restart never resend.
- Bounded HTTP streams, redirect/error/body/token/signature sentinels, cancellation
  with uncooperative cleanup and owning subprocess termination. No raw diagnostics.
- Withdrawal future contract tests must use a real validated protocol fixture,
  not a fake arbitrary hex attestation accepted by a stub: strict intent recovery,
  fee/height/address mutation, lost /transfer response, wrong attestation and lost
  mint acknowledgement. These tests cannot by themselves prove live redemption.
- F9-backed session CLI success, pending/uncertain call, lost/invalid close with
  read-only artifact recovery, exact header propagation and no implicit funding.

No tests were created or executed in this readiness. Existing F1/F2 evidence is
reported at its historical scope only; F11 helper/CLI/withdrawal/live acceptance
remains unimplemented and unproven. F1 authority stays consumed.
