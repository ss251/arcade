# Task 3B — ordinary buyer, MCP and canary integration

Base519a244 (Task3A already merged). The ordinary SDK captures an ordered rail
allow-list, filters prices by the cap, observes Gateway funding only when it is
the first eligible choice, and signs exactly one selected frozen requirements
object through the existing final authority gate. Unknown schemes are skipped;
malformed known Gateway terms refuse. Exact may be selected before signing
when the Gateway observation is insufficient or unavailable, never after an
issued authorization. Request cancellation cannot trigger a fallback signature.
Escrow remains unavailable until Task9; sessions keep their fixed rail.

SDK/MCP expose locally derived authorizedRail and authorizedAmountAtomic;
terminal hub JSON cannot invent either. CLI prints the choice beside the receipt.
These are not settlement proof. There is no new automatic durable journal:
the [buyer guide](../../../buyer-guide.md) gives a caller-controlled receipt-side
projection to persist privately. Raw job data and authorization material are
not committed by this checkpoint.

MCP's paying preflight supports multiple offers without a key or balance query
and reserves their maximum eligible price. It preserves every eligible offer's
ENS payee/chain checks; callers can narrow to the matching rail when payees
differ. Advisory arcade_quote remains a price hint, not a funding check. Canary
wiring explicitly retains the configured hub default, skips incompatible
listings and disables escrow defaults before reading a key. There is no new
scheduled spending policy.

## Verification

Initial new SDK behavior:10FAIL/2PASS, including absent selection/provenance.
Initial MCP behavior:4FAIL/6PASS, including absent argument schema and maximum
quote support. Two actual canary Reds detected an unwanted balance lookup and
a false seller failure when its configured rail was excluded. These were fixed.
An array-shaped parameter table and the legacy MCP property expectation were
fixture corrections, not product defects.

Final focused run55682:302PASS/8files/2.70s, including original ENS/cap/replay
tests and the new funding, cancellation, immutable terms, provenance, MCP
constraint/reservation and canary cases. Native check:32BunPASS/3files/
359assertions/11.55s across Gateway fetch/replay and hub rail boot. Their
transport returns an offline balance fixture; real offline signing and owned
HTTP listeners remain exercised, with cleanup checks. No live Gateway balance,
key acquisition, payment, deposit or deployment was attempted.

Fifteen-root strict initially reported an unexported type import and the
deliberate readonly-mutation test's type error. Using the public Rail contract
and an explicit hostile-test cast fixed both; strict rerun9287 reports0.
The unused MCP schema import was then removed.

The sole sequential four-worker full gate79007 stopped with4,678VitestPASS/
3FAIL/208files/66.40s. All three failures were in the existing ENS/Gateway
fixture: its transport returned a merchant challenge for the new balance
request, leaving Gateway unavailable and counting that observation as a hub
request. Added an explicit anonymous offline balance branch and assertions
for no forwarded capability/signature. Existing ENS mismatches still refuse
before signing. Targeted correction59214:22PASS/1/1.12s,16-rootstrict0.
All15 original source/test hashes stayed frozen; one fixture file was added
after the gate. No production code or timeout was changed to fix these failures.

Previously unreached stages80534 PASS:855Bun/56files/6,316assertions/167.59s,
root/web strict, client389ms/SSR208ms builds. No full replay and no green
all-in-one result are claimed. Pre-gate20-path/23-link/empty-index/privacy audit
passed; final21-path audit and atomic commit/merge follow. Task3B COMPLETE WITH
CONCERNS solely for the recorded split verification, not a live-payment claim.
The executing-plans and ts-testing skills guide these bounded checkpoints and
behavior/native checks; the owner root-only restriction overrides delegation.
