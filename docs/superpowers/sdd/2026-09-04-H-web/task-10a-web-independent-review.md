> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10a passive web slice — initial independent review

2026-09-06. **One bounded transitive import finding; correction pending.** Fully
read the current public H10a brief, all eight frozen author files, the parent's
real-rail composition test and complete author report. Earlier preparation read
the full authority/transport notes and actual H4/F interfaces. No source/test edits,
browser, server, external request, key, signing, payment, Git or full gate occurred.
The ts-testing skill guided installed focused public-behavior checks.

## Frozen inputs

| Path | SHA-256 |
| --- | --- |
| apps/web/src/lib/purchase-context.ts | `9499f8afe79a4276a322cb0af207a73ccbd8695438ddc86bfa5def8f15c5ce3b` |
| apps/web/src/lib/ordinary-job-http.ts | `156482395d8942e02bfafc12eb29d8fdac937539230a04e298aa963de58ce957` |
| apps/web/src/lib/job-store.ts | `795f18e689f9df6b7fabe56bb690d826a7e5b1d28d8fa9fa5a69d73899d6d5e4` |
| apps/web/src/lib/hub.ts | `009f4e6b573656e8fa71d051ce711c78aa921025b837dee444953072e1c24731` |
| apps/web/src/routes/api.quote.ts | `b6cb45b59d4d2d7354a891dbc107a172da527a2d7dfccdbe7fa731d1054f6e13` |
| apps/web/test/purchase-context.test.ts | `947799951ec9942be44c8356f3d521ed6a7e50a27148afb14bade628179e8779` |
| apps/web/test/ordinary-job-http.test.ts | `08324fbb457ce62d221bd7ce85e294afb78b334e2a6926651cf57bbcf2c9ec69` |
| apps/web/test/quote-ens.test.ts | `01102ca75c13159ec23d896f569e3a5400b127e22fd743e4fb18ab2d28cbfc73` |
| apps/web/test/browser-context-rails.test.ts (parent) | `2137dafcbe4bd90b66c23e81ad24f23e715da80dd23e2e42a2cce1e7664f3f6e` |
| apps/web/src/routeTree.gen.ts (existing support) | `672bc8d089517dd4faf97863053844116a5b9fcd677e6afdea6b4ad771b94248` |
| internal/h10a-web-author-report.md | `9867aefc6756d66ddf4cdf7467215a01aa9d74949cbef2bfeb2a3db93e0780f5` |

All listed source/test/support hashes matched before and after independent checks.

## Executed checks

- **13:19:06 IST:** canonical Node-hosted Vitest v3.2.7, **337/337 in 8 files**,
  2.21s total, exit 0. This is author's 332 across seven focused compatibility
  files plus the parent's five actual challenge-producer cases, not a full gate.
- Exactly eight owned source/test roots plus parent producer test and existing
  generated route support: **10 roots, strict:true, zero diagnostics**, exit 0,
  using the actual nested web tsconfig and config-read/parse/pre-emit diagnostics.
- In-memory reversal of only the H9 capture rename/export reconstructs prior
  accepted source `70fc863885e7c4e1ba0166ad27390a8c4f743395bb16bdeecd3d6afb557b98c5`.
  The 80 unchanged storage tests also passed in the focused run.
- Separate fileless offline import probe reproduced the finding below. An initial
  planned multi-boundary supplement stopped at the first import, before its
  assertions; no unexecuted supplemental assertion count is claimed.

Focused command from HROOT, login:false:

```text
env -i PATH=<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run apps/web/test/ordinary-job-http.test.ts apps/web/test/purchase-context.test.ts apps/web/test/quote-ens.test.ts apps/web/test/job-store.test.ts apps/web/test/quote-routes.test.ts apps/web/test/purchase.test.ts apps/web/test/hub-client.test.ts apps/web/test/browser-context-rails.test.ts
```

Strict used the same clean launcher with installed TypeScript, actual
`apps/web/tsconfig.json`, noEmit, and the ten roots listed above excluding the
private report. No source cast, replacement config, build or emitted output.

## Finding: passive imports still select server environment

**P2 — transitive environment dependency.** Both new browser-safe modules import
H4 `hub-decode.ts`, which imports the core barrel. That barrel loads `chain.ts`,
whose top-level `loadChainConfig()` reads ARCADE_NETWORK. Import therefore rejects
under an invalid ambient selector, contrary to the new passive module's no-server-
environment contract. Ordinary row capture alone remains inert. This is an actual
module-import finding, **not a native browser bundle failure, network action,
capability disclosure or payment-authorization bypass**.

Exact narrowed fileless probe, clean-env Bun `--no-env-file -e` from HROOT with
only the synthetic `ARCADE_NETWORK=H10A_PRIVATE_IMPORT_SENTINEL` selector added:

```ts
for (const path of [
  "./apps/web/src/lib/job-store.ts",
  "./apps/web/src/lib/purchase-context.ts",
  "./apps/web/src/lib/ordinary-job-http.ts"
]) {
  try {
    await import(path)
    process.stdout.write(JSON.stringify({ module: path, imported: true }) + "\n")
  } catch (error) {
    process.stdout.write(JSON.stringify({ module: path, imported: false,
      selectedEnvironment: error instanceof Error && error.message.includes("H10A_PRIVATE_IMPORT_SENTINEL") }) + "\n")
  }
}
```

Observed: job-store imported:true; purchase-context and ordinary-job-http each
imported:false, selectedEnvironment:true. No real configuration, key or capability
was supplied. The earlier uncaught import printed this synthetic diagnostic and
chain-config/chain stack, not operational data. The narrowed probe emits only flags.

Direct-import replacement alone is insufficient: actual `core/money.ts` imports
USDC_DECIMALS from chain.ts. Parent accepted a narrow shared integration remedy:
fixed six-decimal ERC20 scale in money.ts (already literal in every ChainConfig),
plus exact environment-inert ens/money/job/chain-config imports in hub-decode.
Parent owns those two source changes. Reviewer will first add/run only the newly
released collected browser-import regression on unchanged source, preserve its
Red, then verify parent-corrected pins; no source patch is authorized to reviewer.

## Other checked behavior and provenance

The frozen code captures quote issuer/config before awaits, preserves existing
25s/10s/10s reads and actual-input/ENS checks, and omits unsupported browser context
without stripping legacy requirements. Actual EIP direct/V1/V2, Gateway and Test
challenge outputs survive context projection; Test stays Test. The context is
public frozen data, not live approval. The retrieval helper snapshots H9 authority,
uses fixed header-only GET paths, checks complete framing/UTF-8/deadline, performs
one request, cancels late bodies, bounds cleanup and returns fixed failures. Tree
uses H4 decoding; raw result remains unknown and cannot safely be treated as spend
or display text. No additional material finding was identified in this bounded read.

Author history remains distinct: initial quote selection eight genuine failures/
one Green; HTTP's first 44/45 failure was a wrong expected H4 reason, not product
behavior; later compatibility/cleanup additions were Green. The missing generated
route support caused strict-program setup diagnostics, not source failures.
No new module-missing Red was manufactured. The later import finding above is
independent evidence and does not rewrite that chronology.

Native browser CORS/compression/header visibility, two-origin production routing,
fresh approval, signing, acceptance persistence, terminal correlation, relay
retirement and buyer UI remain separately owned/unaccepted here. No F session
capability export is introduced. Review awaits the bounded import correction.
