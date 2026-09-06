> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F12 fixture independent bounded review — September 6, 2026

Initial verdict: **two concrete fixture findings; correction review pending**.
Source-only checkpoint, not whole-F12 acceptance or a twenty-call execution.
Read full102-line parent decisions27baadd83c5ee9f6282b59107a3a4a84de482957014cf9c91808a7734895e20f,
the complete accepted runner-seam/persistence notes, full318-line fixture, manifest
and probe, plus actual runner exec/daemon and hub/installed-viem RPC call paths.
No production/test/public edits, new fixture, child, loopback, signature, network,
key, Git or full-suite action by this reviewer. Only this ignored report written.

Author-coordinated initial hashes:

- runtime e8be4a1a4fda68311e10bfc840b508fd273acceea12411a6844483b6d867b4f7
- manifest d0761fc42d98994caea1f5e34b4dabef623df1482c49bd9f43c2310d57ea7db5
- probe6c5f8c871f62c9320bc88e103a856c6072386e3c277d33050b5f78878edae3c6

Paths are scripts/fixtures/gateway-session-runtime.ts and the adjacent
gateway-session-probe/{arcade.json,run.ts.txt}. B9 held that checkpoint while read,
then announced its narrow RPC correction; source is not claimed unchanged across
that coordinated thaw. Current interim runtime7d8c52c89eb68820543dd47d6c2271784f4ea7ae844f3dd4001764980d27efa4
has the RPC change; manifest/probe remain unchanged. EOF correction remains pending.

## Findings with exact scope

1. **Actual boot eth_chainId wire rejected.** Initial fixture:174 requires an
   empty params array. Actual apps/hub/src/chain-rpc.ts:37 calls client.getChainId;
   installed viem2.55.8 _esm/actions/public/getChainId.js sends only method, and
   _esm/clients/transports/http.js:44–45 plus utils/rpc/http.js:22–32 serialize
   undefined params away. Thus the real boot request is denied, rather than the
   intended four finite offline RPC reads succeeding. B9 already suspected it;
   this review independently confirmed the exact source chain. B9 reports G14's
   actual zero-paid boot Red and its own keyless fetch-intercept reproduction;
   neither was run by this reviewer. Fix is specifically omitted-or-empty params
   for eth_chainId with closed body keys, not a broadened RPC endpoint/method seam.

2. **Incomplete trailing UTF-8 silently accepted at control EOF.** Initial
   fixture:107 breaks immediately on reader.done. The fatal TextDecoder is used
   with stream:true at:109 but never flushed with decoder.decode(). After a valid
   start/control stream, a final lone0xc3 is buffered without contributing text;
   pending can remain empty and the fixture reports normal stop instead of a fixed
   malformed-control failure. This is an exact source-level failure path, not an
   executed Red here. Require fatal decoder flush before accepting EOF, then retain
   the existing residual-line check. A zero-paid owned hub regression can verify
   exit failure/cleanup without duplicating the twenty-call run. Sent to root/B9.

## Remaining reviewed boundary observations

Import has only inert definitions/builtin imports; active functions require the
exact main entry and --hub/--runner. Start is a closed own-data record, matching
role/run ID/parent PID/deadline, canonical real owned0700 directory and bounded
secret or literal loopback origin. Environment keys are allowlisted before values
are used; operational credentials and arbitrary executable/URL selectors are not
accepted. Main stdout uses bounded closed prefixed facts; console suppression and
denial wrappers deliberately remain installed until this owned process exits.

Hub boot uses real SQLite/Store/router and narrow Store lifecycle wrappers, not
synthesized jobs or Broker completion. Loopback serve is forced to127.0.0.1/port0;
fetch/preconnect deny outside the finite captured RPC/facilitator set. Gateway
verification recovers actual typed signatures, records one verify then one settle
for each nonce, requires begin, and emits distinct canonical offline UUIDs.
These are fixture assertions, not current provider/mining/funds evidence.

Runner uses actual startDaemon, native owned-loopback WebSocket and exact-entry
execSkill/Bun.spawn. Its three observations are distinct: actual stdin digest,
child exit and outbound successful JobResult/output digest. Manifest/probe source
is copied byte-identically; source and installed hash fields can be compared.
Public synthetic seller identity is installed only in the owned child, with no
user-key fallback. Runner ready is emitted after runFork, before Hello admission:
the orchestrator must separately observe the expected listing/owned runner online.

Stop marks admission stopped first, accounts for initialization with finite waits,
interrupts the daemon, and still TERM/KILL/reaps captured children when interrupt
fails. Denial wrappers stay active for detached late work. Initialization/cleanup
timeout produces failure, not clean PASS. Parent/deadline watchers and the exact
probe's own4-second/parent-death guard bound descendants; process exit is explicit.
No further material issue found in this cooperative owned-process pass. This is
not hostile same-user filesystem isolation, OS-wide egress enforcement, observed
process-death/late-acquisition testing or a guarantee proved from source alone.

