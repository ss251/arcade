# J11C2 — public escrow receipt display

Implements the [read-only brief](task-11c2-brief.md) after
[J11C1](task-11c1-report.md), with no new payment authority.

## Implementation

The browser-inert public reader accepts only coherent Arc-testnet root escrow
observations with an explicit non-session marker, no sweep, positive uint256
job ID/amount, lowercase nonzero contract/seller/hashes, the current 500-bps
quoted allocation and state-specific matching terminal amounts. Settled needs
its on-chain kind/hash; refunded needs its principal/refund hash; uncertain
contains no terminal movement. Nested fields are closed, own/enumerable data;
no getters, coercion, prototypes or unknown serialization behavior execute.
Projection is copied/frozen. This checks reported consistency, not chain truth.

H4 carries the projection and the independent skill-page boundary rechecks it.
Malformed/missing escrow evidence retains an otherwise valid quoted receipt
as evidence unavailable, clears its settled claim and all escrow locators, and
does not convert a missing record into confirmed zero/refund. Generic legacy
link policy stays exact-only; non-escrow records never acquire escrow metadata.
Compact descendants cannot inherit the root's rail or transaction links.

The display independently rechecks props, shows qualified state, exact numeric
on-chain job ID and reported escrow contract, and links only matching configured
Arc complete/refund references. It does not invent a job explorer endpoint.
Create/fund transaction references are not supplied by this public feed and
remain unavailable; this is not the spec's complete buyer lifecycle history.
Quoted allocation is separate from reported seller/fee/refund transfers; a
principal refund is not recovery of gas or other costs. Existing native
disclosure, layout, colors and address wrapping are reused, with no CSS change.
Browser signer, saved-job recovery, budgets, sessions, payment limits, caps,
replay protection and dependencies are untouched.

## Verification

Three initial genuine REDs reproduced H4 rejecting the new rail. A subsequent
test-only text assertion accounted for the job number's inline markup.
Final focused242Vitest7PASS5.10s, sequential actual route fixture; nine-root
strict0. Tests cover actual core Receipt → hub scrub → H4 → loader → render,
all three states, unavailable/malformed data, complete/refund URL mismatches,
uint256 width, private canaries, hostile descriptors and passive imports.
Existing H4, recovery and skill-page regression checks pass.

[Native browser observation](../../../evidence/J/public-escrow-browser.md)
records mobile/desktop, keyboard disclosure, malformed mode, bounded reads
and independently verified cleanup. No exported screenshots or real-chain
proof are claimed. Sole sequential four-worker full gate20753 PASS:
5,327Vitest242/69.89s;1,362Bun92/11,711assert191.65s; root/web strict,
client/SSR317ms/184ms. Fifteen-path audit146local links/privacy0/empty index;
nine source/test pins frozen before the gate and rechecked before atomic
commit/exact-one main FF. No full gate replay, squash or push.

## Remaining

The bounded offline J11 public web slice is implemented; live subgraph activation/redeploy and
Task10 escrow proof still require a usable approved deployment. J4/J5 live,
J6 treasury checkpoint and oversized implementation remain paused. Task12
offline docs/fixtures follow. No keys, RPC, spend, deployment, approval replay,
validity/cap change or push occurred.
