# G6 — indexed A9 match

September 6, 2026, 05:07:47.534 UTC. This later record supersedes the
[indexing-pending checkpoint](task-6-live-brief.md) without changing its observations.
The acknowledged deployment is consumed; no upload, deployment or purchase was repeated.

## Observed result

One separately selected, keyless POST to the exact
[versioned Studio endpoint](https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0)
returned HTTP 200. The unchanged, independently reviewed strict verifier accepted:

- Deployment `QmWL6jCCNvRkmB3mvPaxvMH7931AvQ5Y7jmBzCJ2gdpjHF`, version `v0.1.0`.
- Indexed block **60694598**, hash
  `0x1e8ff29a2e39d39ce6943a2dee393e207545f65194e4256a60bab8b3baacd480`;
  `hasIndexingErrors: false`.
- Exactly the three selected A9 settlement occurrences below, with their pinned
  buyer, nonce, splitter, source, listing absence and emitted money fields.
- One unambiguous root tree occurrence, child count **2**, child total **60000**
  atomic USDC, occurrence count **1** and matching root transaction/log.
- Actual `marketplace: null`; all six queried registry/canonical tables empty.
  These are unavailable coverage, **not zero marketplace activity**.

| A9 occurrence | Block / log | Total / seller / fee (atomic USDC) |
| --- | --- | --- |
| [Root](https://testnet.arcscan.app/tx/0x0d02f5f9793bc7baede3d88b65666052be2b549bc10ea4024d74ecacce28e23d) | 60523612 / 49 | 300000 / 285000 / 15000 |
| [Child](https://testnet.arcscan.app/tx/0x315c65b65a03a4a7ab381263d22e7eaf1d435544486d71caac80037c52abf656) | 60523606 / 44 | 50000 / 47500 / 2500 |
| [Grandchild](https://testnet.arcscan.app/tx/0xe944dc51e6a14b762336bcc04bef9020b63368280c8207692792065fd23d3be3) | 60523599 / 45 | 10000 / 9500 / 500 |

Every occurrence comes from static splitter
`0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`, with no canonical listing link.
Occurrence IDs are the full transaction hash followed by the four-byte
little-endian log index: `31000000`, `2c000000`, `2d000000` respectively.
The observed tree ID is
`0x87cb3b5b32d849ebb6d5777ac247bdbdb15aa532b226fb86a591c491fa8f4a28`.
Root/tree/occurrence timestamps agree at `1788583083`; child and grandchild
timestamps are `1788583080` and `1788583076`. Those timestamps are newly
observed indexed fields, not previously independently pinned chain timestamps.

The request began 05:07:46.250 UTC and completed 05:07:47.534 UTC: one request,
no retry. Complete response size **2868 bytes**; SHA256
`d3ac4eedde54b003611fd7bb87dbc8e6a7e83fe22c1a3764c05bc24e3ca7963e`.
Request-body SHA256:
`dce8b3546570a6c663de8b8ffdbed8316c05eefb312b8dbc1f33927cd81bb853`.
The raw body is not retained; the bounded verified projection and transport
metadata are retained privately. Its hash is not a separately retrievable artifact.

## Earlier observations and limits

Separately selected metadata checks progressed through blocks 31577110 at
04:34:00.131 UTC and 41939110 at 04:47:46.207 UTC. A sandboxed 05:04:56 attempt
received no HTTP response and establishes no service state. One permission-reviewed
keyless metadata check at 05:06:09.826 UTC reached 60694417, exact CID/no errors,
before the exact proof query was selected. There was no automatic polling loop.

This establishes the selected historical G6 event/tree match, not Studio's
dashboard “Synced” state, exact current-head synchronization, independent chain
revalidation, independent IPFS retrieval, complete registry/marketplace coverage,
per-skill attribution or the off-chain contents behind the tree digest.
G6's two-emitter scope and inactive templates remain as documented.
No wallet key or Base payer key was accessed; **zero paid queries** occurred.

The [retained-evidence review](task-6-indexed-match-review.md) checks local
consistency, not an independent live request. Parent publication/full gate and
G's main merge remain separate steps. G8/G9 retain the explicit H-before-G8
shared-file exception; G15/Base live evidence is not supplied by this result.

### Final parent indexed-match acceptance

Independent retained-evidence review is CLEAN:117 local assertions, exact
three occurrences and tree/money/nonce agreement, with no extra live request.
Parent fully read that report and the frozen verifier; the public review copy is
exact original plus the historical banner, with no body substitutions.
The sole evidence-commit gate exited0:2941 Vitest/131 files,829 Bun/51 files/
5770 assertions, root/web strict0. Source, schema and mappings are unchanged.
Final publication audit and atomic commit follow; the separate main merge does
not complete H-dependent G8/G9 or the funded-but-unperformed Base evidence step.
