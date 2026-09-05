# Sessions and explicit Gateway funding

These interfaces are prepared for Arc testnet (`eip155:5042002`). A session is a
hub-enforced spending ceiling, not escrow, a deposit, a discount, or an automatic
funding instruction. The session API and funding runtime are separate. Neither
opens, tops up, withdraws from, or retries the other on failure.

F11/F12 live execution has **not run**. The earlier F1 live approval was consumed
by its recorded operation; it does not authorize these commands. Examples below
are templates, not instructions to move funds. Uppercase placeholders must be
replaced by independently reviewed values; there are no numeric gas, fee, height,
amount, or destination defaults.

## Balances and evidence

Keep these quantities separate:

- Wallet USDC is the six-decimal token balance on the selected chain. Gas caps
  are native atomic units (wei); they are not six-decimal token amounts.
- Gateway API `available` is an observed Gateway credit balance. Onchain Gateway
  `totalBalance` is a different observation. Pending, withdrawing, or withdrawable
  values remain unknown when the upstream evidence does not provide them.
- Hub spent/held/remaining describe that session's admitted calls. The buyer also
  retains locally issued, confirmed, and unconfirmed exposure. A stale hub view
  cannot erase local issued exposure.
- A Gateway payment transfer UUID is not a mined batch transaction hash. Session
  completion accounts for admitted roots; it is not graph-wide finality or proof
  that all Gateway proceeds are already withdrawable.

Closing a session does not withdraw Gateway credit. Seller-funded child hires
remain separate sessionless jobs; session ID/token authority is never inherited
by those children.

## Keyless inspection and reconciliation

Run from the repository root with the installed Bun runtime. Bun's automatic
dotenv loading is disabled in these invocations.

```sh
bun --no-env-file packages/buyer/src/cli.ts gateway-balance --address ADDRESS
bun --no-env-file packages/buyer/src/cli.ts gateway-reconcile \
  --address ADDRESS --journal /ABS/PRIVATE/EXISTING-JOURNAL.jsonl
bun --no-env-file packages/buyer/src/cli.ts gateway-finalize \
  --address ADDRESS --journal /ABS/PRIVATE/EXISTING-JOURNAL.jsonl
```

Inspection, reconciliation, and finalization never acquire a signer. Reconcile
reads an existing operation and its evidence; it does not replay, resume, replace,
or create an operation. An `observed` balance result is inspection success only.
It is not mutation or withdrawal success.

Finalization is an explicit local journal/claim mutation after independently
validated terminal evidence. An unsigned refusal or no-op additionally requires
the owning journal's clean-close witness. For a signed complete operation, exact
terminal effects and the complete matching stage/hash journal and claim may
replace a missing witness; durable poison still refuses. It does not sign or
send. An uncertain operation cannot be finalized merely because the process
stopped or a timeout elapsed.

## Explicit deposit

```sh
bun --no-env-file packages/buyer/src/cli.ts gateway-deposit \
  --address ADDRESS --journal /ABS/PRIVATE/FRESH-JOURNAL.jsonl \
  --amount USDC --gas-cap-wei INTEGER
```

Alternatively, choose the distinct target mode with both bounds:

```sh
bun --no-env-file packages/buyer/src/cli.ts gateway-deposit \
  --address ADDRESS --journal /ABS/PRIVATE/FRESH-JOURNAL.jsonl \
  --minimum-available USDC --max-deposit USDC --gas-cap-wei INTEGER
```

Exact and target modes cannot be combined. The amount parser uses exact canonical
six-decimal arithmetic, not floating-point conversion. Target mode can yield a
validated no-op; it does not authorize a deposit beyond `max-deposit`. The gas
cap is an aggregate operator policy across necessary transactions, not a promise
of actual cost. Any needed allowance is exact and bounded; no unlimited approval
is implicit. An approval alone is not deposit success.

Current credit-attribution evidence is incomplete: Circle's reviewed
`/v1/deposits` feed is pending-only. An available-balance increase or a disappearing
pending row does not independently attribute full credit to this deposit's
transaction. The runtime therefore retains `credit_pending` even when it has
independently confirmed the deposit and observed available funds. This means
proof and claim retirement remain pending, **not** that observed available funds
are unusable. Credited finalization requires supported exact correlated proof;
do not redeposit, retry, or delete the claim to bypass this technical limit.

The expected address is mandatory before account-claim acquisition. The runtime
validates pinned configuration and deployment identity before lazy signer entry,
then compares the signer to that address. The buyer entry uses only explicitly
provided `ARCADE_BUYER_KEY`; it has no key flag, Keychain fallback, or funding
fallback. Do not put private keys in arguments, files, or logs.

