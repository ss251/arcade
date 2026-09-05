> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 proposed implementation split and frozen-interface checklist

September 6, 2026. Preparation only: source remains held until the reviewed F10
commit and parent release. This note is the only write. No new protocol research,
network, test/vector execution, credential, signing, funding, Git, dependency or
full-suite action occurred. All API names below are proposals, not implemented
exports or live authority.

Read the complete current source handoff/parent decisions, retained independent
protocol inventory, actual buyer CLI/package exports, F1 gate/runtime/journal and
CLI fuse/tests, and the relevant ENS bounded reader/write-ahead patterns. The
retained unsigned codecs and source commits need not be downloaded again.

## Disjoint ownership within the approved 9 +4 paths

| Slice | Exact paths | First integration dependency |
| --- | --- | --- |
| Pure policy/codecs | buyer/src/gateway-funding.ts; buyer/src/gateway-withdrawal.ts; buyer/test/gateway-funding.test.ts; buyer/test/gateway-withdrawal.test.ts | None: browser-safe data, no Bun, env, signer, fetch or journal IO. |
| Journal + runtime | buyer/src/gateway-funding-journal.ts; buyer/src/gateway-funding-runtime.ts; buyer/test/gateway-funding-runtime.bun.test.ts | Agreed pure types/digests/error codes and checked transaction/attestation projections. One owner for both files avoids state-machine drift. |
| Strict entry points/session adapter/docs | buyer/src/gateway-funding-cli.ts; buyer/src/session-cli.ts; buyer/src/cli.ts; scripts/gateway-withdraw.ts; docs/sessions.md; buyer/test/gateway-funding-cli.bun.test.ts | Fixed runtime facade plus then-frozen F9 public Promise API. |

All buyer paths above have the `packages/` prefix. No root export/dependency,
core/rail/server/MCP edit is proposed. The existing package wildcard already
supports separate subpath imports; Bun-only files must never enter the default
buyer/browser import graph. Each test file has one owner. Parent coordinates
source freeze, cross-slice review and full gates; no author publishes a stub as
successful funding while another slice remains incomplete.

## Pure contract to agree before parallel code

`gateway-funding.ts` owns `FundingAuthority`, closed operator requests, validated
snapshots/plans, public facts/events/outcomes and fixed local failure codes.
Retain parseFundingAmount/decodeFundingSnapshot/planDeposit/planWithdrawal.
Authority is the pinned Arc-testnet deployment and canonical account, not a URL,
contract or recipient copied from provider data. Six-decimal canonical parsing,
uint256 bounds, exact mode versus minimum-available/max-deposit, explicit gas/fee/
height caps and shared native/token gas arithmetic are enforced here.

A FundingSnapshot distinguishes wallet token/native funds, selected Gateway
available/pending/withdrawal categories, allowance and each observed block/time.
Missing evidence is unavailable, never zero. A plan freezes operator policy and
the exact shortfall/value, caps and public snapshot bindings; later drift refuses
instead of rewriting it. The operation digest binds canonical authority, closed
operator request and a public unique operation identifier. The later plan digest
also binds computed shortfall/snapshot. This lets account ownership be acquired
before asynchronous shortfall preparation without changing operation identity.

`gateway-withdrawal.ts` owns exact separate BurnIntent/TransferSpec/attestation
types, encoders/decoders, hashes and expiry/binding predicates. Preserve
decodeAndBindWithdrawalAttestation, but name its output as parsed/bound evidence,
not live mint authority: runtime must additionally recover the correct personal-
message signer and check current pinned-Minter membership. Use the retained
340/380/388/412-byte vectors and full captured-spec equality, including address
padding/caller/hook. No F2 domain reuse, raw capability journaling or guessed
source/destination time conversion.

Both pure modules consume copied own scalar/JSON/byte inputs, reject accessors/
coercions and bound work before encoding. A closed FundingPublicOutcome union
uses the agreed noop/confirmed/credit_pending/delivery_confirmed/
source_debit_pending/uncertain/refused categories plus bounded public facts.
No unknown error, normal-transfer UUID, attestation/signature/raw signed bytes or
mint calldata belongs in public outcomes/events. A bigint-safe explicit encoder
is shared by CLI and journal; neither uses arbitrary object serialization.

## Runtime seam: captured IO, not a pretend verified callback

Propose a synchronous `createFundingOperation(request, deps)` returning a frozen
single-operation facade with executeDepositOnce, requestWithdrawalOnce,
mintWithdrawalOnce, reconcileOperationReadOnly, publicState and close. Retain
inspectFunding as an independent keyless read entry. Request/authority/dependency
callbacks are captured once; factories do not perform IO or read environment.

Dependency groups are explicit: monotonic clock; deadline/AbortSignal-aware
bounded read RPC and exact Gateway HTTP; account-claim/journal factory; and lazy
`acquireSigner` returning only address/signTransaction/signTypedData. Signing
callbacks are not send callbacks. Distinct low-level sendRawTransaction and
normalTransferPost adapters are used once by the runtime, with retry disabled.
Reads return bounded unknown RPC/wire data for real runtime decoding, not an
injected `preflightPassed:true`. Tests can supply inert adapters; production
constructs them only from pinned endpoints/config and never accepts CLI overrides.

Preflight verifies selected chain/account/token/contracts, correlated balances,
allowance, gas/nonce bounds, fresh heights and actual withdrawal delay. Plan and
stage intents are durably appended before the corresponding signer/dispatch
boundary. Signed transaction bytes are parsed/recovered in memory and compared
against exact sender/chain/to/value/data/gas; local hash and calldata hash are
durable before one send. Burn signing has a durable finite intent before entry.
Any unknown signing/send/journal result latches uncertainty and blocks later
mutations. Repeating/concurrently evaluating a method cannot obtain another
attempt; a new facade cannot bypass the persisted account claim.

