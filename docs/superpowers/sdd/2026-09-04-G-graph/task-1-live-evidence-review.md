> Sanitized historical G1 checkpoint, September 5, 2026. Original retained unchanged; only the banner and explicitly recorded privacy substitutions differ. This report records its own observation time, not a complete G1 live gate. Later dated progress supersedes pending statements.

# G1 independent deployment and indexing observation

September 5, 2026. Read-only audit after the parent's single approved deployment.
No credentials, private environment, Keychain, transaction, upload, deployment,
authenticated request, RPC request, or paid query was performed by this reviewer.
Exactly one unauthenticated read-only GraphQL request was made to the returned
Studio endpoint, as expressly authorized. No retry or additional network call.

## Result

Deployment acknowledgement is recorded. The independent query now returns valid
GraphQL data with the exact deployed CID and an indexed block, unlike the parent's
earlier startup errors. However, both the latest-settlement query and an exact
filter for the historical runbook transaction return empty lists. **G1's required
indexed settlement / known-runbook-match gate remains unproved.** This is not a
complete G1 live PASS, a fully-synced claim, an unsupported-network rejection, or
authorization to advance the gated ledger work.

## Retained journal and source audit

Read only `[private deployment journal]`: 887 bytes, two complete
JSONL records, regular file with one hard link, owner `[local file owner]`, mode 0600. Its
containing directory is owned by the same user and mode 0700. No secret fields or
raw provider diagnostics appear in the journal.

Both records use `g1-studio-deploy-v1` and the same exact reviewed policy:

- Endpoint: `https://api.studio.thegraph.com/deploy`.
- Name/version: `arcade-ledger-arc-testnet` / `v0.0.1-smoke`.
- CID: `QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8`.
- Intent: `2026-09-05T13:24:11.804Z`.
- Completion: `2026-09-05T13:24:16.472Z`, `status: deployed`.
- Returned query URL:
  `https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.0.1-smoke`.

Read the entire private helper, original report and independent security
follow-up. The actual helper SHA256 is
`6b2eb10475d10649a97094015c2e0e1e956809b420487475c22b9b1a87b15f2e`, matching the final
reviewed version rather than the superseded original report's hash. Fixed policy
is at `internal/g1-studio-deploy.ts:4–8`; its once-only latch and synchronous intent
precede dispatch at lines 58–68. Appended file and parent-directory fsync precede
the callback return at line 151, exclusive/no-follow private creation is at line
158, and bounded owning-command fuse / acknowledged exit projection are at lines
161–163. Journal chronology is consistent with that implementation and the
parent's one-run record; this audit did not independently observe the earlier
HTTP request or process lifecycle.

Read the actual manifest, build manifest, ABI contract in the plan, schema and
mapping. They describe the v1 pilot `0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206`,
network `arc-testnet`, start block 0, and only ordinary `Settled` events. Mapping
uses transaction hash plus log index as the entity ID and preserves public event
amounts, nonce, buyer and block metadata. It does not index the later V2 splitter,
trees or ERC-8004. No IPFS content was fetched in this audit; CID equality below
correlates the returned endpoint to the acknowledged deployment, not a fresh
independent download/rebuild of its uploaded bytes.

## Single independent query

Request started `2026-09-05T13:36:10.671Z`; response observed
`2026-09-05T13:36:11.268Z`. The consuming read exited 0. Request used no
Authorization header, no cookies, no credentials, `redirect: error`, identity
encoding, a 15-second abort deadline and 64 KiB actual-response cap. Actual body
was 249 bytes and HTTP status was 200. The GraphQL document requested:

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

Actual response data (no GraphQL `errors` member):

```json
{"settlements":[],"knownSettlement":[],"_meta":{"deployment":"QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8","block":{"number":5481110,"hash":"0x2acb733775f2e79a5db2309fbd1fe9664b66cb3b736bbbff801b1ced4c7134bb"},"hasIndexingErrors":false}}
```

This establishes unauthenticated data access at this instant, not a permanent
authentication/rate-limit policy. The indexed height and false error flag do not
establish current-head synchronization; no fresh chain head was requested. Empty
results do not prove that historical settlement never occurred. There is no
amount, buyer or known settlement match to attest from this response.

## Historical observations and limits

The parent separately reported unauthenticated and Bearer queries at 13:26:34/35Z
returning HTTP 200 with GraphQL errors, followed by a 13:27:36Z keyless diagnostic
that the CID had not started syncing. Preserve those earlier observations; this
later response shows progress, not retroactive success at those times.

The parent also independently observed historical RPC receipt absence for
`0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2` and
`0x6366215e96a33e97e4a177453c858e9b1b8639fcff4bb72e1e7dcf5459fc8143`, while the pilot
still had 2737 bytes of code and a newer C10 receipt was readable. Those are
parent-provided observations, not RPC checks repeated here. They must not be
silently replaced with a new settlement or interpreted as historical proof
being fabricated. The newer receipt is not evidence for this pilot-only mapping.

The public `subgraph/README.md` still records the earlier local-only checkpoint;
the parent owns its truthful follow-up. No tracked file, test, journal, source,
deployment state, public document or Git metadata was edited by this audit.
This ignored report is the only new file. No full gate or test suite was run.
