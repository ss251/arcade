> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 source handoff — September 6, 2026

Status: readiness proposal only; **F11 source remains held until F9/F10 gates**.
F9 stays funding-independent. F1 approval is consumed and its source/journal are
not reusable authority. No owner request, new research, source/test changes,
network, credentials, signing, Git, suite or unsigned-vector rerun occurred here.
All future live deposit/withdrawal/session execution remains **NOT RUN**.

## Smallest practical implementation boundary

Use installed dependencies and the existing buyer wildcard subpath export; do
not import Bun IO into the default buyer/browser entry point or add an automatic
`ensureGatewayDeposit` to callSkill/session/MCP. Proposed exact ownership:

| Path | Responsibility |
| --- | --- |
| `packages/buyer/src/gateway-funding.ts` | Browser-safe pinned authority, exact amount/balance decoding, immutable deposit/withdrawal policy inputs and fixed outcomes. |
| `packages/buyer/src/gateway-withdrawal.ts` | Pure separate BurnIntent types, packed spec/attestation codecs and exact binding/expiry predicates. No F2 signing-domain reuse. |
| `packages/buyer/src/gateway-funding-journal.ts` | Bun-only versioned facts journal, account-wide exclusive ownership, durable stage transitions and fail-closed recovery. |
| `packages/buyer/src/gateway-funding-runtime.ts` | Dependency-injected bounded reads, one-shot approval/deposit/normal-transfer/mint stages and read-only reconciliation. Credentials acquired only after strict mutation authorization. |
| `packages/buyer/src/gateway-funding-cli.ts` | Strict command parser, help/read-only branches, fixed output/error projection and deadline/cleanup wrapper for both funding entry points. |
| `packages/buyer/src/session-cli.ts` | Thin adapter to the eventual frozen F9 API; no funding or independent payment/session transport implementation. |
| `packages/buyer/src/cli.ts` | Minimal import-safe `import.meta.main` entry and reserved-command routing before legacy key/argument handling; preserve unrelated legacy behavior. |
| `scripts/gateway-withdraw.ts` | Thin import-safe seller-key entry to the shared strict withdrawal command; no SDK withdraw convenience call. |
| `docs/sessions.md` | Honest session/funding/evidence semantics and explicit live NOT RUN status. |

Public pure API proposal: `parseFundingAmount`, `decodeFundingSnapshot`,
`planDeposit`, `planWithdrawal`, `decodeAndBindWithdrawalAttestation`.
Runtime API proposal: `inspectFunding`, `executeDepositOnce`,
`requestWithdrawalOnce`, `mintWithdrawalOnce`, `reconcileOperationReadOnly`.
Return closed tagged outcomes (`noop`, `confirmed`, `credit_pending`,
`delivery_confirmed`, `source_debit_pending`, `uncertain`, `refused`), never
arbitrary errors or capability-bearing SDK responses. Names are handoff proposals,
not claims that these exports or a finished F9 CLI contract already exist.

The current legacy CLI executes at import and uses permissive argument/key/error
paths. Wrap its execution rather than copying those paths into new commands.
F1's import-safe help, fixed errors, no-retry transport, known-hash write-ahead and
outer hard-fuse patterns are useful precedents, not reusable F11 permissions or
journal semantics. Do not call the F1 CLI/runtime or inherit its numeric limits.

## Captured authority and explicit CLI policy