Keep the normal-transfer UUID and validated mint-capable bytes in the runtime
closure only, never in its enumerable facade/publicState/errors. requestOnce may
retain them for explicit same-process mintOnce or bounded read-only recovery.
There is no string UUID CLI flag or journal resurrection of that capability.
Process loss/complete POST reply loss is honestly non-resumable. Reconciliation
returns public observed facts; it never signs, advances a stage into mutation,
releases ownership or silently invokes mint. Delivery, source debit/fee and API
credit are separate predicates. A successful receipt alone is insufficient.

All async boundaries share the absolute operation budget, with finite phase
timeouts, active checks before signer/send, late-result cancellation and bounded
close. The CLI owns an outer hard fuse that remains active through final cleanup.
Numeric operational fee/gas/burn-height defaults are not invented by this split.

## Account-claim and journal contract

Propose `openFundingJournal({authority, operationDigest, journalPath}, trustedIO)`
returning an opaque lease: snapshot/readHead, append(expectedHead, closedEvent),
close and explicit finalizeTerminal(expectedHead, validatedTerminalFacts).
append serializes and validates legal transitions, sequence/previous-event hash,
operation identity and immutable plan/stage coordinates before write + file fsync.
An I/O/flush/close ambiguity poisons the lease; stale expectedHead refuses.

The production namespace must be fixed independently of journalPath: recommend
one application state root derived from the current OS user's trusted home
record, then chain5042002/canonical-account, rather than HOME/CLI journal-dir
overrides. Parent should freeze this exact root before coding. Only the trusted
test filesystem adapter substitutes an owned temporary root. This is cooperative
local account ownership, not cross-machine or malicious-same-OS-user exclusion.

Create an exclusive no-follow 0600 active claim under verified owned0700
non-symlink directories. Its closed facts bind account/chain/operation digest and
the canonical journal locator digest. Acquire and fsync claim/parent before
asynchronous mutation preparation, then fresh exclusive journal/header + fsync.
If journal creation fails after claiming, retain uncertainty/claim; never erase
it as startup cleanup. Refuse existing claims even for another supplied journal
filename, PID death, same digest or apparent empty journal. Validate regular
files via nonblocking open/fstat before bounded reads; no FIFO hang or truncation
repair. Re-check retained descriptor identity when finalizing ownership.

close only drains/closes descriptors and never unlocks. Only explicit terminal
finalization after validated completion may durably retire the matching claim;
reconciliation/startup/timeout cannot trigger it. Preserve journals and a
finalization fact. The parser must distinguish this operation from read-only
reconciliation; its exact spelling is a parent interface choice, not authority
to add an implicit unlock path. A validated zero-shortfall no-op remains signer-
free and cannot be confused with unknown approval/deposit/withdrawal state.

## Entry-point integration and focused proof order

The present buyer CLI runs on import and reads its key before executing the
legacy Effect. Move that execution behind import.meta.main and route the strict
reserved command union before any legacy key/parser/error path. Preserve the
ordinary branch; new commands never inherit permissive positional fallback or
Cause.pretty. gateway-withdraw.ts supplies only the seller-key role to the same
strict handler. Help/invalid/explicit-address read-only paths cannot invoke lazy
signer acquisition. Session-cli consumes frozen openSessionPromise and quote/
call/status/close; it never implements a second session transport or funds on
failure, and retains in-process capability for explicit read-only close recovery.

Offline proof order: pure vectors/policy first; actual temp-file account-claim
races across different paths and write/fsync/close poisoning; injected staged
preflight/one-send/no-late-restart outcomes; then real import/help/invalid/read-only
child tests and strict reserved-command routing. Runtime tests cover missing
capability recovery, exact approval/shortfall, shared pool gas, event correlation
and separate credit/delivery/debit. Every child is awaited/reaped through bounded
TERM-to-KILL cleanup. No extra fixture path is required: inert child sources can
be test-owned temporary files or documented injected adapters within the four
approved test files. Exact new-root strict checks precede parent full gates.

F1 is a pattern only: openGateJournal is filename-exclusive, not account-wide;
its safeEvidence permits a public x402 transferId, which is forbidden for normal
withdrawal recovery UUIDs; its numeric deposit/gas/validity limits and consumed
approval do not transfer. ENS journal lock removal/secret persistence are also
not this facts-only unresolved-claim contract. Do not import either mutating
runtime as the F11 implementation.

The retained inventory has no currently accepted deployed-code/proxy fingerprint
or live membership/delay/balance/fee observation. Nonempty eth_getCode alone must
not be labelled a source/deployment match. Freeze the concrete read-only identity
predicate with parent before enabling that runtime mutation gate; until evidence
is adequate, return unavailable, not a success stub. This is a technical runtime
prerequisite, not a request for owner funding or new research in this task.

## Read-input pins

Handoff d2e9e7501c2540a44e8729a1c7cacc785faf7a974af621d08b215bfb0415d4e7;
current decisions ca210047793f9c22b7548488ebe0bb52b30fefc94a62385ec38413aef695d53f.
F1 runtime4286ca844855b16219ca8c2bbce88feaeca4a16b052567e2213f74c2da2579e9;
F1 entryc860cb1b7f4e6b7947c66f99f87cb34094ef63e3765ff8563bab783e2a70c3bd.
Legacy buyer CLI fc1aa4d70ccacd3c20898a4e34fa934053fa651fda53e7568169305891eaddfb;
current F9 lifecycle1c91030172feb22a57b371977f33d378dfefdb5434f077c5eff83a150892c56d.
All retained protocol/source/vector limits from the accepted handoff remain;
nothing was re-downloaded, rerun or newly verified on chain for this note.
