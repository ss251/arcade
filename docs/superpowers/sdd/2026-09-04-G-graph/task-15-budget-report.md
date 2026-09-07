# G15A offline reservation boundary

This checkpoint implements only the [released offline scope](task-15-budget-brief.md).
G15 live remains **NOT_RUN**. No payer lookup, signature, RPC, network query,
reservation write, cache, paid dispatch or new Arc purchase was executed.

## Contract

The fixed policy carries the recorded public payer, Base8453 native USDC,
merchant, plan-default subject, Agent0 subgraph,10000-atomic per-query amount,
global10/evidence5 limits and900000 floor. It is not new owner authorization.
Every record is an unresolved reservation, including unsigned-looking failures.
No quota reset/refund exists. Video can use the remainder of the global limit;
evidence can never exceed five. A new run directory is not implemented as an
authority namespace.

The decoder accepts a canonical JSONL header binding the policy digest and at
most ten sequential, SHA256-chained records. Rows have exactly sequence,
previousHash, allocation, queryHash, amountAtomic and hash, in that order.
Unknown/duplicate keys, alternate spellings, wrong amounts/policy, torn tails,
duplicate query digests and altered chains refuse. The query digest is opaque
at this stage: no claim it already binds a validated GraphQL request or result.
Hash-chain consistency detects accidental corruption, not a malicious owner's
rewriting/truncation to another complete prefix; a durable head/claim and
query/result binding remain required before signing.

File audit requires a canonical absolute path, private owned700 parent,
regular owned600 single-link file, no parent/leaf aliases, at most32768 bytes,
nonblocking/no-follow open, stable inode/size/timestamps and exact UTF-8 bytes.
It only reads/closes. It is not a hostile-filesystem sandbox or proof that
unrelated processes cannot change local storage after the audit.

The arithmetic helper rejects anything below910000 before a possible10000
debit and accepts only canonical uint256 atomic strings. It does not obtain or
authenticate a fresh RPC balance or protect against unrelated wallet spending.

## CLI

`./scripts/e2e-graph-cogs.sh --help` exits0 without runtime work.
No arguments prints an incomplete status and exits1. An explicit
`--audit-reservations /absolute/private/reservations.jsonl` reports only
validated local counts/hash with liveEvidence NOT_RUN and exits1 even on a valid
file. Missing/corrupt state refuses; no implicit creation or refresh. Invalid,
live and reset flags exit2 before external command resolution in the shell.
Errors are fixed codes and never echo private file paths or provider data.

Do not use the audit file argument as production authority. The later writer
must choose one fixed non-disposable namespace; a complete artifact replay must
avoid key lookup and be labelled historical, not fresh runner execution.

## Executed checks

Initial Red: the new module was absent. First implementation passed13 focused
Bun tests/83 assertions. Review then reproduced an actual byte-integrity bug:
the UTF-8 decoder silently removed a leading BOM. The new regression failed
because the audit accepted changed bytes; exact round-trip validation fixed it.
Final focused selection: **14 tests,88 assertions,205ms**, including real
owned-temp mode/alias/size checks and native inert CLI processes. Exact two-root
strict checking reported zero diagnostics. No wallet or remote fixture used.

The sole sequential four-worker full gate28601 passed:5327 Vitest tests across
242 files in69.03s;1436 Bun tests across98 files with12050 assertions in196.23s;
root/web strict checks; client/SSR builds333/170ms. No duplicate full gate.
Final review covers eight paths and four added local links, with no privacy
heuristic matches; the three scripts, brief and shot-list hashes stay frozen
while these three result records are annotated.

No full paid-evidence or durable-budget claim is made. The literal plan's
live-success commit subject would be false here, so this is a separate offline
implementation commit.

## Next three implementation steps

1. Fixed-namespace exclusive cross-process claim, durable reservation/head
   writes before signable work, restart/uncertainty refusal and failure-injection
   tests. No automatic stale-lock takeover or reservation reclamation.
2. Exact bounded balance RPC and challenge/response recorder around the existing
   client, plus independently validated per-query caches and no-key complete
   artifact replay. Stop for a narrow source-hook decision if transparent
   recording cannot preserve existing response validation.
3. Review the completed harness and live authority before any paid sequence.
   Resolve latest testnet-only wording against the retained Base exception;
   a new Arc-settled G15 demonstration still needs separate owner authorization.
