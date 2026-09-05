> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 independent protocol/vector review — September 6, 2026

Verdict: **CLEAN** for the retained protocol/source and unsigned-vector review,
with the evidence limits below. No contradictory protocol/vector finding. This is not withdrawal
implementation acceptance, deployed-code verification or live authority.

Read complete task11-withdrawal-protocol-evidence.md and task11-parent-decisions.md;
inspected the cited local packed encoders/validators, Burns, WithdrawalDelay,
TransferSpecHashes, relevant official codec fixtures, OpenAPI and technical guide.
Read the complete 381-line Mints.sol and three complete struct/constant definition
files supplied locally by root during this review, plus the exact packed
BurnIntentLib.encodeBurnIntent implementation.
Inspected installed Circle 3.2.0 client coordinates/withdraw/createBurnIntent and
x402 query methods. Only this ignored note was written. No network, keys,
signatures, wallet/API/RPC reads, transactions, test suite, Git or dependency
operation was performed. All shell calls used login:false; the only runtime
evaluation was unsigned in-memory encoding via `bun --no-env-file -e`.

## Independently recalculated unsigned vectors

Built fresh Buffer byte arrays rather than importing an SDK funding helper.
Unsigned integers were range-checked then encoded big-endian at explicit widths;
EVM addresses were independently zero-left-padded to 32 bytes. Concatenated all
15 fields in the retained TransferSpecLib.encodeTransferSpec header/footer order
(lines 372–455), then constructed the three wrappers defined in the evidence
note. Keccak-256 used the already installed viem. All four byte-length/hash
comparisons passed; no signature or Solidity test was evaluated.

| Synthetic encoding | Bytes | Recalculated Keccak-256 |
| --- | ---: | --- |
| TransferSpec | 340 | `0x9d6e6e7a00b22d847aa3e4ff5f82be38c71d91abb0e7e19a57953c66d478dd63` |
| Single attestation | 380 | `0x5a8b520f5d8098067e7ae3a385de7b9a8c6a1e6f97d3ee7d70c4d6620f0e4d16` |
| Singleton attestation set | 388 | `0x0bdb9e7b79bdbdc3b400677e8b068640e38a80ecc0eee67ca281ee8bbd2c5893` |
| Packed BurnIntent | 412 | `0xcff5ca655c547053771881b65a99f441c4fe589dab9a4f9940b8654ae22e91cf` |

Observed output: `UNSIGNED_VECTOR_MATCHES=4 FIELD_OFFSETS=15`, exit0.
These remain synthetic packed-byte hashes, NOT EIP-712 signing digests, Circle
attestations, funded amounts, approved fee caps or valid block windows.

Offsets independently accumulated from widths: magic0/4, version4/4,
sourceDomain8/4, destinationDomain12/4, sourceContract16/32,
destinationContract48/32, sourceToken80/32, destinationToken112/32,
sourceDepositor144/32, destinationRecipient176/32, sourceSigner208/32,
destinationCaller240/32, value272/32, salt304/32, hookLength336/4.
Every supplied address has twelve zero high bytes. Empty hook ends exactly at340.
Single-attestation spec starts at40 (height at4, length at36); singleton-set
attestation starts at8; packed-burn spec starts at72 (height4, fee36, length68).
The later supplied pinned TransferSpec.sol, Attestations.sol and BurnIntents.sol
definitions explicitly match these offsets, version1 and all four literal magics.
BurnIntentLib.sol:344–354 confirms the exact packed magic/height/fee/uint32 length/
spec construction. A second unsigned in-memory evaluation recomputed the four
bytes4 Keccak magic values from their source-documented circle.gateway labels:
`SOURCE_MAGIC_MATCHES=4`, exit0. No missing codec-definition limit remains.

Reproduction inputs are exactly the prior note: version1, domains26/26, installed
testnet Wallet/Minter/USDC coordinates, twenty 0x11 account bytes for depositor,
recipient and signer, caller zero, value123456, thirty-two 0x22 salt bytes, no hook,
burn height1120/fee50, independent destination height1010. No random input.

