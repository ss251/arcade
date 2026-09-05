# G11 brief — conservative, bounded evidence-policy synthesis

Implement the pure `synthesize` function with the plan's existing public names and
eight contradiction codes. Agree bounded output fields with G10 before source
changes. Add stable evidence flags and nullable unknown source block/hash/cost.
No network, keys, current clock or provider diagnostics belong in this module.

Decode canonical Base identities and relationships before joining. Missing,
malformed, conflicting, indexing-error, capped-page or incoherent metadata cannot
establish eligibility or a settled count. Complete empty results differ from
unavailable evidence. Null validation is unknown; only an explicitly trusted local
validator policy may support a trusted pass/failure.

Raw off-chain payment hashes never establish settlement. Optional proof inputs
must be produced by an independent local verifier, not Graph JSON or an input
flag. Check exact feedback/agent/chain/transaction/log/payer/payee/asset/amount and
service binding, reject event reuse/conflicts, and count distinct external clients.
A plain successful transaction or token transfer is not proof of that service.
The structural TypeScript type is not an authenticity boundary. With no verifier
or validator policy, the production caller must not fabricate those inputs.

Use real collected failing tests and hostile-input regressions; verify actual G10
output compatibility and strict types. `allow` means this policy's eligibility
under its trusted inputs, not financial safety. Root performs independent review,
whole-repository gates and the ordered local G11 commit; no paid/live proof or
F-before-G merge bypass is authorized.
