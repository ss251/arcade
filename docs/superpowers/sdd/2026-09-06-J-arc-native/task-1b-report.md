# Task 1B — ordered challenges and selected-rail dispatch

Base 98d6e64. Ordinary root challenges now intersect the listing's declared
rails with the built inventory, in Gateway → exact → escrow order. Omitted
listing rails mean Gateway/exact, never escrow. A Gateway-only hub stays
Gateway-only; a hub without Gateway stays exact-only. No additional facilitator
or rail is constructed by this change. Test-default ordinary calls remain an
offline exact simulation, even when Gateway is built for session inventory.
Children retain their existing default rail and cannot select escrow.

The native route classifies the echoed accepted scheme before canonical payload
decoding. Unknown schemes and unbuilt/unlisted choices return402 unsupported_rail;
malformed envelopes return400. Before verification it binds scheme, network,
asset, quoted amount, payee, resource, timeout and all extra terms to the current
server-generated challenge. Address casing and extra-key order are immaterial;
unknown extra terms fail closed. Presentation-only description/MIME fields are
not authority here (a rail may impose stricter requirements). Existing exact
authorization-overpayment behavior is unchanged; the echoed quote must still
equal the listing price.

The chosen Rail is passed to the existing deferred runJob seam and retained
through the unchanged single settlement point and receipt. Attestation payee
comes from that selected requirement, not an exact-only splitter assumption.
No shouldSettle, fee accrual, tree reservation or payment implementation logic
changes. Gateway transfer acceptance is still not a mined batch or per-call
on-chain fee split. The response remains queued202 with a private result poll;
this is not a completed Circle CLI proof.

Rail/receipt and requirement types reserve erc8183 for later tasks, but no escrow
implementation, constructor, funded-job payload, contract or live rail exists
yet. Shared session schemas and admission explicitly keep escrow unavailable;
this was necessary to preserve the existing session contract when RailName grew.
Session HTTP routes and settlement logic are unchanged.

## Verification before the full gate

- New challenge suite initially failed to load the absent module; this was not
  a count of executed behavioral Reds. Implementation then passed66 focused
  tests across challenge, rail inventory and existing pipeline suites.
- Two genuine session regression Reds exposed widened schema acceptance and
  admission reaching storage checks for a fake built escrow rail. Explicit
  guards fixed both. Combined focused result:118 tests/five files/1.54s PASS.
- Final native test run:29 tests/two files/380 assertions/15.79s PASS, including
  all ten unchanged session HTTP tests and19 boot/ordinary route cases. Real
  hub routing/challenge constructors run inside owned loopback children; named
  verification/settlement fakes use separate in-memory balances. No provider,
  wallet or cryptographic live-settlement claim is made by these fixtures.
- Cases cover selected verify/settle/receipt, per-seller exact splitters versus
  direct Gateway payees, unavailable/unknown/unlisted rails, changed terms before
  any verifier/job/reservation, failed-output no-settle, exact overpayment policy,
  authorized child admission and unchanged session accounting/recovery.
- All owned native children were reaped and their listeners independently refused
  subsequent requests. External provider attempts were zero. Thirteen exact
  source/test roots passed strict diagnostics0.

Root-only review uses the executing-plans and ts-testing skills; the owner rule
forbids parallel reviewers. No key, live approval, payment, dependency change,
production deployment or push occurred.

## Sole full gate and bounded correction

Sole full gate17003 stopped in Vitest:4,578 passed, seven failed,203 files,
64.76s. All seven failures were paid HTTP assertions in the ENS/attestation
fixtures. Inspection established that those fakes called themselves Gateway
but returned USDC/exact requirements and splitter payees. The new dispatcher
correctly classified them as exact and refused the unavailable rail.

No production implementation was weakened or changed after that gate. Corrected
the two fixtures, plus the same misleading identity-read fixture, to use actual
Gateway challenge constructors while retaining in-memory verify/settle. Paid
attestation assertions now explicitly expect the real Gateway seller payee and
domain marker. These remain offline simulations, not real signature validation
or provider evidence. The three owned child launchers now disable env-file
loading; strict checking also corrected an old dynamic-namespace type annotation
and made their preconnect stubs explicitly fail closed.

Only the three affected suites were rerun:12 tests/three files/5.30s PASS;
all19 exact source/test roots strict0. Original13 source/test hashes remained
unchanged after the gate; only the six old fixture/test files above were added
to its correction scope.

Previously unreached stages81633 PASS:849 Bun tests/55 files/6,266 assertions/
167.60s, root/web strict checks, client and SSR builds (SSR176ms). No full gate
replay. Status DONE_WITH_CONCERNS: implementation and corrected regression
coverage complete, but the sole full invocation remains a recorded failure
followed by targeted corrections and previously unreached stages, not a
first-pass green gate. Final scope/privacy/link/hash audit precedes commit.

## Next checkpoints and limits

Task2 must align discovery with these advertised listing choices. Task3 must
add buyer selection and explicitly preserve the existing canary default-rail
policy; its current first-accept behavior would otherwise prefer Gateway.
No production scheduler was run or redeployed at this intermediate checkpoint.
Circle CLI wire/header/queued-result behavior remains Task4's live-proof work.
