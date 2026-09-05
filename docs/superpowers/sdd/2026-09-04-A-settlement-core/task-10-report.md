> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 10 report

- Commit: `bd5bd2e feat(core): ChainConfig manifests with a pending Arc mainnet entry`.
- Added exact ChainConfig/NetworkId/loadChainConfig/toViemChain interfaces and both manifests. Mainnet remains pending with no usable endpoint. Legacy constants derive from selected config; JSON remains bundled and browser-safe.
- Payments require config.chain; domains, challenge fields, reads, viem clients and settlement target all use it. Optional SignInput.chain supports explicit callers; existing EIP712_DOMAIN export retained.
- Updated hub, MCP balance reader, wallet, browser signing and deployment consumers. Vite embeds only the public ARCADE_NETWORK selector so browser and server build agree without a process shim.
- TDD: loader missing module red; wallet RPC test red (only one endpoint); four payment tests red on wrong domain/target; deployment helper missing red. Reviewer reproduced pending mainnet signing despite unknown wallet chain; two regression tests red then green after guard fixes.
- Focused new config/payment/deployment/browser tests: 31 passed. Payment suites separately 34 passed.
- Full gates: `bun run test` 579 Vitest + 29 Bun passed; root and web `tsc --noEmit` passed; `bun run web:build` passed; `git diff --check` passed.
- Deviations: guarded absent process, used refined address type, exported loader from core index, updated constructors omitted by abbreviated plan add list. Browser build selector requires rebuilding web when switching network (document in Task12).
- Deployment compatibility correction was necessary: --network was ignored and viem hardcoded testnet while core constants became selectable. Added strict flags, pending/ready checks, consistent parameters and actual RPC chain-id guard before deploy. Real pending CLI tested without credentials; no live deployments/keys used. Fixed final instruction to configure RUNNER.
- Read-only adversarial review: one P2 pending browser guard, fixed and tested; no other blocking finding.
