# J5C1 — Reproduced Arc testnet Minter identity

The historical F11 Minter artifact mismatch now has a concrete explanation and
a reproduced whole-bytecode match. This checkpoint adds evidence and a read-only
reproduction tool, **not** a funding run or change to F11's accepted identities.
J4 live remains paused; no authorization lifetime/cap/replay policy changed.

## Independent observations and reproduction

At2026-09-07T02:18:42.463Z, nine anonymous RPC reads at finalized block60842464
(hash0x37dc6fb7c3a601ed0ad34361d35b3b9ebd03d4869e29a8d545804b724f8e7c1d)
confirmed the same Wallet/Minter proxy and implementation identities as the
[F11 historical review](../2026-09-04-F-gateway-sessions/task-11-deployment-identity-review.md).
Coordinates are [Circle's official Arc testnet deployment](https://developers.circle.com/gateway/references/contract-addresses).

The [Minter explorer source API](https://testnet.arcscan.app/api/v2/smart-contracts/0x9ef4c7ad4f577be713972310e655337bfd0b84bf)
provided36source files and compiler settings. With pinned solc0.8.29
(ab55807c), optimizer150, Cancun, IPFS metadata and **viaIR omitted/false**,
compilation produced exactly12101runtime bytes. Binding only the compiler's
three declared32-byte zero UUPS self words at offsets3634,3675,3968 gives
Keccak0x0c479785c0c0f5a450bcf3200c854db9da6e4b585a5b694ca4eac85396cc28f5,
identical to the independently read deployed code, including its metadata tail.
Unbound runtime hash is0xdbe0b31fd3677a8d7d5f6e729e8247115b7a041e1e5d8d958dd8b18e06747aca.
No metadata trimming, fuzzy matching or observed-hash promotion was used.

Full input hashes, source comparisons, compiler settings/offsets, finalized
readback and outcome are in the [public JSON](../../../evidence/J/unified-minter-source.json).
The exact source-bundle SHA-256 is
a96005ae9f46468a9490e70a7bea54699790ad80486cb96ee14bc634a9e36b62.
The tool refuses changed source bundles/compiler versions before compilation.
Compiler installed only in a fresh temporary directory with lifecycle scripts
disabled; no root dependency/lockfile changes or upstream deployment scripts.

## Reviewed source delta

Compared all36source Keccak hashes against the [official release1.3.0 artifact](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/script/compiled-contract-artifacts/GatewayMinter.json):
34are identical, including Mints, attestation/transfer codecs, replay-state,
ECDSA, token support, denylist, pausing and UUPS modules. Two source differences
were read in full:

- GatewayMinter: release1.3.0 adds RenounceOwnershipDisabled and overrides the
  owner-only renounceOwnership function to revert; deployed source inherits
  Ownable's owner-only renunciation. This is a real administrative-control
  difference, not whitespace. It does not authorize a buyer/delegate to renounce
  Circle ownership or alter the mint predicates.
- GatewayCommon: release1.3.0 adds the InsufficientBalance event declaration
  and its documentation. No additional executable code in this source delta.

The release artifact uses viaIR=true and11528runtime bytes, hence is not this
deployment's build. Older Jan16 artifact11619bytes also did not match. This
source review resolves which code is deployed; it is not a complete external
security audit or a claim that all Gateway administrative risks are absent.
Existing F11 runtime acceptance is intentionally unchanged in this checkpoint.

## Reproduce without wallets

Install exact solc0.8.29 in an isolated directory with package-manager lifecycle
scripts disabled, following [Solidity's compiler distribution guidance](https://docs.soliditylang.org/en/v0.8.29/installing-solidity.html).
Then, from the repo, with only PATH, HOME and TMPDIR in the process environment:

```sh
bun --no-env-file scripts/verify-gateway-minter-source.ts \
  --solc-module /absolute/compiler-scratch/node_modules/solc/index.js
```

The explicit module must identify0.8.29+commit.ab55807c.Emscripten.clang. Two
bounded anonymous reads retrieve the pinned source bundle and release artifact.
The tool prints source hashes/settings and full-match evidence; it neither reads
wallet environment nor signs/sends. Current on-chain readback is a separate
prerequisite and must be refreshed before any authorized live operation.

## Retained failures and verification

IPFS metadata retrieval timed out; direct explorer source succeeded. The first
combined compiler/GitHub comparison compiled but timed out retrieving the
artifact; bounded raw.githubusercontent.com retrieval then succeeded. An early
scratch calculation incorrectly compared the metadata JSON SHA-256 to the IPFS
CID digest (DAG-PB/UnixFS, not raw JSON). The final tool checks the complete
compiler-emitted metadata tail instead; no bytes are discarded. One TypeScript
literal-array includes typing error was corrected with explicit URL equality.

13native boundary tests/29assertions/93ms passed before that type-only correction;
the final focused check passed13tests/29assertions/72ms and two-rootstrict0.
Actual checked-in source reproduction passed. The initial privacy heuristic
mistook slash-separated environment variable names for a personal home path;
only that documentation spelling was corrected. Sole sequential full gate59809
PASS:4,825Vitest/214files/66.56s;915Bun/61files/6,555assertions/172.65s;
root/web strict; client358ms/SSR174ms. Both code/test pins stayed unchanged;
six-path/27local-link scope/privacy audit passed. Final audit/atomic commit and
exact one-commit fast-forward follow. No grant, deposit, burn
signature, mint, payment, real key acquisition, agent, mainnet action or push.

Next: enforce this reviewed identity in the separately guarded J5C proof/runtime,
add fresh-owned write-ahead grant/deposit/delivery/paid-call evidence, gate it,
and only then consume the pre-approved testnet actions. J6 contracts/deploy
script follows and still stops at the explicit owner treasury checkpoint.
