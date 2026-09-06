> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G3 retained provenance review — September 6, 2026

Verdict: **CLEAN for internal correlation of this fixed, provider-reported
checkpoint**, with the limitations below. Not independent deployment/code or
historical-coverage acceptance. No source correction requested.

Read all1090 lines of the retained private provenance snapshot (not published), SHA-256
`e1449ef911db39bdcbdb4796484db204a9a76ec62d51d434361e805f3814ace5`.
Scope:3 initial summaries,14 later explorer records with response hashes and
10 RPC records. A fileless Bun diagnostic independently compared the retained
fields and the three staged registry ABIs; it performed no network or test-suite
execution. The only write is this ignored review. No keys, Git, source, dependency,
activation, signing, deployment, build or full gate was used.

## Correlations checked

- Recorded eth_chainId is5042002. All three ERC-1967 implementation-slot reads
  use the same exact slot and explicit block60670577. The slot and Upgraded topic0
  were independently derived locally with keccak256, not merely copied literals.
- Each explorer getLogs request selects its exact emitting proxy and that upper
  block. Both returned entries bind the same address and Upgraded topic, empty
  data and padded implementation word. The two trailing null topic placeholders
  are explorer representation, not extra indexed event arguments. Their block
  order is increasing and bounded by the observed RPC block.
- Each later upgrade word matches that proxy's RPC slot and the address requested
  by the retained current-implementation ABI fetch. Exact selected event count is
  eight: Identity4 (including Transfer), Reputation2 and Validation2. Full event
  name/type/anonymous and ordered input name/type/indexed fields match the staged
  JSON; only redundant internalType was removed, and it separately agrees with
  type for every selected primitive input.

| Registry | Creation block asserted by explorer | Later upgrade block | Current implementation observed in slot |
| --- | --- | --- | --- |
| Identity |29241340|30069662|`0x7274e874ca62410a93bd8bf61c69d8045e399c02`|
| Reputation |29241344|30069670|`0x16e0fa7f7c56b9a767e34b192b51f921be31da34`|
| Validation |29241349|30069677|`0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99`|

For all three, first upgrade log block/transaction/timestamp match the explorer
creation record. Its implementation word also matches the first constructor
argument: the shared initial address `0xd53de688e0b0ad436fbdbda00036832ff6499234`.
Proxy-only source ABI contains Upgraded, not the registry business events.

The three registry creation receipt reads and pilot creation receipt read are
null. The pilot's block53890408/creation transaction remains an explorer assertion.
The V2 receipt is non-null: status1, contract creation (`to:null`), exact expected
address `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`, transaction
`0x34f657969d408d4d5d00848c5d0933d40ae7914859a4d6aeb976cd765d2d88f4`,
creator and block60460646 agree with the explorer creation result. Its recorded
block hash is`0x7154fcdbb70739df4714e58c4adebdd2723c10f49f4e0f11a6627e91d5f262ac`.
No emitted settlement or splitter runtime-code identity follows from that receipt.

## Required claim limits

1. This projection does not retain complete raw HTTP bodies, so the reviewer
   checked hash/byte-field shapes but cannot recompute their raw response hashes.
   Those hashes identify the parent's original reads, not independent authenticity.
2. RPC and explorer responses remain provider assertions. The storage pin uses a
   block number without a retained block hash/header or state proof. Upgrade logs
   were not independently correlated to archival RPC receipts; a two-entry explorer
   result is not proof of complete/nontruncated upgrade history.
3. The initial common implementation is not proved to be a **dummy** by this
   artifact: its code, ABI and source are absent. Current explorer implementation
   ABIs do not establish behavior before the later upgrades. Do not apply them to
   pre-upgrade history or claim full creation-to-head event coverage on this alone.
4. Null old receipts mean unavailable from this observation, not failed/nonexistent
   deployments. The V2 getsourcecode result is empty; successful creation receipt
   does not prove runtime bytecode equals local FeeSplitterV2 or its USDC binding.
5. The three current event subsets are now corroborated by the retained explorer
   implementation responses plus slot/log address correlation. This is narrower
   than independently code-verified deployment ABIs and supplies no new activation,
   live indexing, canonical listing assignment or funding authority. Parent's later
   source/code corroboration is a separate checkpoint, not silently included here.

All five frozen ABI/check paths were left unchanged. Original ABI report remains
historical; its inactive/local-candidate scope is not rewritten by this review.
