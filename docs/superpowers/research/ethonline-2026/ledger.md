# Ledger @ ETHOnline 2026 — research for ARCADE (Continuity track)

Every claim below carries a URL or a repo file path. Where I reason beyond a source, the line is marked **[inference]**.

Primary track page: https://developers.ledger.com/ethonline
Dates on that page: Sept 4–16 2026, submissions close **Sept 13**. Prizes: AI Agents × Ledger $3,500 (2000/1000/500, **new projects only**), Continuity $1,500 (1000/500, "for teams extending a project they already had before the event").

Continuity qualifying ideas, quoted from https://developers.ledger.com/ethonline:
- "Add a Ledger signer to an app you have already shipped, using the DMK skills."
- "Make `wallet-cli ring` the key backend for the `.env`, `sops`, or `age` files your repo already has."
- "Put a device confirmation in front of an action your product already performs."
- "Pick up an open issue on a Ledger repository and land it as a real fix."

Judging (same page): "Real user value, not generic chatbot wrappers." · "Clear boundaries between autonomous behavior and explicit approval." · "Concrete use of Ledger primitives, not just wallet branding." · "Practical demos that show why device-backed trust matters for AI." · "Something we can run without you in the room: a repo we can clone, or a recorded walkthrough." · "For Continuity, a clear before and after: what the project could not do until Ledger was in it."

---

## 1. What is the "Ledger Agent Stack"?

Three pieces, all documented under https://developers.ledger.com/docs/ai-tools/overview :

| Component | What it is | Source |
|---|---|---|
| **Wallet CLI** (`wallet-cli`) | USB terminal CLI over DMK: account discover, send/receive, swap, earn, genuine-check, **`ring`** (Key Ring), and `skill` (installs its own agent skill) | https://developers.ledger.com/docs/ai-tools/ledger-cli · npm `@ledgerhq/wallet-cli` **v2.1.0** https://www.npmjs.com/package/@ledgerhq/wallet-cli · source: `LedgerHQ/ledger-live` → `apps/wallet-cli/` |
| **DMK skills** | "Markdown instruction sets your agent loads on demand" that teach a coding agent to wire a Ledger signer into an app | https://developers.ledger.com/docs/ai-tools/ledger-dmk-skills · https://github.com/LedgerHQ/agent-skills |
| **Key Ring CLI** | `wallet-cli ring` — LKRP-rooted AES-256-GCM encryption of files/text ("Secrets, not coins") | https://developers.ledger.com/docs/ai-tools/ledger-cli, and `skills/wallet-cli/wallet-cli-usage/SKILL.md` §`ring` |

Install (from the overview page): `npx skills add ledgerhq/agent-skills`
DMK-only subset: `npx skills add ledgerhq/agent-skills -s ledger-dmk-implementation dmk-intent-vocabulary dmk-business-logic`

Underlying repos: **DMK** https://github.com/LedgerHQ/device-sdk-ts · **Key Ring Protocol app** https://github.com/LedgerHQ/app-ledger-sync ("Ledger Key Ring Protocol") · whitepaper https://github.com/LedgerHQ/ledger-key-ring-protocol-whitepaper · **emulator** https://github.com/LedgerHQ/speculos · **Ethereum device app** https://github.com/LedgerHQ/app-ethereum

---

## 2. `wallet-cli ring` (Key Ring)

**Install:** `npm i -g @ledgerhq/wallet-cli` (also pnpm/yarn/bun) — https://github.com/LedgerHQ/agent-skills/blob/main/skills/wallet-cli/wallet-cli-usage/SKILL.md (line 10). Prebuilt binaries: `optionalDependencies` in the published `package.json` = darwin-arm64, linux-arm64, linux-x64, windows-x64 (no darwin-x64).

**What it does** — verbatim from `skills/wallet-cli/wallet-cli-usage/SKILL.md` §"ring — Ledger Key Ring (LKRP)":

> "Trustless, hardware-rooted encryption for files and text. The key ring is provisioned once on your Ledger via the Ledger Sync app; afterwards `encrypt`/`decrypt` run **without** the device — keys derive deterministically via HKDF-SHA256 from the LKRP-shared root and never leave AES-256-GCM. `encrypt`/`decrypt` still call the LKRP backend to restore the trustchain on each invocation, so network access is required. The ring is recoverable from your seed on any new machine."

