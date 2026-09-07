# J11 — offline escrow ledger and existing-design surface

Task10 live proof is deployment-blocked. Continue only offline portions of
[Task11](../../plans/2026-09-06-J-arc-native.md), single-threaded. No deployment
address, start block or indexed result may be invented from this implementation.

## Atomic checkpoints

1. J11A: exact local Solidity event subsets; additive EscrowJob/EscrowEvent
   schema, Settlement rail/provenance fields, existing exact mappings preserve
   their facts. Test Graph ABI parsing, Solidity layout, schema mutations and
   existing query compatibility; local codegen/WASM and actual legacy mapping
   tests. Keep the active manifest/source selection byte-for-byte unchanged.
2. J11B: inactive escrow/hook mappings and runtime tests. Use immutable
   transaction/log identities and explicit emitter/binding policy. Creation
   owns a job identity; missing history cannot invent roles or balances. Keep
   raw event observations separate from lifecycle summaries and terminal
   settlement proof. No automatic discovery or source activation.
3. J11C: existing-design web listing rail labels/filter and receipt evidence.
   Distinguish advertised rails, locally authorized funding and independently
   observed terminal settlement/refund. Do not add a browser escrow signer.
   Bound all decoded fields and explorer URLs; accessible labels/snapshots.

Each checkpoint has focused checks, one sequential four-worker full gate,
privacy/scope audit, atomic conventional commit and exact-one main fast-forward.
Keep SDD reports and progress committed; private handoff stays untracked.

## Evidence policy

ERC8183 events are pinned to the local reviewed implementation, not verified
deployed bytecode. Preserve full uint256 money/job identifiers and uint32 child
counts. Missing observation is null, not zero; a hook hash is supplied metadata,
not validation of off-chain execution. Refund and released funds come from their
own emitted records, never a remote status string or recomputed fee percentage.
Legacy splitter/nonce fields must be optional for escrow, with no fake splitter
or EIP-3009 nonce; old mappings still populate both exactly.

Proxy/hook activation and Studio v0.0.2 remain blocked until a usable approved
deployment, independently checked pins/start blocks and live evidence exist.
J4/J5 pauses and all payment validity/cap/replay protections stay unchanged.