- Pin Arc testnet chain5042002/network`eip155:5042002`/domain26, USDC
  `0x3600000000000000000000000000000000000000`, Wallet
  `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, Minter
  `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`. Cross-check current core config;
  its schema lacks Minter, so a narrow funding deployment record can supply that
  pinned source coordinate without an unrelated core schema change. Pin trusted
  RPC/API origins; response data cannot choose chain, contract or payee.
- Require an explicit address for keyless balance/reconciliation commands.
  Import/help/invalid/read-only paths must not read a key or construct a signer.
  Reject duplicate/unknown/conflicting flags, missing values, coercions and
  malformed own-data fields. Amounts use canonical six-decimal bigint parsing,
  no Number, exponent, whitespace stripping, rounding or formatted-string parsing.
- `gateway-deposit --amount A` means exactly A, not “already funded.” A distinct
  `--minimum-available A --max-deposit B` mode freezes the validated exact shortfall.
  Zero shortfall is a validated signer-free no-op. Require explicit aggregate gas
  ceilings for mutations. Preserve available/pending/withdrawal categories;
  validate the selected token/domain/depositor row, never rows[0] or a total.
- Withdrawal requires explicit amount, finite maximum burn-block delta, fee cap
  and aggregate gas ceilings; no invented operational defaults. Destination is
  the captured signer itself on the same chain/domain, caller zero, hook empty.
  No withdraw-all, arbitrary recipient, bridge, mainnet switch, SDK retry loop,
  funding-on-error, positional fallback amount, key flag or MCP funding tool.

## Journal ownership and one-shot transitions

Use a fixed normalized chain/account namespace independent of any requested
journal filename. A 0700 non-symlink directory and exclusive no-follow 0600 active
claim bind exactly one operation digest; a second process/path cannot bypass it.
Keep a versioned append-only bounded journal with ordered states, hash validation,
serialized writes and file/parent fsync. Latch before the first asynchronous
mutation preparation. On uncertain write/fsync/close, poison the operation.
Never truncate, repair, overwrite or silently take over an existing claim/journal.
Only an explicit, policy-validated terminal finalization may release ownership;
startup, timeout, an absent transaction, or read-only reconciliation must not
implicitly unlock/restart it. Preserve historical journals.

Persist captured public facts, exact bounds, operation/spec/intent digests,
stage intent, nonce, expected calldata hash and locally derived transaction hash
before each send. Verify signed transaction sender/chain/to/value/calldata/gas
in memory first. Persist **no raw signed transaction, normal-transfer UUID,
attestation, signature or raw mint calldata**: mint calldata itself contains the
capability. Use calldata/payload hashes plus expected public effect facts instead.
Neither output nor exceptions/logging may leak these bytes, keys or raw bodies.

Deposit transitions: `planned → approval_prepared? → approval_submitted? →
approval_confirmed? → deposit_prepared → deposit_submitted → deposit_confirmed →
credit_pending/credit_observed`. Existing adequate allowance skips approval;
otherwise approve only the frozen exact amount, prove effects and re-read
allowance. No max approval/reset/revoke. Deposit only `deposit(USDC, amount)` with
native value0, never depositFor or a plain token transfer. Check wallet token
funds and Arc's shared native/token pool: amount×10^12 plus all authorized gas
must fit native funds. Drift that invalidates the frozen plan refuses, not adjusts.
Each submitted stage gets at most one broadcast. API credit lag does not justify
another deposit. Unknown approval cannot automatically continue into deposit.

Withdrawal transitions: `planned → burn_authorization_prepared →
normal_transfer_requested → attestation_validated → mint_prepared →
mint_submitted → delivery_confirmed → source_debit_reconciled`.
Capture finite source max height once; before signing require it at least fresh
source height + actual withdrawalDelay, and within the supplied maximum delta.
Do not extend/re-sign an expired window or convert an assumed block time.
Require available ≥ value + maxFee and validate actual fee evidence; missing fee
is not zero. Use the distinct GatewayWallet/version1 BurnIntent domain, not F2's
chainId/verifyingContract domain. One normal `/v1/transfer` POST with forwarding
disabled; no SDK maxUint/2.01 defaults, retry or new salt after uncertainty.

Validate the entire exact captured spec, bounds, zero high address padding,
wrapper/count/length/trailing bytes and destination expiry. Recover attester
over raw32-byte keccak(payload) with the Ethereum personal-message prefix, then
check current membership on the exact pinned runtime Minter. Never treat the
Mints same-domain source-contract comment as an implemented check. Mint is its
own write-ahead/send-once stage; destination delivery and source value+fee debit
are independently proved, including GatewayBurned fields/InsufficientBalance
and canonical receipt/token effects. A successful transaction alone is not proof.

Any uncertain stage stops all later mutation. Bounded read-only reconciliation
can use known transaction hashes; a retained validated normal UUID permits the
documented nested GET recovery, with capability kept only in bounded memory.
Complete POST reply loss or process loss of that UUID has no documented recovery
route: remain unresolved, no POST replay/spec-lookup-as-mint-authority/new salt.
Even successful read-only recovery does not automatically sign or advance stages.
No delayed-withdrawal fallback. Hard deadlines include cancellation and cleanup.

## Buildable offline checkpoints and evidence contract

1. Add pure policy/codec modules and focused Vitest files
   `packages/buyer/test/gateway-funding.test.ts` and
   `packages/buyer/test/gateway-withdrawal.test.ts`. Reuse the retained four
   unsigned synthetic vectors below, plus field/length/expiry/domain/cap rejection
   cases. No key, signature, RPC or deployed-code claim is needed for this stage.
2. Add journal/runtime with fake injected transports and owned-temp-directory Bun
   tests `packages/buyer/test/gateway-funding-runtime.bun.test.ts`. Prove account
   claim races across differing paths, symlinks, write/fsync/close poisoning,
   crash windows, no second send/sign, exact shortfall/allowance, shared gas funds,
   lost reply/hash mismatch and separate delivery/debit/credit states. Keep any
   signing tests to injected prebuilt synthetic bytes; no wallet/env acquisition.
3. Add import-safe entry points and `packages/buyer/test/gateway-funding-cli.bun.test.ts`
   for help/invalid/read-only zero-signer/zero-mutation behavior, fixed redaction,
   hard deadlines and cleanup. Wire the session adapter only after frozen F9
   evidence: dual headers on probe/retry/poll, captured budget/identity, no paid
   replay, retained private capability on uncertain close and read-only validated
   closed-artifact recovery. No automatic close/reopen/deposit on failure.
4. Run only released focused files with `bun --no-env-file x --no-install vitest run`
   or `bun --no-env-file test <explicit Bun files>`, plus strict checking of exact
   new roots using repository options. Later parent owns the full gate. Distinguish
   pure unsigned, fake transport, actual temp-file/process and any later loopback
   evidence; none establishes live funding or withdrawal success.

Retained vector results, **not rerun here**: TransferSpec340 bytes
`0x9d6e6e7a00b22d847aa3e4ff5f82be38c71d91abb0e7e19a57953c66d478dd63`;
single attestation380
`0x5a8b520f5d8098067e7ae3a385de7b9a8c6a1e6f97d3ee7d70c4d6620f0e4d16`;
singleton set388
`0x0bdb9e7b79bdbdc3b400677e8b068640e38a80ecc0eee67ca281ee8bbd2c5893`;
packed BurnIntent412
`0xcff5ca655c547053771881b65a99f441c4fe589dab9a4f9940b8654ae22e91cf`.
Fixture inputs/15 offsets/four magics are in the accepted independent report;
their values/heights/fees are synthetic, not authorized defaults or signatures.

Source limits remain Circle SDK3.2.0, contracts1.3.0 pinned
`fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8`, and retained OpenAPI1.0.0
generation commit`e87dab6cd6f6e3e9142aef92fd3c34bd3f513080`.
No current deployed/proxy match, attester, delay, fees, balance, API response,
signature or transaction was observed here. These remain future bounded read-only
runtime prerequisites before separately authorized live activity, not a present
owner request. Session docs must distinguish wallet/Gateway available/pending,
ceiling from escrow/prepay/discount, and transfer UUID from batch mining/source
debit. No instant withdrawal, one-batch, zero-total-fee or mainnet-ready claim.

## Read evidence inventory (SHA-256)

- `task-11-funding-readiness.md`: `993b3c204477c84f0a97b0a8a68b4f9f5cc85db61c1b1e0a45609530390fb06a`
- `task-11-parent-decisions.md`: `2677a62656756631adc4a2ee5d0d9b060db04aadc338aaba799288872419757d`
- `task-11-withdrawal-protocol-evidence.md`: `d7ff5adf0c84d8b7a9c3e467c7f7661bfa36de195bd2acd4b0b8b650839a3544`
- `task-11-independent-protocol-review.md`: `afc146a776f497dd374cddcd731c5002fe2dab3d8a77c9690d5d9c533734d334`

Also read actual Plan F Task11, current buyer CLI/package export, core chain config,
and F1 import-safe CLI/Bun runtime/test boundaries. No prior unsigned audit was
reperformed, no F11 test was run, and no implementation acceptance is asserted.