Commands (same file):
```
wallet-cli ring init [--name my-laptop]          # device required, one-time
wallet-cli ring encrypt --key <name> -i F -o F.enc   # no device
wallet-cli ring decrypt --key <name> -i F.enc -o F   # no device
wallet-cli ring keys | ring destroy
pbpaste | wallet-cli ring encrypt --key personal-notes | pbcopy   # stdin/stdout
```

**It is file/stream encryption, not an env-injecting agent.** There is no `ring exec` / env-var release. The skill's own release pattern is: keep the ciphertext at rest, `decrypt` straight into a file, a process, or an env var, and never print it — "**Decrypted output is sensitive.** … Pipe `decrypt` straight to its destination (a file via `-o`, another process, or the clipboard) or capture it into an env var". **[inference]** Per-job env injection into a sandbox is *our* code wrapping `ring decrypt`, not a Ledger feature.

**How secrets/credentials are actually stored** (source, `LedgerHQ/ledger-live`):
- `apps/wallet-cli/src/key-ring/keychain.ts` — the LKRP **member private key** lives in the OS keychain via `@napi-rs/keyring` (`new Entry(SERVICE, keychainAccount())`), AES-256-GCM-wrapped with an `ENC:` prefix when a password is set.
- `apps/wallet-cli/src/commands/ring/init.ts` — `ring init` description: "Set up this machine as a Ledger Key Ring member, creating or recovering a trustchain (**device required**)"; prompts for a password unless `--unsecure-no-password` ("stores private key unencrypted in the OS keychain"); calls `sdk.getOrCreateTrustchain(...)` inside `withLkrpDeviceSession` with the spinner "Connect device, **open Ledger Sync app** — provisioning your Ledger Key Ring…".
- `apps/wallet-cli/src/commands/ring/shared.ts` — `encrypt`/`decrypt` read `Session`, require `session.trustchain` ("Ledger Key Ring not initialized. Run `wallet-cli ring init` first."), resolve the password wrapping key, then `loadDomainKey(key, wrappingKey, session)` over the network ("Fetching key from your Ledger Key Ring…"). Output files are written with `writeSecureFile` (atomic, mode 0600).

**Non-TTY / CI password injection** (SKILL.md, §"Non-TTY (CI / agentic) password injection"): `ring` reads `WALLET_PASS` when there is no TTY; the skill forbids literals and mandates command substitution:
```
WALLET_PASS=$(security find-generic-password -a default -s ledger-wallet-cli -w) wallet-cli ring encrypt …   # macOS
WALLET_PASS=$(secret-tool lookup service ledger-wallet-cli account default) wallet-cli ring encrypt …        # Linux
```
Also: `ring init`/`ring encrypt`/`decrypt`/`keys`/`destroy` "must use `dangerouslyDisableSandbox: true`" under Claude Code — ring commands because of "OS keychain access restrictions" (SKILL.md line 16).

**Rotation gotcha** (SKILL.md): the domain key derives from the ring's wallet-sync encryption key, which "**rotates when a ring member is removed**"; data encrypted before a rotation can no longer be decrypted (`⚠ Ledger Key Ring rotated`). Re-encrypt after removing a member.

