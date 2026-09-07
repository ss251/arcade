# J7B3b — bounded Arc RPC and signing ports

Concrete chain/signing ports now connect the guarded executor to viem's actual
ABI/JSON-RPC decoding. They are tested with fake chain responses and a real
owned loopback HTTP server. No live RPC, owner key, transaction, payment or
deployment was used. Importing these modules does not discover deployments,
read keys, install a rail or advertise escrow.

## Transport and signer boundaries

The anonymous endpoint is fixed to Arc testnet. Each JSON-RPC exchange has a
five-second bound within the caller's existing new-action deadline, at most
131,072 request bytes and262,144 response bytes, strict JSON-RPC version/id,
closed result envelope and canonical quantity/hex types. No redirects,
credentials, compression, multicalls, viem cache or RPC retries are enabled.
The instance caps total dispatches at400. Stream/fetch cancellation also races
uncooperative injected IO; a late result cannot grant a later operation.
Malformed provider text or signed request data never enters returned errors.

The reader pins the previously implemented code/domain/fee/hook/job facts to
canonical finalized blocks. Provider EOA code and authorizationNonceUsed are
read at the captured job block, then its canonical identity is rechecked.
A mutable caller argument cannot change that block after the first read.
Evaluator latest/pending nonces are checked on the correct chain. Gas estimate
uses20% headroom, gas-price quote uses2x, priority fee is0; the resulting terms
must fit the caller's explicit gas ceiling and current native gas balance.
There is no implicit gas-budget increase or mainnet endpoint.

Only one proposal and signing entry are permitted. The evaluator signer is
acquired only when the durable executor reaches its post-intent signing step;
the account must match the configured evaluator. The supplied EIP1559 fields
must match the proposal exactly. Recovery validates the returned raw signature
before it can become the sole eligible broadcast. An unknown result or wrong
returned hash poisons the send entry; no retry or replacement is attempted.
Ports alone are not journal/admission authority: production must compose them
with the real durable executor, never call send as a separate shortcut.

Receipt polling is read-only: at most60 observations separated by bounded
one-second waits, inside the same operation deadline. Only missing/unfinalized
receipts are polled again. Other RPC failures, stale heads and reorgs refuse.
The separately fetched transaction and receipt-block identity/state still feed
the source-shaped monetary/hook proof, not a hash-only settlement assertion.
This is canonicality/finality relative to the configured trusted RPC, not a
consensus light client or defense against a dishonest RPC or hostile proxy admin.

## Verification and scope

TDD began with the missing chain module. The fixture emits real ABI-encoded
getter values and JSON-RPC hex quantities; the code must survive viem decoding,
not a hand-shaped PublicClient return. Tests cover wrong IDs/errors/redirects/
encoding/content sizes/types, malformed quantities, unknown/wrong-hash sends,
gas/balance/nonce/signer mismatch, stalled fetch/body, late signer acquisition,
read-only receipt backoff/reorg, captured block mutation and the400-call quota.

The real loopback integration composes actual HTTP streaming, SQLite journal,
provider signature codec, viem parsing and the coordinator for one fake-chain
budget transaction, then reopens the database and refuses a duplicate before
any additional RPC. The fixture uses generated local accounts and dummy code
identities. Its deliberate test-only fetch bridge does not add a configurable
production RPC destination or prove a live-chain transaction. Owned test
server/files are cleaned up in finally.

Focused28Vitest/1file/195ms and the loopback1Bun/278assertions/413ms passed.
Four-root strict checks passed with zero diagnostics. The sole full gate93159
passed:4,953Vitest/222files/69.20s,972Bun/71files/7,635assertions/172.26s,
root/web strict, client355ms and SSR178ms builds. Five code/test pins stayed
frozen; final scope/privacy audit includes12paths and the existing Task7 brief's
status correction. No full-suite replay or concurrent gate. No existing payment
validity, cap, replay or J5/F11 behavior changes. The Effect rail is still
unimplemented: current PaymentPayload is exact-only, ChallengeInput lacks the
request-bound input/version/provider-agent fields, and SettleTree lacks the
hub/output projection context. The next7B4 checkpoint must express those
contracts explicitly before Task8 hub/runner/admission and Task9 buyer work.
J4/J5 live and J6 treasury/contract-size pauses are unchanged. No push or spend.
