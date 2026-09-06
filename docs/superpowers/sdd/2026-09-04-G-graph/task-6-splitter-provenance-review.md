> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 splitter provenance — independent local review

Reviewed 2026-09-06. **CLEAN within the retained provider-observation scope.** No activation, canonical listing binding, deployment authority, complete history or chain-state proof follows from this review.

## Scope and method

Read the complete 79-line probe, both retained records, both current G worktree Solidity contracts, the MAIN compiler artifacts, and the earlier G3 code addendum. Only local file inspection and fileless byte/hash/source-map calculations were performed. No probe execution, RPC, network, tests, compiler/build, Git or production mutation occurred.

The probe makes exactly ten sequential reads: one `eth_getCode` and four `eth_call` getters per splitter, all against `https://rpc.testnet.arc.io` at block `0x39dc271` (60670577). Its code-size check and full byte comparison mask only compiler-declared immutable spans, require repeated occurrences of each immutable to agree, and otherwise compare the entire runtime including its metadata trailer. The recorded successful responses are parent-observed, not independently re-fetched here.

## Independent correlations

Both artifact file hashes match the new records. Each artifact declares exactly one Solidity source; its keccak matches the actual current G source bytes. Compiler version is `0.8.28+commit.7893614a`, optimizer enabled/200 runs, Prague EVM, IPFS bytecode metadata, no linked runtime libraries. Recorded settings equal the artifact's structured metadata. The artifact's `rawMetadata` has the same source/compiler but is not literally identical to structured metadata: it preserves additional NatSpec/empty-output fields and `:forge-std/` rather than normalized `forge-std/` remapping. This is not a source-hash mismatch or a claim of a new independent compilation.

Each runtime has 17 disjoint, in-range, 32-byte immutable spans (544 bytes), all zero in the unbound artifact and immediately following `PUSH32`. Source-map locations tie every span to the named declaration or use below; no AST-name guess or arbitrary masked region was needed.

| Value | V1 reference ID / byte starts | V2 reference ID / byte starts |
| --- | --- | --- |
| usdc | 46: 279, 600, 904, 1150, 1356, 1561, 1684, 2024 | 469: 301, 656, 1152, 1398, 1836, 2033, 2156, 2494 |
| seller | 49: 153, 1103, 1977 | 472: 175, 1351, 2447 |
| treasury | 52: 328, 553, 737 | 475: 384, 609, 793 |
| feeBps | 55: 221, 1841, 2267 | 478: 243, 1711, 2312 |

All four retained getter responses are canonical 32-byte lower-case hex words and exactly equal their corresponding retained immutable words. Independently computed selectors are usdc `3e413bee`, seller `08551a53`, treasury `61d027b3`, feeBps `24a9d853`; all equal artifact selectors. Both bind USDC `0x3600000000000000000000000000000000000000` and fee 500. V1 seller and treasury both bind `0x3b2bbb840a9570223adbf2172a33bb77fe8d21af`; V2 seller and treasury both bind `0xcf821769ed3c0e55e152745377bb833d7155a78a`.

I independently inserted the retained words into only those declared spans of each local artifact, preserving every other byte. SHA-256 of the resulting lower-case `0x`-prefixed hex string equals both the new record and the earlier G3 fixed-block code observation:

| Splitter | Runtime bytes / unchanged bytes | Reconstructed and recorded runtime-hex SHA-256 |
| --- | --- | --- |
| V1 `0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206` | 2737 / 2193 | `75c418db437c1316c3711621790a31f1f3dda947f4e357623d3c9cd091c531af` |
| V2 `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf` | 3204 / 2660 | `5574e38dff28af481f3fc8d9e0c72ddf57f07a4e1767142ece5f582a22229a90` |

This verifies internal retained-evidence correlation, not independent raw-response reconstruction. No material predicate bug was found for these exact two artifacts/records. The probe is a fixed diagnostic, not a general adversarial RPC framework: it does not itself require disjoint/exactly-four spans (the actual artifacts do satisfy both), nor canonical 32-byte fee encoding (both actual records satisfy it).

## Limits

- Original raw runtime and raw response bodies were not retained. Their recorded hashes cannot independently authenticate what the provider sent; the local reconstruction is an algebraic match to recorded code hashes, not recovered RPC evidence. Response SHA-256 values were not independently recomputed.
- The fixed-block probe does not fetch a block header/state proof or chain ID. Same endpoint/block correlation with the earlier G3 records is not independent provider consensus, archive completeness, finality or a reorg-proof block-hash pin.
- Source equivalence is to these retained compiler artifacts and current source bytes, not a newly reproduced compiler toolchain. Runtime comparison includes the artifact trailer without independently authenticating its external IPFS metadata origin.
- Getter/code observations do not prove constructor transaction history, ownership of a service/listing, suitability of an arbitrary announced splitter, full historical indexing coverage, actual settlement, treasury payout, or deployment/activation permission. The V2 tree event remains caller-supplied commitment data; bytecode identity does not authenticate off-chain child facts.

## Frozen input hashes

| Local input | SHA-256 |
| --- | --- |
| `internal/task6-splitter-code-probe.ts` | `3450d6e864d172330c1545fd81b5608813b2c6e13be3e1f259a4fcb27062db1a` |
| `internal/task6-splitter-code-evidence.json` | `83c5e85eb3558d5beffa2bb3de0cf1e90be051d5cf0237904aae1040126640b1` |
| `internal/task3-provenance-code-addendum.json` | `3133b53e9660b462fb1ad8a9f16ec094a5753d87b64b37ad792791c112f38ab3` |
| G `contracts/FeeSplitter.sol` | `89c4e642f92d94b1f536b72786f0e49a9681354e2f9cb8097e5bc02c6a2efdc6` |
| G `contracts/FeeSplitterV2.sol` | `2fffc2af0593acebea4c910fc9bf013149150773047b2bef664a4eed34bc5a16` |
| MAIN `contracts/out/FeeSplitter.sol/FeeSplitter.json` | `94af30d2f25f5f16520c5dac6a24a56a794b90cef7889e445764e40760a2ffa4` |
| MAIN `contracts/out/FeeSplitterV2.sol/FeeSplitterV2.json` | `0c0eb7789e7f82020755bd6dd15b588ab61f3cc92d158e98bf92bc36fc037e44` |

All reviewed inputs remained unchanged. The only authored file is this ignored review note. No source correction requested.
