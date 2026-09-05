> Historical G1 indexed-match checkpoint, September 5, 2026. Original retained unchanged; this public copy adds only this banner, with no body substitutions. The six-block observed gap is not full-sync or new direct-chain proof; subsequent source release remains parent-controlled.

# G1 later independent indexing / Arc-head observation

September 5, 2026. Exactly the two parent-authorized read-only requests were made:
one keyless GraphQL request to the acknowledged Studio endpoint, and one
`eth_blockNumber` request to the first public Arc-testnet RPC pinned in local
`config/chains/arc-testnet.json`. No other request, authorization header, cookie,
key retrieval, deploy, upload, payment, signature, source/public edit, Git action
or test/full gate was performed. This ignored report is the only new file.

## Result

**The exact known-runbook transaction now appears in indexed data.** The latest
list also includes both historical runbook transaction hashes, each with total
10,000 atomic units ($0.01 of 6-decimal USDC). The deployment CID matches the
acknowledged CID. The indexer's reported height is six blocks below the separately
observed current RPC head. This provides the previously missing indexed-match
observation; parent owns whether the G1 gate is accepted and G2–6 are released.
No source release or new live authority is inferred or exercised here.

This is Graph-returned historical event data, not a new independent direct-chain
receipt/log proof, a fresh payment, or an exact fully-synced assertion. Earlier
empty results and historical RPC receipt absence remain unchanged observations.

## Request bounds and chronology

Both requests began `2026-09-05T14:41:45.530Z`, concurrently. Each used a separate
15-second total response deadline, a 65,536-byte actual body cap, bounded chunks,
fatal UTF-8/JSON decoding, identity encoding, `redirect: error`, and
`credentials: omit`. No automatic retry or alternate RPC was configured. Responses
were projected to the requested public fields; unavailable/malformed responses
would have produced fixed local diagnostics, not provider text. The consuming
read exited 0 after both successful responses and reader cleanup.

1. Studio result observed `2026-09-05T14:41:46.576Z`: HTTP 200, 984 response bytes,
   valid data and no GraphQL errors member.
2. Arc head observed `2026-09-05T14:41:46.442Z`: HTTP 200, 45 response bytes,
   matching JSON-RPC 2.0 / id 1, no error member.

The requests were not a single atomic snapshot. The 134 ms separation and six-block
difference are recorded rather than presented as proof of exact synchronization.

## Studio data

Endpoint:
`https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.0.1-smoke`.
The document requests `_meta`, latest five settlements and the exact known hash:

```graphql
{
  _meta { deployment block { number hash } hasIndexingErrors }
  settlements(first: 5, orderBy: blockNumber, orderDirection: desc) {
    id buyer totalAtomic txHash
  }
  knownSettlement: settlements(first: 5, where: {
    txHash: "0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2"
  }) { id buyer totalAtomic txHash blockNumber }
}
```

Actual metadata:

```json
{"deployment":"QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8","block":{"number":60593637,"hash":"0xba9c8a058c6154849101164f04390fa08e511d53235c7f5b3fc4baf5bc639f1d"},"hasIndexingErrors":false}
```

Actual latest list, in returned order (two entries, not an invented five):

```json
[
  {"id":"0x6366215e96a33e97e4a177453c858e9b1b8639fcff4bb72e1e7dcf5459fc814316000000","buyer":"0xdaaca688ce93d6ea0bdf4cda9925c5526f3ca5e1","totalAtomic":"10000","txHash":"0x6366215e96a33e97e4a177453c858e9b1b8639fcff4bb72e1e7dcf5459fc8143"},
  {"id":"0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd218000000","buyer":"0xdaaca688ce93d6ea0bdf4cda9925c5526f3ca5e1","totalAtomic":"10000","txHash":"0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2"}
]
```

Actual exact-filter list:

```json
[
  {"id":"0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd218000000","buyer":"0xdaaca688ce93d6ea0bdf4cda9925c5526f3ca5e1","totalAtomic":"10000","txHash":"0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2","blockNumber":"53891400"}
]
```

The filtered hash exactly equals the known runbook hash, and total 10,000 agrees
with its recorded $0.01 call. The two latest hashes match the prior runbook
references. Seller/fee split amounts were not requested, so this query does not
independently confirm their historical 9,500/500 split. The entity IDs are retained
as returned; no direct log-index query or proof was added.

## Sole Arc RPC call

Local config read confirmed `id: arc-testnet`, `chainId: 5042002`,
`caip2: eip155:5042002` and first RPC `https://rpc.testnet.arc.io`.
The second listed RPC was not called. Exact request:

```json
{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}
```

Returned result: `0x39c95eb`, exactly **60,593,643**. Subtracting the indexer's
60,593,637 gives **6**. This uses the configured endpoint's head only; no separate
chain-ID request, block/receipt/log fetch, code read or balance request was made.

## Preserved limits and prior records

The 13:36 independent report's empty latest/known lists remain accurate for that
earlier time; its original bytes are unchanged. The parent's 13:45 authenticated
empty-list observation is not rewritten. This later keyless response demonstrates
that historical indexed data has now become available without proving why the
earlier public RPC receipt lookups returned no result.

The smoke still targets the acknowledged v1 pilot and ordinary Settled mapping.
This response does not establish V2 tree/registry coverage, decentralized
publication, Graph x402 access, permanent authentication/rate-limit policy or a
general paid-data verifier. It performs no new settlement and does not replace
historical evidence with a fresh transaction. Original report SHA256 remains
`972c999e44b41bfbb7d0b16945ae52a1c4aae05c98f8df7020ef5717d11b91b0`.
