> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 bounded deployment-identity review — September 6, 2026

Verdict: **Wallet identity predicate demonstrated; Minter identity UNAVAILABLE
against the pinned release artifact.** Both documented proxies match. This is a
concrete technical mismatch, not a request for funding/owner action and not a
finding that Circle's deployed Minter is unsafe. F11 source remains held.

Read the complete 185-line implementation split, source handoff, retained
independent protocol review and relevant protocol evidence/inventory. Local
scratch contains 14 source/doc files, not deployment artifacts or a full build.
The installed SDK3.2.0 coordinate evidence is retained; no SDK funding helper ran.

## Public primary evidence and exact comparison

The current [Circle address table](https://developers.circle.com/gateway/references/contract-addresses)
still identifies Arc Testnet/domain26 Wallet
`0x0077777d7EBA4688BDeF3E311b846F25870A19B9` and Minter
`0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`, linking both to Arcscan.
An official address listing establishes the selected coordinates, not source
equality. No other network or contract was substituted.

The [pinned repository](https://github.com/circlefin/evm-gateway-contracts/tree/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8)
has committed deployment artifacts and a deployment validator. Its complete
public recursive tree returned 235 entries, truncated=false. The release is
contracts1.3.0 at commit `fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8`.
No Git command, clone, install, compiler or upstream script was executed.

Read the complete [deployment validator](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/script/003_DeployedContractValidation.s.sol),
[compilation script](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/scripts/compile-artifacts.sh)
and [Foundry settings](https://github.com/circlefin/evm-gateway-contracts/blob/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/foundry.toml).
The validator compares proxy code, implementation-slot value and implementation
code. It globally zeroes occurrences of the implementation address to accommodate
UUPS immutables. The proposed client must instead bind only artifact-declared
offsets; do not copy that broad search/replace rule or invoke its environment-
dependent state checks. Split compilation uses viaIR only for implementations.
Artifact metadata says solc0.8.29+commit.ab55807c, optimizer150, Cancun, IPFS
metadata; both implementation artifacts specify viaIR=true and no linked libraries.

The three JSON files were fetched from exact pinned raw GitHub URLs, parsed and
hashed in memory. Their Git blob hashes independently match the official tree:

| Artifact under script/compiled-contract-artifacts | SHA-256 of exact JSON | Git blob SHA-1 |
| --- | --- | --- |
| ERC1967Proxy.json | `ac9f6df68b4fa325145e76f0dee232b98fe2a29a41db399f21695e760ee59570` | `4a1e5de8ffde07ca1805a15c9c3a6a165bea6af5` |
| GatewayWallet.json | `6638429a9ba19ea7f0a1f76a4ffe3d8ddb8d384445966dd38cbd05dce07033c6` | `af604d800b350d4b5f597de170989863f3d41eca` |
| GatewayMinter.json | `2c80edc746fdb941ac6c7214b0d6619eedf3c76fdddc0e76c6cffe65a85f76c8` | `a9852d2826eeb9b3b5062b109b7c8c4913c2e366` |

Metadata source Keccak hashes independently match exact pinned GatewayWallet,
GatewayMinter, GatewayCommon, Burns and Mints source bytes (six comparisons because
GatewayCommon appears twice). Burns/Mints SHA-256 also match the retained source
inventory. The pinned OpenZeppelin-upgradeable submodule commit is
`3d5fa5c24c411112bab47bec25cfa9ad0af0e6e8`; its complete
[UUPSUpgradeable.sol](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/3d5fa5c24c411112bab47bec25cfa9ad0af0e6e8/contracts/proxy/utils/UUPSUpgradeable.sol)
was read. Its `__self = address(this)` immutable explains the declared self-address
words; source Keccak `0xd861907d1168dcaec2a7846edbaed12feb8bad2d6781dba987be01374f90b495`
matches both artifacts. SHA-256 is
`ec92f11010f4f6eed10c4ec4e2e92954be244bab7faa0dfdf3244692fcc1bb20`.
This is officially source-linked artifact evidence with selected source-hash
cross-checks, NOT an independently reproduced complete compiler build.

## Actual public RPC observation

Completed at 2026-09-05T22:13:21.355Z / September6 03:43:21 IST, using only
`https://rpc.testnet.arc.io`. It returned chain `0x4cef52` =5042002 and finalized
block `0x39d63a8` =60646312, hash
`0x6b50f9b03aaa5ab8253234ef4c5a9119ad4069490791fa5afc3f7597f32ce373`,
timestamp2026-09-05T22:13:18Z. All code/storage calls used that exact block number;
a final block-number read returned the same hash. This is a single public RPC's
finalized observation, not a separately validated consensus proof.

Exactly nine RPC requests: eth_chainId; eth_getBlockByNumber(finalized,false);
for each pinned proxy eth_getCode, eth_getStorageAt(implementation slot), then
eth_getCode(resolved implementation); and eth_getBlockByNumber(0x39d63a8,false).
No eth_call, balances, account state, owner/attester/delay query, signing, estimate,
Gateway API or transaction method was called. RPC request timeouts were15s,
redirects forbidden and no automatic retry. Only public code/storage bytes were
hashed with installed viem through `bun --no-env-file -e`.

Implementation slot, independently checked against upstream validator:
`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`.
Each returned word has twelve zero high bytes and a nonzero low20-byte address.

| Role | Observed implementation | Runtime bytes | Result |
| --- | --- | ---: | --- |
| Wallet | `0xa33d52b46964495ea6e2bb09ce85faed05776e28` | 22818 | Exact artifact match after declared immutable binding |
| Minter | `0x9ef4c7ad4f577be713972310e655337bfd0b84bf` | 12101 | MISMATCH: artifact is11528 bytes |

Both proxy runtimes are exactly163 bytes and equal the entire pinned proxy
artifact, including metadata. Proxy Keccak:
`0x874a21508289bf01ee9802032607ae53ba0a4f47f28143a8493921b8db102187`.

Wallet artifact unbound runtime Keccak:
`0xbe79daa02f5d5359b4f6118d70b72e10ddd1c87b63e9e4ee39fdafa9bb2c2cbf`.
Its declared immutable ID2025 has two32-byte words at byte offsets3708 and4382.
Both artifact words are zero; both observed words exactly equal the resolved
implementation address padded with twelve zero bytes. Substituting only these
two words produces the entire observed runtime, Keccak:
`0x69ed7283bbdb751a492d5e4320bd99db7ff6b9ef911afb2032521a59526706b4`.

Minter artifact unbound runtime Keccak:
`0x3b600440271648adb765c4dea90282c6d4e8fd317ee693c4804f31cc0ecb5f61`.
Its declared ID2025 words are at1683 and1982, width32. Binding them to the observed
Minter implementation produces expected Keccak:
`0x10144174070caf9d5da11caa0bef2aeaffd6a6d9db73416f245570dc293ebd62`.
Actual implementation Keccak is different:
`0x0c479785c0c0f5a450bcf3200c854db9da6e4b585a5b694ca4eac85396cc28f5`.
The actual bytes at those offsets are executable bytes, not those expected words;
this cannot be fixed by the approved immutable substitution. No metadata stripping,
fuzzy ABI match or promotion of this observed hash into trusted release identity.

## Smallest reproducible runtime predicate and exact remaining gap

1. Ship a reviewed immutable deployment record with chain/domain, the two official
   proxy coordinates, expected whole proxy artifact hash, implementation artifact
   source commit/hash, runtime length/hash and declared self-word offsets. Raw
   provider/explorer data cannot create or replace this trust record.
2. At a fresh selected finalized block, require chain equality; read each proxy
   code and EIP-1967 slot; require exact proxy code equality and canonical nonzero
   implementation address, distinct from proxy. Read that implementation code at
   the same block. Reject truncation, malformed quantities/hex, unresolved slots,
   unsupported layouts and any nonidentical runtime outside declared immutables.
3. Bind each declared32-byte immutable to the resolved implementation itself,
   then compare the entire code, including metadata. Do not mask arbitrary bytes,
   accept a nonempty code response, or trust a reported contract/version name.
   Record implementation/whole observed hash/block hash as public evidence, never
   treat a new observed hash as an automatically accepted baseline.
4. Recheck block canonicality and fresh proxy/implementation identity immediately
   before each later authorized mutation. A checked historical block is no guarantee
   against an intervening upgrade. Use an approved block-hash read form if supported;
   this review exercised number-pinned reads plus a hash recheck only.

The Wallet leg is reproducibly supported by the exact official artifact at the
observed block. The Minter leg is not. The specific remaining task is to obtain
an officially source-linked artifact/reproducible compiler input for the observed
Minter implementation, compare its entire bytecode with precisely declared
immutables, then review the source delta affecting the accepted withdrawal codec,
attester and mint predicates. Same source with a different compiler build is
possible but was NOT established. Neither a release label nor Arcscan's verified
badge alone would establish equality to the accepted source. Do not guess a
release or relax the current predicate. Until resolved, a combined deployment
gate returns unavailable and withdrawal mutation remains disabled. A separately
approved deposit-only identity requirement may use Wallet evidence without
claiming Minter acceptance; this note does not change that policy or release source.

No current attester membership, supported-token/mint authority, pause state,
withdrawal delay, balances, fees or transaction effects were observed. These
remain separate runtime prerequisites even after code identity passes. No funds
moved; F1 remains consumed, and live F11 is NOT RUN.

## Reproduction limits and input pins

Agent-reach main/dev/web/search references guided primary-source-only retrieval.
Repo-routed Circle/Arc/ethskills were not present in the available local catalog
or callable tool inventory; this review used the explicit pinned primary sources.
Built-in web read Circle's table and pinned README; raw/script/tree requests had
cache misses. Restricted curl DNS failed, then scoped credential-free public
requests succeeded with env-i, curl-q or Bun --no-env-file and login:false. One
initial artifact evaluator had a shell-quoting syntax error before execution;
the corrected unsigned in-memory evaluator exited0. The code comparison also
exited0 while explicitly reporting Minter match=false; it was an observation
program, not a claimed passing integration test. A single built-in Arcscan API
open was rejected by the web tool; no explorer verification response was obtained.
No broader release search followed. No fetched files were retained, and only this
ignored note was written. No owner files/keys, Git, dependency change, source/test
edit, tests/full suite, Studio action, signing or send was performed.

Read-input SHA-256 pins:

```text
6250c6ecea88c2daeef8d56b9bc78920cf5ad6076867e5ddb1b043670f7c906a  task11-implementation-split.md
d2e9e7501c2540a44e8729a1c7cacc785faf7a974af621d08b215bfb0415d4e7  task11-source-handoff.md
afc146a776f497dd374cddcd731c5002fe2dab3d8a77c9690d5d9c533734d334  task11-independent-protocol-review.md
d7ff5adf0c84d8b7a9c3e467c7f7661bfa36de195bd2acd4b0b8b650839a3544  task11-withdrawal-protocol-evidence.md
```

## Supplemental retained primary record — September 6, 2026

Parent requested inspectable source before approving production identity constants.
The original174-line checkpoint above remains unchanged, SHA-256
`46944b77e38882192b9c3132557c0bfa5d0ec819b5136375312f7ebb42007066`.
Its statement that no fetched files were retained describes that checkpoint;
this supplement now retains the already-fetched in-memory public bytes below.
No new network/RPC/explorer/release/source fetch, test, Git or live action occurred.

Fresh owned temporary directory: `[private temporary public-source directory]`.
All files were created through apply_patch, never executed. Exact UTF-8 byte
comparison against the prior in-memory responses passed5/5. The three Circle
source files additionally matched their previously retrieved pinned-tree Git
blob hashes3/3, calculated locally without Git. The UUPS source matches its
earlier SHA-256/metadata source hash. The JSON is a derived projection, not an
upstream complete artifact or independently compiled output.

| Retained complete file | Lines / bytes | SHA-256 |
| --- | --- | --- |
| `003_DeployedContractValidation.s.sol` (retained public-source input) | 201 /9903 | `34460bdca9141880509fa7a53d3a49df78247aac33c73fd7723a64b254d99406` |
| `compile-artifacts.sh` (retained public-source input) | 56 /1854 | `b1e651bf06c1c79bcf0f8f60c2b33c5a834245f4aac3702990aa5b53d83646ad` |
| `foundry.toml` (retained public-source input) | 38 /1508 | `00a5d39857e4fd6a16a714a7405905cbb8793a49ff4d011bcac4d26728728bd6` |
| `UUPSUpgradeable.sol` (retained public-source input) | 153 /6598 | `ec92f11010f4f6eed10c4ec4e2e92954be244bab7faa0dfdf3244692fcc1bb20` |
| `artifact-projection.json` (retained public-source input) | 239 /9707 | `a77dc2945800c3dd8f9e1b14a7fa8b7d571c94d84aca40d4090313bca793c6da` |

The projection retains all three artifact file/blob hashes, compiler version,
complete parsed settings/remappings/compilation target/libraries, whole runtime
length/hash, declared immutable/link references, relevant metadata source hashes
and URLs, six successful exact source comparisons, and the UUPS source pin.
ERC1967Proxy's immutableReferences field was absent in the upstream projection;
its full runtime is compared without normalization. Wallet's two32-byte offsets
are3708/4382 and Minter's are1683/1982. These are zero-based byte offsets into
deployedBytecode.object, not creation code or character positions. Only those
declared words are bound to the implementation address; the rest of the runtime,
including metadata, must remain byte-identical. No huge artifact JSON was retained.

The local retention/hash command used Bun --no-env-file with login:false and
exited0. This was byte/provenance verification only, not a compiler, source test
or fresh deployed-code observation. Wallet acceptance remains block-scoped;
Minter's previously observed mismatch and the unavailable mutation gate are
unchanged. This supplement does not approve constants or release F11 source.