## Explicit withdrawal and the current identity refusal

```sh
bun --no-env-file scripts/gateway-withdraw.ts \
  --address ADDRESS --journal /ABS/PRIVATE/FRESH-JOURNAL.jsonl \
  --amount USDC --fee-cap USDC --max-burn-block-delta INTEGER \
  --gas-cap-wei INTEGER
```

The seller entry uses only explicitly provided `ARCADE_SELLER_KEY`. The equivalent
buyer command is `gateway-withdraw` through the buyer CLI and uses the buyer key.
There is no withdraw-all, positional default amount, request-only command, or
implicit maximum-height authorization.

This command explicitly authorizes two separate stages: one normal transfer
request, then at most one destination mint **only after** a validated `mint_ready`
result. It never mints after uncertainty. The private attestation capability stays
inside that operation's memory and is not emitted or written to the public-facts
journal. Losing it is not authority to request another transfer. The current
protocol does not establish a safe read-only reconstruction after a lost transfer
response; retain uncertainty rather than invent a recovery endpoint.

Withdrawal currently refuses because the observed Arc-testnet Minter runtime
does not match the reviewed artifact (12,101 observed bytes versus 11,528 in the
reviewed build). This is an identity mismatch, not a claim that the network is
unsupported. Both Wallet and Minter identity are required for withdrawal; deposit
uses the Wallet gate. No mismatch bypass or custom deployment flag is provided.

`delivery_confirmed` proves destination delivery only. `source_debit_pending` is
not complete withdrawal. Only correlated destination evidence, exact source
debit, and bounded actual fee support full `confirmed` status. Partial or uncertain
movement outcomes exit nonzero and must not trigger an automatic command retry.

## Journal ownership and deadlines

Funding requires an explicit fresh canonical absolute `.jsonl` journal path for
a new operation; existing journals cannot be overwritten. The parent must already
exist as an owned mode-0700 real directory, without symlink aliases. The chosen
journal path does not select or override the separate account-claim root.
Journals retain bounded public policy, hashes,
stage facts, and evidence—not private keys, signed transactions, mint calldata,
attestation capabilities, or provider diagnostics.

The per-account claim is in the OS account home namespace
`.arcade-gateway-funding/v1/eip155-5042002/ADDRESS/active.claim`, with the account
address canonicalized to lowercase. It is derived from OS account identity, not
the `HOME` environment value or a CLI override. A copied journal or a second
process cannot create a second owner. Closing a file/process does not unlock this
claim; use explicit validated finalization. Do not delete claims to force retries.

The owning command has a five-minute soft cancellation deadline and a
five-and-a-half-minute hard process fuse, including output and cleanup. Individual
runtime reads have additional bounds. A timeout after signing or dispatch is an
unknown outcome, not proof of no charge. No automatic request/send retry exists.

## Bounded session batch

```sh
bun --no-env-file packages/buyer/src/cli.ts session \
  --hub ORIGIN --address ADDRESS --budget USDC --calls COUNT \
  --skill SKILL_ID --seller SERVICE_NAME --rail gateway \
  --input '{"field":"reviewed-value"}'
```

All eight flags are mandatory. `seller` is the existing service name, not a payout
address. `COUNT` is 1–100. `--input` is an explicitly supplied bounded JSON object;
the same captured input is used for each call. The explicit rail is `gateway`,
`eip3009`, or `test`; the test rail is simulated, not mined evidence. The hub is
an HTTPS origin or a literal-loopback HTTP origin, without credentials, path,
query, or fragment. The session does not perform a separate funding check or
deposit on failure.

This is a thin adapter over the existing F9 Promise API: one open, sequential
bounded calls, then one close after all requested calls succeed. Original
authorization, cumulative exposure, protected capability, and polling rules stay
in that SDK. The adapter additionally binds the returned closed receipt to its
locally observed ordered job IDs and authorized amounts. Raw seller output and
private session/job capabilities are not printed.

A failed or uncertain call stops the batch without automatic close, reopen,
deposit, or retry. A lost close reply remains uncertain. A programmatic caller
retaining `createSessionCliController` may explicitly call `status()` or
`recoverClosed()`; recovery uses the same private in-process handle's read-only
status and never sends a second close. The batch command itself does not retry
close. There is no serialized capability file or interactive resume protocol:
process exit loses that private handle, and the printed session ID alone cannot
recover its authority.
