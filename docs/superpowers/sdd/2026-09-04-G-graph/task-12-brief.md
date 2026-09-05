# G12 brief — bounded purchases of indexed facts, not counterparty proof

Implement the fixed Agent0 Base client and actual script-runner protocol from
Task 12. Preserve the planned exports and dependency seams while making local
authorization, cost and evidence boundaries explicit. No funded query, Keychain
lookup, public RPC or Arc purchase is authorized by implementation work.

Select exactly one explicit key configuration, with no default item or ambiguous
fallback. Use a bounded fixed-argv local child only for an explicit Keychain item;
read no credentials on import. Never mutate global fetch, dotenv or an ambient
payment key. Scope the v2 exact signer to Base USDC, the reviewed merchant/domain,
one fixed query endpoint and 10000 atomic units, at most two attempts and two
authorizations per run. Use direct pinned x402 client primitives, not an automatic
recovery wrapper. Validate challenge, document, closed variables and all signing
fields before signing. Do not follow redirects or forward arbitrary extensions.

Bound headers, body, RPC reads, subprocesses and whole-job cleanup. Reserve the
local allowance before signing; unknown signed outcomes block later requests.
An accepted payment header is only a transaction locator: require chain ID,
successful exact receipt, matching canonical block, USDC Transfer and
AuthorizationUsed for the locally signed nonce. Do not label the quoted price,
header alone or a query payment as a counterparty's service-settlement proof.

Read at most one identities query and one sequential feedback query. Pin the
second entity query and its metadata to the first block hash. Reject malformed
payment metadata; preserve unknown source values as null. Incomplete/page-capped
facts never become valid empty evidence. Neither indexed trust/proof flags nor
input-supplied configuration become trusted synthesis arguments. Until a separate
service-proof verifier exists, production cannot emit allow or nonzero settled
attester counts. Enforce the exact closed bounded output contract before the
actual script envelope; refusal has no output even if the process exits zero.

Write genuine Red tests first, then use actual installed signing libraries and
owned finite HTTP/subprocess fixtures with public dummy keys. Independently review
both halves, preserve original task reports, publish reviewed copies, and run
combined/full gates before the small conventional Codex-attributed task commit.
Root owns exact direct dependencies/lock and snapshot documents; each agent owns
only its client or runtime files. G1 Studio, paid Base and canonical F-before-G
merge gates remain unchanged; no deployment, push or configuration mutation.