**Supported devices:** the Key Ring is provisioned through the **Ledger Sync** device app (https://github.com/LedgerHQ/app-ledger-sync). DMK's own stack diagram lists devices as "Nano S+, Nano X, Stax, Flex" (`skills/dmk/ledger-dmk-implementation/dmk-sdk-reference.md`, Architecture section). I found **no** page stating Key Ring works on Nano S (legacy).

**Speculos / no-device:** none. The wallet-cli doc page states no Speculos support and no remote/VPS use without physical USB; `@ledgerhq/live-cli` is described in `apps/wallet-cli/README.md` as "an internal, **Speculos-only** tool used by the monorepo's e2e suites and CI" — i.e. the Speculos path exists in the monorepo, but not for `wallet-cli`.

**"Hosts with no USB port" story (VPS/CI):** the honest reading of the sources is *split enrollment*:
1. `ring init` on a machine that has the device (device + Ledger Sync app, USB).
2. Everything after that is device-free: `ring encrypt`/`decrypt` need only the local member credential (OS keychain) + password + network.
So a VPS/CI host can **decrypt without a device**, but it must first become an LKRP *member*, and the only documented way to become one is `ring init` with the device attached (`init.ts`). **[inference]** Two workable demo shapes: (a) enroll the VPS by attaching the Ledger to it once over USB/USB-over-IP; (b) keep decryption on the operator machine and ship only *scoped, short-lived* plaintext to the daemon. On headless Linux, `@napi-rs/keyring` needs a Secret Service (gnome-keyring/`secret-tool`) — no D-Bus session = no keychain entry. **[inference, from the `@napi-rs/keyring` dependency in `keychain.ts` + the `secret-tool` example in SKILL.md]**

---

## 3. DMK (Device Management Kit) skills

Repo: https://github.com/LedgerHQ/agent-skills (`skills/dmk/`): `ledger-dmk-implementation` (+ `dmk-code-patterns.md`, `dmk-platform-patterns.md`, `dmk-sdk-reference.md`), `dmk-intent-vocabulary`, `dmk-business-logic`. They are **Markdown agent skills** (Claude Code / Cursor / Codex / Cline), not device firmware.

Packages (`skills/dmk/ledger-dmk-implementation/dmk-sdk-reference.md`):
```
npm i @ledgerhq/device-management-kit rxjs
npm i @ledgerhq/device-signer-kit-ethereum @ledgerhq/context-module   # context-module is a hard peer dep
```
Transports — Browser USB `@ledgerhq/device-transport-kit-web-hid`, Browser BLE `…-web-ble`, **Node USB `@ledgerhq/device-transport-kit-node-hid`**, RN HID/BLE, **Simulator (dev/test only) `@ledgerhq/device-transport-kit-speculos`**. Speculos transport talks HTTP to a Speculos instance (default `http://localhost:5000`) — https://github.com/LedgerHQ/device-sdk-ts/blob/develop/packages/transport/speculos/README.md
Known-working versions in the skill: DMK `1.2.0`, web-hid `1.2.3`, eth signer `1.12.0`.

Node/Bun signer wiring (`dmk-platform-patterns.md` §"Node.js CLI"):
```ts
import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit";
import { nodeHidTransportFactory } from "@ledgerhq/device-transport-kit-node-hid";
export const dmk = new DeviceManagementKitBuilder().addTransport(nodeHidTransportFactory).build();
// then: new SignerEthBuilder({ dmk, sessionId }).build()
```
EIP-712 (`dmk-code-patterns.md`):
```ts
const { observable } = signerEth.signTypedData("44'/60'/0'/0/0", {
  domain: { name: "MyApp", version: "1", chainId: 1 }, types: {...}, primaryType: "Message", message: {...},
});
// Completed → state.output.r / .s / .v
```
Other gotchas from the same files: every op returns `{ observable, cancel }` except `connect()`; **no `m/` prefix** in derivation paths; DMK packages are ESM-only (`"type": "module"`, Node 18+); the same `sessionId` works across chains; an EIP-1193 provider wrapper pattern for viem/ethers is included verbatim in `dmk-platform-patterns.md`. Signer methods (https://developers.ledger.com/docs/device-interaction/dmk-ts/references/signers/eth): `getAddress`, `signTransaction`, `signMessage`, `signTypedData`, `signDelegationAuthorization`, `verifySafeAddress`.

---

## 4. Do we need a physical device? Emulator?

- **wallet-cli / ring: yes, once.** `ring init` is device-required (`apps/wallet-cli/src/commands/ring/init.ts`); no Speculos path (https://developers.ledger.com/docs/ai-tools/ledger-cli).
- **DMK signer: no, strictly.** `@ledgerhq/device-transport-kit-speculos` exists and is labeled "**Simulator (dev/test only)**" in Ledger's own skill (`dmk-sdk-reference.md` line 22). Speculos runs the real `app-ethereum` binary (https://github.com/LedgerHQ/speculos), so `getAddress`/`signTypedData` are exercised end-to-end.
- **Track wording:** the ETHOnline page says nothing about hardware requirements, device acquisition, Speculos, or emulators — I re-fetched it specifically for this and got "The page contains no information about hardware requirements, device acquisition, or a submission checklist." What it *does* demand is "Something we can run without you in the room: a repo we can clone, or a recorded walkthrough." **[inference]** So: build for real hardware, add a Speculos-backed CI/demo path so judges can clone-and-run, and record the physical-device tap for the walkthrough. Do not claim Key Ring works without a device — it doesn't.
- Device models named by Ledger's stack diagram: Nano S+, Nano X, Stax, Flex (`dmk-sdk-reference.md`). Linux needs udev rules (same file) and `libudev-dev libusb-1.0-0-dev` (`apps/wallet-cli/README.md`).

---

## 5. Design options for ARCADE

### (a) Seller-daemon secrets in the Key Ring — **best fit, do this**
Matches the Continuity bullet verbatim ("Make `wallet-cli ring` the key backend for the `.env`, `sops`, or `age` files your repo already has") *and* the AI-Agents theme "secrets they cannot leak".

Shape: today the seller daemon reads `ANTHROPIC_API_KEY` etc. from a plaintext `.env`. After: the repo stores only `secrets/<listing>.env.enc`, produced by
`wallet-cli ring encrypt --key arcade-<sellerId> -i .env -o secrets/<listing>.env.enc`,
and at job time the daemon spawns
`WALLET_PASS=$(security find-generic-password -a default -s ledger-wallet-cli -w) wallet-cli ring decrypt --key arcade-<listing> -i secrets/<listing>.env.enc`
capturing stdout **in-process** (never a temp file, per the skill's "Decrypted output is sensitive" rule), injecting only the keys that listing declares into the sandbox env, and zeroing after the job. This slots exactly into the existing scrubbed-env sandbox in `packages/runner`.
- Per-listing scoping is free: `--key` names are per-domain ("Names are free-form (max 253 chars, no whitespace) — common patterns: project slugs, env tags"). One ring key per listing = a broker handing out scoped capabilities.
- Before/after story: "a seller's API key used to sit in plaintext on disk; now it is AES-256-GCM under a key derived from their Ledger seed, re-derivable on any machine from the seed, and a compromised repo/backup yields nothing."
- Risks to state honestly: `ring decrypt` needs network (LKRP trustchain restore) on every call — add a cache/timeout on the hot path; member-removal rotation invalidates old ciphertext; headless Linux needs a Secret Service.

### (b) Facilitator / fee-sweep key on a Ledger signer with device confirmation — **strong second, scope carefully**
Matches "Put a device confirmation in front of an action your product already performs" — the hub's platform fee sweep is exactly that action.
Wiring: `@ledgerhq/device-management-kit` + `nodeHidTransportFactory` + `SignerEthBuilder` in `apps/hub`; build the sweep tx with viem, RLP-encode to `Uint8Array` (required — `dmk-sdk-reference.md`), `signerEth.signTransaction(path, rlp)` → `{r,s,v}` → serialize → `eth_sendRawTransaction` on `https://rpc.testnet.arc.network`.
**Arc-testnet caveat, sourced:** `LedgerHQ/app-ethereum/src/network.c` has a static `NETWORK_MAPPING[]` of chain ids (1, 10, 137, …) — **5042002 is not in it**. `get_network_as_string_from_chain_id()` then falls back to printing the raw chain id ("No network name found so simply copy the chain ID as the network name"), and `get_displayable_ticker()` yields `g_unknown_ticker = "???"`. `app_compatible_with_chain_id()` returns true only if the chain equals the app's chain or both are in that table; `tests/unit/src/test_network.c` documents it as deciding "whether the running app may sign for a given chain", and `src/features/provide_erc20_token_information/cmd_provide_token_info.c` rejects token metadata for an incompatible chain (`UNSUPPORTED_CHAIN_ID`). The escape hatch is **dynamic networks** — `src/features/provide_network_info/` (`handle_network_tlv_payload`, `g_dynamic_network_list`), added as "Dynamic networks support" in `CHANGELOG.md`; the host supplies a signed network TLV descriptor. **[inference]** Arc testnet almost certainly has no such descriptor in Ledger's CAL yet, so an Arc *transaction* signed on device will render as chain `5042002` / ticker `???` and USDC amounts will not clear-sign. Plan for blind-signing-enabled + a clear on-screen story, or keep (b) as the *approval* gate only.

### (c) Buyer-side EIP-3009 signed on the Ledger — **the flashiest, and the cheapest to make work**
ARCADE already has the buyer sign `transferWithAuthorization` typed data offline; swap the local key for `signerEth.signTypedData(path, typedData)` with `domain.chainId = 5042002`, `verifyingContract = 0x3600…0000`, and enforce the ≥7-day `validBefore` we already set. Output `{r,s,v}` → concat to a 65-byte signature for the existing x402 header path.
Why this is the good one: EIP-712 is **chain-agnostic on the device** — the chain id is just a domain field the app displays (`doc/eip712.md`), so no `NETWORK_MAPPING` entry is needed to produce a valid signature. **[inference]** What we lose without an ERC-7730 descriptor is *filtering*: the app falls back to raw/verbose EIP-712, and Ledger has "Added blind-signing friction to EIP-712 v0 & unfiltered flows" (`app-ethereum/CHANGELOG.md`), with the setting exposed as `EIP712_VERBOSE_TOKEN` in `src/nbgl/ui_home.c`. Two mitigations, both demo-worthy: enable verbose EIP-712 and show every field on-device; **or** author an ERC-7730 descriptor for `transferWithAuthorization` with https://github.com/LedgerHQ/clear-signing-erc7730-builder + https://github.com/LedgerHQ/python-erc7730 so the buyer sees "Pay 0.05 USDC to <seller>" — that alone is a strong "concrete use of Ledger primitives" story, and a spend policy in the buyer SDK (per-call cap, per-day cap, allowlisted sellers) enforced *before* the device prompt gives the "clear boundary between autonomous and approved" the judges ask for.

**Recommended combination for a 9-day build:** (a) as the core Continuity before/after + (c) for the demo tap, with (b) reduced to a device confirmation on the sweep only if time allows. Ship a Speculos-backed CI test for (c) so the repo is clone-and-run.

---

## 6. Small, relevant open issues on Ledger repos

1. **https://github.com/LedgerHQ/device-sdk-ts/issues/1022** — "🐞 Ledger returns `EthAppCommandError` 6a80 (invalid data) when signing ERC-20 transfer on Arbitrum (blind signing enabled)" (open since 2025-09-11, label `bug_report`). Directly adjacent to our EVM/EIP-712 lane.
2. **https://github.com/LedgerHQ/device-sdk-ts/issues/1773** — "🐞 Unmapped status word 0x6901 makes `OpenAppDeviceAction` fail without ever sending OpenApp" (2026-08-22). Likely a one-line status-word map addition — a genuinely landable fix.
3. **https://github.com/LedgerHQ/device-sdk-ts/issues/1120** — "💡 How to convert Signature to base64" (`feature_request`, 2025-11-13). Doc/DX-sized.

Bonus (unfiled, verified by me — a ~3-line PR): `packages/transport/speculos/README.md` in device-sdk-ts tells you to `npm install @ledgerhq/device-transport-kit-speculos` but the code sample imports from `@ledgerhq/device-transport-speculos` (wrong package name), plus typos "developped", "trhough", "brower". https://github.com/LedgerHQ/device-sdk-ts/blob/develop/packages/transport/speculos/README.md — fixing this both satisfies "land a fix on a Ledger repo" and unblocks our own Speculos CI path.

Also worth knowing: `LedgerHQ/agent-skills` already carries hackathon-style feedback issues (#20, #22, #23, #24 — https://github.com/LedgerHQ/agent-skills/issues), and the track page explicitly asks for "Documentation feedback on Ledger tools and SDKs", so filing precise findings (e.g. the missing VPS enrollment story for `ring`) counts toward the submission.