## Actual source checks and implementation consequences

1. **Attester recovery is a personal-message hash of a payload hash.**
   Mints.sol:262–267 calls
   `ECDSA.recover(keccak256(attestation).toEthSignedMessageHash(), signature)`
   then rejects unless isAttestationSigner returns true. The entire submitted
   single-or-set payload is hashed first. A later client must recover over the
   raw 32-byte hash with the Ethereum message prefix, not a 66-character hex
   string, the raw un-hashed payload or an EIP-712 structure. Current membership
   is mutable (owner add/remove) and requires verified pinned read evidence.
   No signer or signature was obtained or recovered during this review.

2. **The contract checks and the stricter local binding are distinct.**
   Mints gatewayMint checks pause/caller denylist, signature, parsed nonempty set,
   expiry, destination caller/domain/contract/token, positive value and recipient
   denylist. _mint marks the spec hash before minting through the selected mint
   authority, then emits AttestationUsed. The same-domain branch at321–328 checks
   ONLY sourceToken equals destinationToken. Its preceding comment mentioning
   source-contract consistency is not an implemented source-contract check.
   Keep exact full captured spec-byte equality; do not delegate that binding to
   the comment or treat a contract-accepted attestation as agreement with local
   source Wallet/depositor/signer/salt/value intent.

3. **Expiry is inclusive and chain-specific, not a fabricated seconds window.**
   Burns.sol:424–436 rejects source maxBlockHeight strictly below block.number
   and fee strictly above maxFee. Mints.sol:277–284 uses the same strict-lower
   expiry test on the destination. Equality is contract-valid. The technical
   guide:162–165 separately describes service acceptance at source current
   height plus withdrawalDelay. WithdrawalDelay.sol:45–69 exposes an owner-
   changeable block count. No current delay was read. Parent's explicit finite
   maximum delta/fee/gas inputs, fresh reads and refusal without extending the
   captured plan remain necessary. Source and destination heights need not equal.

4. **Value/fee and replay evidence remain separate observations.**
   Burns.sol:499–552 requests value+fee, may draw less, prioritizes burn over
   fee, and emits InsufficientBalance plus detailed GatewayBurned fields.
   Consequently source transaction success is not exact-debit proof. Mints
   emits destination delivery evidence separately. TransferSpecLib.getHash is
   ref.keccak(), distinct from getTypedDataHash; TransferSpecHashes' boolean
   exposes local replay usage, not API reservation state or sufficient delivery
   evidence. A false value does not authorize repeating an unknown POST.

5. **Normal-transfer UUID recovery has a documented but limited route.**
   OpenAPI paths101–193 provide POST /v1/transfer, GET /v1/transfer/{id} (UUID),
   and GET /v1/transferSpec/{transferSpecHash}. The first returns a transferId;
   the second describes nested attestation payload/signature/expiration when
   forwarding is disabled; the third's complete schema1506–1581 contains only
   the spec. The retained path inventory has no normal-transfer list/search or
   spec-hash-to-UUID/attestation route, client request ID or idempotency field.
   This is a documentation-scope absence, not proof no private support mechanism
   exists. Unknown response loss stays unresolved; no POST replay/new salt.
   Installed SDK getTransferById/searchTransfers explicitly call /x402/transfers,
   NOT the normal-transfer route, so those methods cannot fill this gap.

6. **OpenAPI irregularity and sensitive recovery material are correctly bounded.**
   TransferDetailsResponse.properties places summaries in burnIntents, while
   required lists their three fields at top level. The prior note correctly
   identifies that contradiction. Future strict parsing must intentionally use
   the reviewed bounded nested shape, reject unexpected variants and bind it to
   original intent bytes. No live response resolved that documentation defect.
   BearerAuth is declared for other operations; neither these normal-transfer
   operations nor a global security requirement uses it. A UUID can therefore
   retrieve mint-capable material in the documented route and is not ordinary
   public x402 receipt evidence. Parent's default facts-only/no-UUID-persistence
   policy deliberately trades away crash recovery; no automatic phase follows.