No independent runtime counts are claimed. G14 owns actual boot/twenty-run and
collected integration tests; post-writer-shutdown SQLite correlation remains a
separate proof. This report needs a bounded correction addendum, not another
design cycle. F12 live remains unimplemented/NOT RUN under no-new-spending.

## Narrow correction verification and attribution correction

Verdict: **CLEAN for the two reported source corrections at3672e824**, not for
the entire fixture/harness or actual twenty-call path. The complete initial report
above remains unchanged (pre-append SHA256
553390154055f1bf644de66664815722a390ba2fbc80403d1c9339f2b4e13aaa).

Important evidence correction: the initial report repeated an author's attribution
of G14's hub startup failure to omitted params. Root/G14 later isolated those
silent pre-ready failures as default-sandbox loopback bind denial. They are NOT
an executed eth_chainId fixture Red. B9 explicitly confirmed its intercepted
createChainRpc probe only observed hasParams:false and returned5042002; it did
not assert the original fixture predicate's rejection. Finding1 remains proven
by exact source composition plus actual wire observation, not an independently
executed original-predicate Red. The initial report's contrary attributed wording
is superseded here without rewriting history.

Independently read the corrected regions and verified the entire source delta
without Git or file writes: reversing four exact, single-occurrence substitutions
in memory produces original e8be4a1a4fda68311e10bfc840b508fd273acceea12411a6844483b6d867b4f7.
They are: remove fatal EOF flush/comment; restore the old RPC-envelope guard;
restore the empty-array-only eth_chainId condition; remove the added stopped()
condition from WebSocket.send. This confirms no other source change in this
checkpoint, rather than relying on remembered punctuation or an author's summary.

The new EOF flush runs before residual-control acceptance and throws into fixed
failure/owned cleanup on incomplete UTF-8. RPC accepts only omitted or empty
params for eth_chainId, with closed envelope keys and unchanged endpoint/method/
four-call bounds. The added stopped-send condition is supplemental admission
hardening, NOT an observed post-stop network leak or a separately reproduced Red.

Independent exact TypeScript compiler-API check used the repository parsed options
and exactly two roots: runtime source and the unchanged committed probe bytes as
an in-memory .ts virtual source. `EXACT_ROOTS=2 DIAGNOSTICS=0`, exit0,4.528 seconds.
No generated/test/source file was written; imported dependencies were typechecked.

G14's precise runtime evidence, obtained directly rather than inferred:

- Actual malformed0xc3/EOF Red after real hub ready: exit0 versus expected1,
 1.507 seconds/3 assertions. Corrected same case passes in1.503 seconds, reported
 5 assertions. These loopback runs required the scoped permitted execution mode.
- Its command was `bun --no-env-file test scripts/e2e-gateway-session.bun.test.ts --test-name-pattern 'incomplete UTF-8|actual twenty-call'`.
 That combined invocation had1 pass/1 failure and6 total assertions: the distinct
 first twenty-call case failed before its assertions. Do NOT report this command
 as wholly Green or attribute its aggregate counts to the EOF case.
- Separate zero-paid hub startup/stop smoke passed1 case/5 assertions/1.510 seconds
 once the sandbox bind restriction was removed. No RPC-shape causal Red inferred.

Read the complete106-line private probe-guard test
[private standalone probe-guard regression fixture] SHA256
584b6c1265b5bbdde9f3351f94c461f228e917818920663e1dec44aa43067e75.
B9 reports2 pass/17 assertions; this reviewer did not rerun it. The first case
owns/reaps the direct blocked-stdin probe and observes exit92. The second owns
the intermediate parent, verifies the exact descendant process identity, kills
that parent and observes descendant OS disappearance; it is NOT a direct reap or
observed exit92 of the orphan. Its narrow source/hash and evidence labels are sound.

Before/after this correction check: runtime3672e8248254b7e633c88c3bf044b3a218dad322f99fac6680b781b44ebaad89;
manifestd0761fc42d98994caea1f5e34b4dabef623df1482c49bd9f43c2310d57ea7db5;
probe6c5f8c871f62c9320bc88e103a856c6072386e3c277d33050b5f78878edae3c6.
No new child, loopback, test execution, keys, live activity, source/shared-test
edit, Git or full suite by this reviewer. The actual runner/twenty-call failure
remains author-owned and outside this narrow correction verdict. No whole-F12,
live-payment, batching or descendant-lifetime acceptance is inferred.
