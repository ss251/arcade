# Task 1 — public rail contract, ordered challenges and dispatch

Base d46f588. Execute the approved PlanJ Task1 with the executing-plans skill,
using the existing isolated worktree and installed pinned dependencies. The
owner's single-threaded/one-full-gate rule overrides skill suggestions to spawn
reviewers or rerun a full baseline. No new key, provider or chain operation.

Split into1A public manifest fields and1B hub challenge/verification routing.
Each is a small independently gated commit. Use the existing Effect3.22.0 schema
patterns and canonical toPublicListing constructor; do not spread private
manifests or alter shouldSettle. Context7 is not exposed in this task's active
tools; the prior Effectv3 source pin and installed3.22.0 source are available.

## 1A — metadata contract

Add optional rails (nonempty/unique subset gateway,eip3009,erc8183) and six-value
Circle category. Keep omissions off the public wire so old listing metadata is
not invented. Publish the immutable default rail list gateway/eip3009 for the
challenge consumer. Omitted category will mean INFRASTRUCTURE at discovery time.

PlanJ explicitly changes tags from five printable strings to up to ten lowercase
slugs. Make tags optional with an empty default; reject invalid tags rather than
normalizing seller input. Update old limit assertions/property generators and
seller docs. Expand secrecy properties to carry the newly public fields while
retaining every private canary. This checkpoint does not activate any rail.

## 1B — ordered advertised/built intersection

Reuse built Rails, existing challenge methods and verification implementations.
Order Gateway,exact,escrow; never advertise escrow by default or dispatch to an
unbuilt/unlisted rail. Select against the echoed accepted requirements, then
recompute trusted listing requirements before verification. Preserve the chosen
rail through deferred runJob settlement, not merely verification. Unknown schemes
must not fall through to exact. Keep fake test-mode traffic isolated from real
rails; session and child-call contracts need explicit regression coverage.

Circle seller skills and current primary documentation were read before source
work. The [seller integration guide](https://developers.circle.com/gateway/nanopayments/howtos/x402-seller)
describes Gateway plus existing exact options in one accepts array and preserves
Gateway EIP-712 metadata. The [seller quickstart](https://developers.circle.com/gateway/nanopayments/quickstarts/seller)
settles in middleware; ARCADE must retain its own verified-then-run-then-settle
flow, not adopt that pre-execution settlement timing. The current supported
[chain table](https://developers.circle.com/gateway/references/supported-blockchains)
lists Arc testnet/domain26. The skill's old supported-networks URL was unavailable;
the canonical index supplied this current table. No transaction followed a URL hint.

## Later-task issues to verify, not silently paper over

- The plan's cited ERC-8183 rejection requires Submitted, but it promises immediate
  refund after runner loss while Funded. Inspect the pinned actual contract before
  implementing the failure branch or claiming immediate refunds.
- Current [nanopayments documentation](https://developers.circle.com/gateway/nanopayments)
  says EOA signatures are required, not ERC-1271. Task4 must prove the actual
  Circle CLI payer/signing behavior; do not assume a contract-wallet payer.
- The existing hub returns queued202 and a private result poll capability. Task4
  must verify actual Circle CLI handling; a queued acknowledgement alone cannot
  be reported as the plan's completed200 paid result.
- The pinned Circle plugin now has18 skills, not the earlier plan's16. Ingest MCP
  fixed-tool listings, not a generic unrestricted listing per whole server.

These checks do not block the inert metadata/challenge tasks. Escrow deployment
and later live proofs remain NOT_RUN. No prior one-shot approval is replayable.