7. **Installed convenience code does not satisfy the approved boundary.**
   Circle3.2.0 client:1234–1372 uses default maxFee2.01, checks available against
   value alone, assigns maxUint256 height and a new salt, signs, posts then trusts
   response attestation/signature for gatewayMint and waits for a receipt.
   Do not inherit these steps into the explicit one-shot implementation. No
   zero Arc fee, deployment identity or fund movement was established here.

## Exact provenance and limits

The initial scratch is a flat retained public-source collection, not a complete
repository checkout. The evidence note attributes contracts to commit
fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8 (release1.3.0). This reviewer did not
independently fetch/verify Git history or deployment bytecode. Root supplied
Mints.sol and the initially missing TransferSpec.sol, Attestations.sol,
BurnIntents.sol and BurnIntentLib.sol from that pinned official source; all five
supplied hashes were independently matched before reviewing the requested
definitions/encoder. Those source gaps were resolved before this report froze.
No complete-contract build, dependency audit, Solidity execution or deployed
behavior is inferred from this bounded source match.

Installed package metadata says @circle-fin/x402-batching3.2.0. OpenAPI info
version1.0.0 and embedded generation commit
e87dab6cd6f6e3e9142aef92fd3c34bd3f513080 were read locally. No private generation
repository access. Local SHA-256 inventory:

```text
d7ff5adf0c84d8b7a9c3e467c7f7661bfa36de195bd2acd4b0b8b650839a3544  task-11-withdrawal-protocol-evidence.md
4e851438f6f40661bb4561eae8d56a6994e74c8a9fca0ee884aca360d64c23d9  task-11-parent-decisions.md
fb54dd40f1a3e2ecec6ef0233b73a1e96c90c8f3f2110c6b1d1bbb38c64e168e  installed Circle3.2.0 dist/client/index.js
c70e4dbab97343d57bfaa5895d1f3bba09b63914e49e80b4a04c495841396cc0  TransferSpecLib.sol
b3b1faa9f7cdb34fb6cb5b0a9348e4dcaca84580a1ec2f52a9dd75bdc646627d  AttestationLib.sol
e3b44a6549e2872d39f83b147bc9b07862b8f378eec9903cfafba5b8a4914a69  Burns.sol
8aee9e2518927a3b741ae82095537f5354c6e09a86d54b810cd5b61f6cac80b7  WithdrawalDelay.sol
17120df482b5c750f0489667956a57fb5e228ae592f6594a38cb6c6a6c43dd70  TransferSpecHashes.sol
fdb8c12f8fc9c71827c46794ab76a2d1edb9a8981df3991f683bee55b4866161  Attestation.t.sol
cc7d7c291a3732f33e1d5655926b786dd5c294a7b430807eda46ef8243f50090  TransferPayloadTestUtils.sol
beb7cf136fa3331d241249c8eaf5c179d849b285dc698b5b06ee27a97e556d97  Mints.sol
400c85d2260878fb64761ce4bad36ab8ba0fccbcb416f9ffd4ffb8a215e5c43d  TransferSpec.sol
c85e108b4415da3041ce05933c969b8ff69253517d54fd84877b1499dd988b2f  Attestations.sol
a3292b8d95f5841e0688c804718ea2a03297ef24e435879697fc32d87bebf502  BurnIntents.sol
9041224a2aef24b00b1b6f178c103fb2bb8f6a4b969c0c9f46cf52dcc7aa0b2f  BurnIntentLib.sol
3743f5486306a186bd5a9231225bdad6f182172873490c6f85528a2bae00622b  technical-guide.md
b697cb61f4389b91db872fb84aaf649f5432eca7308e29e8a6bc2a8dc8de98d9  gateway.yaml
```

Not observed: deployed code/proxy identity, actual signer membership, pause/
denylist/token authority state, current withdrawalDelay, source/destination
heights, Arc fees/estimate, API wire response, usable signature, replay state,
balance, transaction, burn or mint. No live acceptance or renewed F1 authority.
F8 getter review takes priority when released. No owner request is needed here.
