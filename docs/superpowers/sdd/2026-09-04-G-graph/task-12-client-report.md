> Public execution record. Original retained unchanged in private task preparation; this report is a dated offline checkpoint, not live authorization or evidence.

# G12 client half — scoped query payments and independent receipt correlation

September 5, 2026 UTC. This is local/offline implementation evidence, not a live Graph purchase, Base settlement, Studio or agent-service verification claim. No real key, Keychain item, public RPC or gateway was read by this agent. The parent supplied the reviewed unsigned challenge observed at 09:54:03.618 UTC.

## Scope and contract

Only `skills/counterparty-graph/graph-client.ts`, `test/graph-client.test.ts` and `test/graph-client.bun.test.ts` were created. Root owns direct dependencies, lock and the block-hash query adaptation. The sibling owns runtime/output validation. No Git changes were staged or committed by this agent.

Preserved constants, `document`, `readPayerKey`, `Runner`, `PaidResult`, `PaidQuery`, `makePaidQuery` and additive `paidQuery` convenience export. `PaidResult.costAtomic` is additive and nullable by contract; actual successful production calls return `10000` and a canonical transaction hash only after independent query-payment receipt correlation. No zero-price observation is invented. An exported bounded `runKeyCommand` is an approved inert-child testing seam; production `readPayerKey` alone constructs the fixed absolute Keychain command. There is no environment/CLI arbitrary-command override.

The optional client transport/signal/clock/deadline seams never replace production policy constants. Default targets remain the canonical HTTPS Graph endpoint and Base RPC. The reviewed merchant, USDC, Base chain, amount, 300-second authorization timeout, EIP-712 name/version, and internal resource URL are pinned. Optional bounded resource description/mimeType are ignored; its internal HTTP URL is metadata, never a fetch/redirect destination.

## Safety adaptations from the literal plan

- The two explicit credential mechanisms are mutually exclusive: direct key or explicitly named bounded Keychain service. No default item, unsolicited lookup, fallback, ambient X402 mutation, secret argument or reflected provider error.
- Direct pinned x402 v2 client and ExactEvmScheme are used, not the broad registration helper or automatic fetch wrapper. A minimal guarded signer has only address/signTypedData, validates the exact domain/types/message and active per-query/run budget, and cannot sign after a timed-out SDK phase. No Permit2, extensions, transaction signing or approval capabilities exist.
- Each factory is one finite run: maximum two query attempts, two authorizations and 20,000 atomic USDC. Calls are singleflight. Any signed failure retains the reservation and latches future attempts. One unsigned 402 is followed by at most one paid POST; no recovery or resend exists.
- HTTP/RPC requests use fixed headers, `redirect:error`, `credentials:omit`, `accept-encoding:identity`; nonidentity encoding, content-length mismatch, oversize/truncated/stalled bodies and response URL changes refuse. Per-request five-second and overall default eighty-second bounds include body consumption and abort cleanup.
- Settlement response headers are bounded locators, not proof: closed known fields, exact payer/network/hash and no contradictory errors or unreviewed extension authority. Base chain ID, successful exact receipt, log index/hash/block/transaction provenance, strict USDC Transfer and AuthorizationUsed(payer, locally signed nonce), and independently fetched block hash are all checked. Removed/malformed/duplicate/conflicting evidence refuses. Receipt polling is bounded to fifteen seconds, with no send retries.
- Graph errors, malformed data and indexing errors refuse with a fixed message. No general agent-service verifier exists; this client does not populate G11 verifiedProofs or trustedValidators.
- The production key child receives an empty environment, bounded argv/stdout, ignored stderr, a 2.5-second TERM deadline and 100ms KILL escalation. Its promise settles on child close, not an earlier competing outer timeout. An injected unowned Runner is independently bounded to three seconds. The CLI owner still supplies its own outer process fuse for exceptional OS failure.

## Actual installed source checks

Inspected the locked `@x402/evm` 2.25.0 `dist/esm/chunk-TTRSMFXP.mjs`: EIP3009 payload construction at 26–75, transfer-method dispatch at 106–136, broad registration helper at 145–171. The helper registers v1 too; direct `.register` does not.

Inspected nested core 2.25.0 `dist/esm/client/index.mjs`: v2 register at 71–73, payload creation at 218–293, policy/selection at 394–441. The guarded signer reconstructs only the verified typed payload and signs it with the actual installed viem account.

Inspected fetch 2.25.0 `dist/esm/index.mjs`: automatic wrapper includes hook/recovery and a fresh-payload retry; it is deliberately not called. Core's HTTP header encoder alone is used after our explicit policy gate.

Base USDC's exact token/name/version/decimals are present in evm2.25 `chunk-GMTGRPK2.mjs:7–14`. Core2.25 `x402Client-pTJv8yPe.d.mts:1409–1420` defines the settlement optional fields; only bounded amount and empty diagnostic strings are accepted, no extensions/extra.

## Genuine Red / Green history

- **10:01:50 UTC:** actual Vitest collection failed on missing `graph-client.ts` before implementation. This is a collected missing-module Red, not a no-tests-found claim.
- **10:05:51:** initial 45 client tests Green, including real SDK EIP3009 signature recovery under simulated HTTP/RPC.
- **10:07:19:** genuine actual Node `process.env` prototype Red. Fixed only own-data property access for the two configuration names, never inheritance/enumeration. **10:07:37:** 46 Green.
- **10:08:32:** genuine unbounded unsigned-attempt Red (three HTTP attempts despite two-query contract). Added attempt counter without consuming malformed pre-I/O inputs. **10:08:45:** 48 Green.
- **10:10:25:** genuine malformed USDC event beside valid pair Red. Exact known event topics/data/arity now refuse malformed contradictory evidence instead of ignoring it. **10:10:44:** 50 Green.
- **10:12:54:** first six actual Bun loopback/inert-child cases Green, 62 assertions. These were passing behavioral coverage, not a claimed new product Red. Redirect sends zero foreign requests; signed 500 sends exactly one authorization; fixed test key never appears in the wire payload. Inert overflow/stall children are killed and independently absent by PID before the failure is observed.
- **10:14:09:** seven genuine parent-review Reds: four contradictory/unknown settlement fields, two length/encoding mismatches and one delayed real-SDK signing callback after its query timed out.
- **10:15:15:** separate genuine owned-close Red: the outer three-second race settled while mocked close remained pending after TERM/KILL. Initial 10:15:00 ESM spy setup failure is not counted as product Red. Removed the competing outer race only for the actual owned runner.
- **10:16:02:** all 58 unit cases Green after the reviewed fixes. Final unit rerun **10:18:16:** 58/58 Green.
- Final actual Bun rerun after all production fixes: **6/6, 62 assertions**, 2.88 seconds; all owned services/children stopped. Final targeted strict TypeScript for all three owned files and `git diff --check`: exit zero. Test-only missing `fetch.preconnect`, tuple inference and explicit mock `this` typing were corrected without unsafe type suppression or weakened behavior.

No full suite was run by this agent. Root owns independent review, combined/full gates and ordered commit. Live gateway historical-block support and paid evidence remain unproven.

## Frozen fingerprints

- Client: `bb79eca1715ba71ee42b7e43019e66215e5e50b7a3963dd139a84604e0e9d315`
- Vitest: `826f7f2d0b821d700b037739db4b26277154a23c8d83acd1c7945d6b3193e68c`
- Bun: `1c78de3166bf85b171fec8c823923a2462772bbddf8beb6f22eb02b60d917659`
