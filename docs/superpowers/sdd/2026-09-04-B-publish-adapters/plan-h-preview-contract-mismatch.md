> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Plan H preview contract mismatch, discovered during B9 review

Plan B Task9 Step5 defines --json only for a skill DIRECTORY, with the exact singular shape `{target, skillId, engine, grants, advisory?, public, private}`. MCP/OpenAPI discovery may yield multiple listings and B's introspection preview is prose; no multi-listing JSON contract is specified.

Plan H interfaces table line46, Task8 consumed interface near3686, and source near3966 instead assume the same singular shape works for directory/MCP/OpenAPI target, spawning `["publish", target, "--json"]`. This cannot work for multi-tool servers without defining discovery/selection behavior. H's mock-only tests would hide that integration failure.

B9 will preserve its explicit directory JSON contract and refuse unsupported introspection JSON rather than choosing an arbitrary first listing or inventing an undocumented protocol. Resolve this discrepancy when executing H's publish wizard task: implement explicit source discovery/selection and a defined contract, or accurately scope preview to generated directories with actionable generation guidance. Add a real CLI integration test; do not advertise MCP/OpenAPI wizard preview that only works under mocks.

No owner decision needed yet; this is a literal-plan integration error to reconcile at the consuming task. Do not overwrite either plan's other agreed interfaces.
