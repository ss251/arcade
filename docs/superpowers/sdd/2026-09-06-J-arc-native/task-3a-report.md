# Task 3A — selection and balance foundations

Base c447759. Added bounded own-data payment-choice capture, ordered allow-list
selection and an anonymous Arc-testnet Gateway availability reader. These leaf
modules are not yet connected to SDK/MCP/canary purchases; Task3B does that work.
This checkpoint does not change active spending, sign, pay, deposit or deploy.

Gateway is preferred only when observed available funds cover its atomic price.
Unknown schemes are skipped; escrow remains unimplemented/unselectable; malformed
known Gateway fields cannot fall through to USDC. Inventories, domain metadata,
amounts and timeouts are bounded; duplicate rails and accessor authority refuse.
Exact's existing final ENS/domain signing gate remains an integration requirement.

The balance reader makes one anonymous POST to the pinned public balances path,
with depositor/domain/token correlation, a five-second whole-operation deadline,
64KiB/4,096-chunk body bounds and no redirect/retry. It returns null for unavailable
observations, not a fabricated zero. Pending batch balance is not available funds.
No RPC, signer, Keychain, transaction or raw provider diagnostic is involved.

## Verification before the full gate

Each new suite initially failed to import its absent module; those are setup
failures, not executed behavioral Reds. Selector implementation then gave25PASS/
1FAIL: constructing PaymentRequirements copied extra and defeated freezing the
input object. Freezing the constructed extra fixed the real mutation-boundary Red.
Final unit coverage52tests/two files/857ms PASS, including malformed coordinates,
priority/funding/unknown schemes, timeout, late-body and uncooperative-cancel cases.

Five-root strict initially found15 test-only Bun fetch/preconnect and Headers
iterator typing errors. Typed no-preconnect mocks and Headers.forEach fixed them;
final strict0. The first native HTTP test returned the expected balance, then
timed out reading a cloned request after its handler had returned. Capturing the
body inside the handler fixed the fixture without a timeout increase. Final
native1test/11assertions/205ms PASS, including owned listener shutdown/refusal.
Its test-only transport maps the fixed URL to loopback and projects the actual
HTTP stream; it is not a live Circle response or a funded-wallet proof.

Sole sequential four-worker full gate79816 PASS:4,649Vitest/206files/64.92s,
855Bun/56files/6,316assertions/167.40s, root/web strict and client352ms/SSR266ms
builds. Five source/test hashes remained frozen; ten-path scope,16local-links,
empty-index and privacy checks passed before the gate. Final audit/atomic commit
follow; no full replay or concurrent gate. Task3A COMPLETE; Task3B is not yet
implemented, and the Task3 overall checkbox remains open.

The executing-plans and ts-testing skills guide the two-checkpoint sequence and
behavioral/native checks. Owner root-only restrictions override delegation; no
agents, parallel gates or private/public evidence duplication were introduced.
