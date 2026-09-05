# F1 brief — bounded owner-gated Gateway probe

Implement Plan F Task 1's complete deposit/sign/verify/settle probe without
executing its owner-only funded step. Preserve the pinned Arc testnet Gateway
domain, installed SDK/core constant checks, six-decimal bigint amounts, Effect
orchestration and named fixed failures. Separate keyless support/help from the
explicit full live mode. Imports must not load keys or perform IO.

Use exactly 0.5 USDC deposit and one 0.001 USDC payment to a distinct approved
recipient. Reject ambient seller/network/facilitator overrides, legacy default
spending and self-payment. Require a new dedicated funded signer, explicit public
addresses and exclusive durable private journal. Journal the known transaction
hash or authorization nonce before each mutation. Do not save a key, signature,
raw transaction or provider diagnostic, and never retry the entire operation.

Check exact chain, token, allowance/deposit calldata, successful receipt and
on-chain/API balance correlation. Sign only locally reconstructed Gateway typed
data. Verify exact payer, submit settle once, bind its transfer UUID to network,
token, payer, recipient, amount and nonce, then correlate the exact balance debit.
Keep UUID/batch metadata distinct from independent mining evidence. Bound every
request including its body, read-only polls, gas and the whole owning process;
refuse redirects and prevent a second direct deposit/signature after uncertainty.

Write failing tests before implementation and exercise the actual viem signing
adapter with public dummy keys, injected transport and owned finite loopback
fixtures. Independently review the adapter and its public report, then run full
tests and strict TypeScript before a small conventional Codex-attributed commit.
Publish a truthful local milestone, not the plan's premature full-live success
claim. Existing private research and ledgers must remain in place.

No funded key/approval/deposit/signature/settle is authorized by this brief. The
owner's distinct-recipient amendment is pending; missing permission is neither
unsupported-network evidence nor an F13 trigger. No F2–12 or G-before-F merge,
production configuration change, mainnet transaction or push.
