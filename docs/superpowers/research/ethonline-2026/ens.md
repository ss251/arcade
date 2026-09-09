# ENSv2 research for ARCADE (ETHOnline 2026 continuity track)

Every claim below carries a URL or a GitHub file path. Fetched 2026-09-04.

---

## 0. TL;DR verdict

ENSv2 on Sepolia is **live, documented, and has an agent-native CLI**. The exact
shape the ENS prize asks for — "give agents their own namespace and delegated
permissions" — maps 1:1 onto ARCADE: `arcade.eth` → per-seller UserRegistry
subnames → per-skill subnames carrying x402 endpoint/price/payTo text records,
with the seller daemon key granted a **single-text-key** EAC role via
`authorizeTextRoles`, and delisting = `unregister()` / expiry. All of that is
real, shipping API surface, not speculative. Feasibility: **high**. Main risks
are (a) two parallel Sepolia deployment sets exist onchain, (b) `.eth` 2LD
registration on ENSv2 Sepolia is commit/reveal paid in MockUSDC (free to mint),
so budget ~2 txs + a 60s wait.

---

## 1. ENSv2 on Sepolia

### 1.1 Architecture (what changed vs v1)

Source: <https://docs.ens.domains/ensv2/overview>

- Hierarchical registries: "a full name like `sub.alice.eth` is a chain of
  entries across registries linked by subregistry pointers." (v1 was flat.)
- Role-based permissions (Enhanced Access Control) baked into core contracts,
  **replacing one-way fuse burning** — roles are revocable/reversible.
- Per-account **Permissioned Resolver** instead of one shared PublicResolver.
- `ERC1155Singleton` tokens with **mutable token IDs** (id changes on role update).
- Grace period reduced 90 → 28 days.
- **Verifiable Factory** for deterministic (CREATE2) proxy deployment.
- "deployed on the Sepolia testnet"; contracts are "not yet final and may change
  prior to mainnet deployment."

Six contract families: Permissioned Registry, Permissioned Resolver, ETH
Registrar, Universal Resolver V2, DNS name resolution, reverse resolution.

### 1.2 Sepolia addresses — ⚠ TWO LIVE SETS, DO NOT HARDCODE

Chain id **11155111**.

**Set A — what the docs site currently renders** (docs pins contracts-v2 commit
`97a57293f3b4279d94b571e678edb53ce62638f4`, see
`ensdomains/docs:scripts/ensv2-deployments.ts` lines 13–18; addresses file at
`ensdomains/contracts-v2:contracts/docs/addresses/sepolia.md@97a5729`,
"Deployed at 2026-07-30T17:34:25.243Z"):

| Contract | Address |
|---|---|
| RootRegistry | `0x8115186e8f2e0b0281e86ab91f0f48ba90364354` |
| ETHRegistry | `0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2` |
| ETHRegistrar | `0xa88553f454b77203b0d036a05c894d555eaaa2cc` |
| UniversalResolverV2 | `0x4a1817d13e9cf196f471725176355c1234b63c70` |
| ManagedUniversalResolverProxy | `0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1` |
| PermissionedResolverImpl | `0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e` |
| UserRegistryImpl | `0x624a25d67b59d587752ebec8dded8827dae52050` |
| VerifiableFactory | `0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef` |
| MockUSDC (payment token) | `0x768f42455a2d082e23ceef7d51e5787c82d67a39` |

Rendered page: <https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta>

**Set B — contracts-v2 `main` HEAD** (same file on `main`, "Deployed at
2026-06-29T05:35:12.452Z" — note the *earlier* timestamp despite being HEAD,
i.e. the two sets are parallel deployments, not a linear upgrade):

| Contract | Address |
|---|---|
| RootRegistry | `0x11b5bfbe9078d826b1edbdd1cfc12f5828d9f50c` |
| ETHRegistry | `0x67b728a792e789a8978b30cf1b3b641f19354b43` |
| ETHRegistrar | `0xa4449a0dd2b83007553d9b1d28b583a46a805a30` |
| UniversalResolverV2 | `0x85edf8b6b7d4211e2b07aa687506b746357b92cf` |
| PermissionedResolverImpl | `0x7e4b2d59938930168024201752ee5503df402303` |
| UserRegistryImpl | `0x840fa461059862ea466a711e8c98c8de732061c0` |
| VerifiableFactory | `0x118bc31a50d559f7015a8da26d54b3b030cdb70f` |
| MockUSDC | `0xd3322b29a7bdee707d1684676f149bf41aa3422f` |
| ManagedUniversalResolverProxy | `0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1` |
| UpgradableUniversalResolverProxy | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| ETHRenewerV1 | `0x1be516ae1b72765ae55bd5e9ca628c9058a1c622` |
| LockedMigrationController | `0x681802eff57b83edce99d688c023ab1284495176` |
| UnlockedMigrationController | `0xd021a69db7f9e276a59cbbccf06e7f1e5434215c` |
| WrapperRegistryImpl | `0xcf9f4863a1b44216cfc0be65f4e47b2b9a043924` |
| ENSV2Resolver | `0x6f988f299926ce361450db390d66dd604dcd8b21` |
| BatchRegistrar | `0xfe2aab6df1cbff84534ce65d9e4a755ba02d6795` |
| StandardRentPriceOracle | `0x09340d50a6489e7bfb2959acc4e32bcbc401e203` |
| LabelStore | `0xb03524289c16424f71802a1794c29c7bd1b9f577` |
| Graveyard | `0x6f4bf58ac55e0018589b2d9734ed8bb82740124d` |

**Verified onchain** (`eth_getCode` + `getSubregistry("eth")` via
`https://ethereum-sepolia-rpc.publicnode.com`, 2026-09-04): both root registries
have code and both are internally consistent —
`0x8115…→0xbdc8…` and `0x11b5…→0x67b7…`. So **both deployments are live**.
→ Action: resolve addresses at build time from the docs deployments table /
`contracts-v2/contracts/docs/addresses/sepolia.md`, and verify by walking
`RootRegistry.getSubregistry("eth")` before every demo. The judging criterion
"no hard-coded values" is satisfied by exactly this.

The app-developer tutorial says explicitly: "Do not hardcode a Universal
Resolver address" — always look it up.
<https://docs.ens.domains/ensv2/tutorial-app-developers>

### 1.3 Registering a name on ENSv2 Sepolia

UI: **ENS App <https://app.ens.dev>** and **ENS Explorer <https://explorer.ens.dev>**
resolve through / interact with the Sepolia ENSv2 deployment
(`ensdomains/docs:src/pages/learn/deployments.mdx`, "Sepolia (ENSv2 Beta)" section).

Cost: "Sepolia ETH for gas (any public faucet works)" + a fee "which the ETH
Registrar collects in an ERC20 token. On Sepolia that token is `MockUSDC` …
and it is free: its `mint` function has no access control, so anyone can mint
themselves a balance." (`ensdomains/docs:src/pages/ensv2/tutorial-app-developers.mdx`)

```js
await wallet.writeContract({
  address: mockUsdcAddress,
  abi: parseAbi(['function mint(address to, uint256 amount)']),
  functionName: 'mint',
  args: [account, 100_000_000n], // 100 USDC (6 decimals)
})
```

Commit/reveal, min 60s wait (<https://docs.ens.domains/ensv2/eth-registrar>):

```
makeCommitment(label, owner, secret, subregistry, resolver, duration, referrer)
commit(commitment)
// wait >= MIN_COMMITMENT_AGE (60 seconds)
register(label, owner, secret, subregistry, resolver, duration, paymentToken, referrer)
renew(label, duration, paymentToken, referrer)
```

Exact ETHRegistrar ABI (from `ensdomains/ens-cli:src/lib/contracts.ts`,
`ethRegistrarAbi`):
`register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)`.
Approve the registrar on the ERC20 first ("supports ERC20 tokens via
`safeTransferFrom`").

### 1.4 Library support

<https://docs.ens.domains/web/ensv2-readiness>

- **viem ≥ 2.35.0** (full read support)
- **ethers ≥ 6.17.0** (or the ENS ethers patch)
- **ENSjs ≥ 4.2.3**; **ENSjs v5** = preview, and "ENSv2 **write** support in
  libraries is limited to preview releases"
- web3.py ≥ 7.16.0, web3j ≥ 5.0.3, go-ens ≥ 4.0.0; web3.js no longer supported
- "for most applications, preparing for ENSv2 is as simple as updating to the
  latest version of a supported library" — reads are automatic; **writes need
  custom contract calls** (i.e. plain viem `writeContract` against the ABIs).

Read path works with stock viem on Sepolia
(<https://docs.ens.domains/ensv2/tutorial-app-developers>):

```js
const client = createPublicClient({ chain: sepolia, transport: http() })
const address = await client.getEnsAddress({ name: normalize('nick.eth') })
const value   = await client.getEnsText({ name, key: 'url' })
```

→ For ARCADE, **buyer-side resolution is stock viem `getEnsText` on Sepolia.
Seller-side writes are hand-rolled viem `writeContract` calls.** That is the
whole integration surface.

---

## 2. Permissioned Registry — own subname registry, expiry, revocability

Source: <https://docs.ens.domains/ensv2/permissioned-registry> and
`ensdomains/contracts-v2:contracts/src/registry/PermissionedRegistry.sol`,
`contracts/src/registry/libraries/RegistryRolesLib.sol`,
`contracts/src/registry/interfaces/IPermissionedRegistry.sol`.

Consolidates three v1 contracts (ENS Registry + BaseRegistrar + NameWrapper) into
one. Names have a three-state lifecycle: **Available / Reserved / Registered**.

### 2.1 Deploying your own subname registry

Subname registries are `UserRegistry` proxies deployed through the
**VerifiableFactory** (<https://docs.ens.domains/ensv2/verifiable-factory>):

```solidity
function deployProxy(address implementation, uint256 salt, bytes memory data)
    external returns (address proxy);
```

Canonical salt = `keccak256(abi.encode(keccak256("UserRegistry"), namehash(name), version))`,
version starts at `0`. Verbatim viem sample from the docs:

```js
const registryInitAbi = parseAbi([
  'function initialize(address rootAccount, uint256 roleBitmap)',
])
const version = 0n
const registrySalt = BigInt(keccak256(encodeAbiParameters(
  [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }],
  [keccak256(stringToHex('UserRegistry')), namehash('alice.eth'), version],
)))
const registryInitData = encodeFunctionData({
  abi: registryInitAbi, functionName: 'initialize',
  args: [account.address, ALL_ROLES],
})
await wallet.writeContract({
  address: VERIFIABLE_FACTORY, abi: verifiableFactoryAbi,
  functionName: 'deployProxy',
  args: [USER_REGISTRY_IMPL, registrySalt, registryInitData],
})
```

`ALL_ROLES = 0x1111…1111` (64 nybbles), confirmed in
`ensdomains/ens-cli:src/lib/v2.ts` line 47–49. Same salt scheme in
`ens-cli:src/lib/v2.ts` `defaultUserRegistrySalt()` (lines 52–65) — and the
ens-cli README states the default initializer "grants the root account all
UserRegistry roles."

Then **wire it into the parent**: `parentRegistry.setSubregistry(anyId, registry)`.
The contract-dev tutorial flags this as the critical step: "Parent names must
point to the UserRegistry via `setSubregistry()` on the parent registry before
subnames resolve through the Universal Resolver."
(<https://docs.ens.domains/ensv2/tutorial-contract-developers>)

Optionally set the **backward** pointer so the registry has a canonical name:

```js
await wallet.writeContract({ address: subRegistryAddress, abi: permissionedRegistryAbi,
  functionName: 'setParent', args: [parentRegistryAddress, 'sub'] })
// then lock it:
await wallet.writeContract({ ..., functionName: 'revokeRootRoles',
  args: [ROLE_SET_PARENT | ROLE_SET_PARENT_ADMIN, ownerAddress] })
```

`setParent(IRegistry parent, string label)` is `onlyRootRoles(ROLE_SET_PARENT)`
(`PermissionedRegistry.sol:171-178`). Both directions must agree for
`findCanonicalName` to succeed — "a registry can be mounted at multiple positions
via namespace aliasing" (<https://docs.ens.domains/ensv2/universal-resolver-v2>).

### 2.2 Minting subnames / expiry / revocation

From `PermissionedRegistry.sol` (line numbers from `main`):

```solidity
function register(string memory label, address owner, IRegistry registry,
                  address resolver, uint256 roleBitmap, uint64 expiry)
    public virtual returns (uint256);        // :181
function renew(uint256 anyId, uint64 newExpiry) public override;   // :214
function unregister(uint256 anyId) public;                          // :198
function setSubregistry(uint256 anyId, IRegistry registry) public;  // :142
function setResolver(uint256 anyId, address resolver) public;       // :150
function grantRoles(uint256 anyId, uint256 roleBitmap, address account) public; // :233
function revokeRoles(uint256 anyId, uint256 roleBitmap, address account) public; // :242
```

Views (`IPermissionedRegistry.sol`): `getState(anyId)`, `getStatus(anyId)`,
`getResource(anyId)`, `getTokenId(anyId)`, `getOwner(anyId)`,
`latestOwnerOf(tokenId)`. `anyId` may be a **labelhash, token id, or resource** —
convenient: `BigInt(keccak256(toHex(label)))` works everywhere.

- **Expiry**: absolute unix timestamp (`uint64`). Expired ⇒ `ownerOf()` returns
  zero; `latestOwnerOf()` still returns the recorded owner.
- **Revocable / delist**: `unregister(anyId)` burns the token and sets
  `expiry = block.timestamp` — "immediately making the name available"
  (`PermissionedRegistry.sol:198-208`). Roles are separately revocable with
  `revokeRoles`. This is the ENSv2 answer to "expiring/revocable subnames".
- **Non-transferable**: withhold `ROLE_CAN_TRANSFER_ADMIN` from the owner and
  "the name is effectively non-transferable, similar to the `CANNOT_TRANSFER`
  fuse." Transfers atomically move all owner-held roles to the new owner.
- **Revival semantics**: `renew()` on an expired name restores previous owner +
  roles; re-`register()` starts a fresh token instead.
- Registering with `owner = address(0)` **reserves** without assigning.

### 2.3 Registry role model (exact constants)

`contracts/src/registry/libraries/RegistryRolesLib.sol` — nybble-packed, admin
counterpart at `role << 128`:

| Constant | Value | Scope | Purpose |
|---|---|---|---|
| `ROLE_REGISTRAR` | `1 << 0` | root only | register / reserve names |
| `ROLE_REGISTER_RESERVED` | `1 << 4` | root only | promote RESERVED → REGISTERED |
| `ROLE_SET_PARENT` | `1 << 8` | root only | set parent registry pointer |
| `ROLE_UNREGISTER` | `1 << 12` | root or token | delete names |
| `ROLE_RENEW` | `1 << 16` | root or token | extend expiry |
| `ROLE_SET_SUBREGISTRY` | `1 << 20` | root or token | change child registry |
| `ROLE_SET_RESOLVER` | `1 << 24` | root or token | change resolver |
| `ROLE_CAN_TRANSFER_ADMIN` | `(1 << 28) << 128` | root or token | authorize ERC1155 transfer (checked on owner, not operator) |
| `ROLE_WAS_RESERVED` | `1 << 32` | token only | tag, **not revocable** |
| `ROLE_SET_URI` | `1 << 36` | root only | set token URI |
| `ROLE_CAN_NAME` | `1 << 120` | root only | contract naming |
| `ROLE_UPGRADE` | `1 << 124` | root only | UUPS upgrade |

Registrar authorization from the contract-dev tutorial:
`registry.grantRootRoles(ROLE_REGISTRAR | ROLE_RENEW, registrarAddress)`.
Its recommended registrant bitmap:

```solidity
uint256 constant REGISTRATION_ROLE_BITMAP =
    RegistryRolesLib.ROLE_SET_SUBREGISTRY
  | RegistryRolesLib.ROLE_SET_SUBREGISTRY_ADMIN
  | RegistryRolesLib.ROLE_SET_RESOLVER
  | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN
  | RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN;
```

Foundry setup (same tutorial):
```
forge init simple-subname-registrar && cd simple-subname-registrar
forge install ensdomains/contracts-v2
```
```solidity
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
```

### 2.4 Enhanced Access Control (EAC)

<https://docs.ens.domains/ensv2/enhanced-access-control>

- "the permission system used throughout ENSv2 … controls who is allowed to do
  what, and on which names."
- Capacity: 2^256 resources, **64 roles per resource** (32 regular + 32 admin),
  **up to 15 holders per role**. ⚠ The 15-holder cap matters if ARCADE ever
  wants many keys on one record.
- Resources are names (labelhash/namehash). `ROOT_RESOURCE = 0` is the master key
  ("grants permissions across all names").
- Bitmap layout: regular roles = lower 128 bits (nybbles 0–31), admin roles =
  upper 128 bits (nybbles 32–63), one 4-bit nybble per slot.
- API:
  `grantRoles(resource, roleBitmap, account)` / `revokeRoles(...)`,
  `grantRootRoles(roleBitmap, account)` / `revokeRootRoles(...)`,
  views `roles(resource, account)`, `roleCount(resource)`,
  `hasRoles(resource, roleBitmap, account)`, `hasRootRoles(roleBitmap, account)`,
  `hasAssignees(resource, roleBitmap)`, `getAssigneeCount(resource, roleBitmap)`.
- Event: `EACRolesChanged(resource, account, oldRoleBitmap, newRoleBitmap)`.

**"Can edit only text record X" is NOT done at the registry layer** — it is a
resolver-level grant, see §3.2.

---

## 3. Permissioned Resolver, record aliasing, namespace aliasing

Source: <https://docs.ens.domains/ensv2/permissioned-resolver>,
`ensdomains/contracts-v2:contracts/src/resolver/PermissionedResolver.sol`,
`contracts/src/resolver/libraries/PermissionedResolverLib.sol`.

### 3.1 What it is

"each account gets its own resolver instance, deployed as a UUPS-upgradeable
proxy." All names owned by that account share one resolver. Deployed through the
same VerifiableFactory; canonical salt (per `ens-cli` README + `src/lib/v2.ts`
lines 54, 76, 87):

```
keccak256(abi.encode(keccak256("OwnedResolver"), owner, 0))
```

"the canonical scheme shared with the contracts-v2 setup script and the manager
app's migration flow, so the resolver can be rediscovered from the owner address
alone." The predicted CREATE2 address can be committed **before** deployment,
so you can deploy the resolver during the 60s registration commitment wait.

`initialize(address admin, uint256 roleBitmap, bytes[] setters)` runs
`multicall(setters)` — **records can be initialized atomically in the deploy tx**
(`PermissionedResolver.sol:234-240`). ens-cli exposes this as
`ens resolver deploy <owner> --name <name> --records '[…]'`.

### 3.2 Resolver role model (exact constants)

`contracts/src/resolver/libraries/PermissionedResolverLib.sol`:

| Constant | Value |
|---|---|
| `ROLE_SET_ADDR` | `1 << 0` |
| `ROLE_SET_TEXT` | `1 << 4` |
| `ROLE_SET_CONTENTHASH` | `1 << 8` |
| `ROLE_SET_PUBKEY` | `1 << 12` |
| `ROLE_SET_ABI` | `1 << 16` |
| `ROLE_SET_INTERFACE` | `1 << 20` |
| `ROLE_SET_NAME` | `1 << 24` |
| `ROLE_SET_ALIAS` | `1 << 28` (root only) |
| `ROLE_CLEAR` | `1 << 32` |
| `ROLE_SET_DATA` | `1 << 36` |
| `ROLE_CAN_NAME` | `1 << 120` |
| `ROLE_UPGRADE` | `1 << 124` (root only) |

Admin counterpart = `role << 128`. ⚠ Docs page lists `ROLE_SET_ALIAS` as
`1 << 28` and `ROLE_UPGRADE` as `1 << 124` — matches source. (The docs prose
mis-numbers `ROLE_SET_TEXT` scope in places; **trust the .sol file**.)

The clever bit: `PermissionedResolverLib.resource(bytes32 node, bytes32 part)`
(line 71) and `partHash(string)` / `partHash(uint256)` (lines 85–95) mean an EAC
*resource* can be **(node, specific text key)** or **(node, specific coinType)**,
not just the node. That is exactly "can edit only text record X."

### 3.3 Granular delegation API (the ENS-prize money shot)

```solidity
function authorizeNameRoles(bytes calldata toName, uint256 roleBitmap, address account, bool grant); // :273
function authorizeTextRoles(bytes calldata toName, string calldata key, address account, bool grant); // :303
function authorizeDataRoles(bytes calldata toName, string calldata key, address account, bool grant); // :336
function authorizeAddrRoles(bytes calldata toName, uint256 coinType, address account, bool grant);    // :369
```

All take **DNS-encoded** names (`packetToBytes`). Name-level grants cover all
records; record-level grants restrict to a single key / coin type.

Verbatim docs sample — delegate exactly one text key:

```js
const dnsName = toHex(packetToBytes('alice.eth'))
await wallet.writeContract({ address: resolverAddress, abi: permissionedResolverAbi,
  functionName: 'authorizeTextRoles', args: [dnsName, 'avatar', dappAddress, true] })
// the dapp can now, and only, set that key:
await dappWallet.writeContract({ address: resolverAddress, abi: permissionedResolverAbi,
  functionName: 'setText', args: [node, 'avatar', 'https://example.com/avatar.png'] })
// revoke:
args: [dnsName, 'avatar', dappAddress, false]
```

Lock a record permanently (irreversible):
```js
await wallet.writeContract({ ..., functionName: 'setContenthash', args: [node, hash] })
await wallet.writeContract({ ..., functionName: 'revokeRootRoles',
  args: [ROLE_SET_CONTENTHASH | ROLE_SET_CONTENTHASH_ADMIN, ownerAddress] })
```

### 3.4 Record aliasing

"you can make one name's records point to another name's records, so they always
resolve identically without duplicating data."

```solidity
function setAlias(bytes calldata fromName, bytes calldata toName)
    external onlyRootRoles(ROLE_SET_ALIAS);   // PermissionedResolver.sol:258
```
```js
await wallet.writeContract({ address: resolverAddress, abi: permissionedResolverAbi,
  functionName: 'setAlias',
  args: [toHex(packetToBytes('wallet.eth')), toHex(packetToBytes('alice.eth'))] })
// remove: pass '0x' as the target
```
Read back with `getAlias(fromName)`. **Cycle protection**: self-referential
A→A is detected and applied once; longer cycles cause out-of-gas reverts.
Use cases named in docs: multiple domains sharing records, name migration,
**subname delegation** ("let `pay.alice.eth`, `nft.alice.eth` resolve to the
parent's records without duplicating them") — directly usable for ARCADE
skill-version aliases (`v2.myskill.seller.arcade.eth` → `myskill.seller…`).

### 3.5 Namespace aliasing (registry level — different thing)

<https://docs.ens.domains/ensv2/registry-hierarchy#namespace-aliasing>

"by reusing the same subregistry for more than one name, entire namespaces can be
aliased to each other." `inigo.montoya.eth` and `inigo.wallet.eth` resolve
identically when both point at the same subregistry (resolver inheritance still
differs per branch). Docs explicitly contrast the two: "Resolver aliasing shares
records; registry aliasing shares entire namespaces."

### 3.6 Resolution / "wildcard"

Registry-hierarchy page: resolution "walks down the registry tree starting from
the root, querying resolver and subregistry pointers at each level. The deepest
resolver found along the path takes precedence (**longest-suffix matching**).
When a name lacks its own resolver, it inherits from the closest ancestor that
has one configured." → ENSv2 gets ENSIP-10-style wildcard behavior structurally:
set one resolver at `arcade.eth` and every descendant inherits it unless
overridden. UniversalResolverV2 is the single entry point; viem's
`getEnsText`/`getEnsAddress` use it with full CCIP-read.

Full resolver surface (docs page "Write Functions" / "View Functions"):
`setText/setAddr(node,addr)/setAddr(node,coinType,bytes)/setContenthash/setName/
setPubkey/setABI/setInterface/setData/setAlias/clearRecords/multicall`;
`addr/text/contenthash/name/pubkey/ABI/data/interfaceImplementer/hasAddr/
getAlias/recordVersions/resolve`. Events include `TextChanged`, `AliasChanged`,
`VersionChanged`, and the resource-tagging events `NamedResource`,
`NamedTextResource`, `NamedDataResource`, `NamedAddrResource`.
`clearRecords(node)` bumps `recordVersions(node)` — a cheap "delist everything".

---

## 4. ENSIP-25 and ENSIP-26 (agent identity)

### 4.1 ENSIP-26 — Agent Text Records

<https://docs.ens.domains/ensip/26/>

Extends ENSIP-5. "An ENS name provides a single, multichain identity for an AI
agent." Two keys:

| Key | Value format |
|---|---|
| `agent-context` | "Any format suitable for agentic systems (plain text, Markdown, YAML, JSON, etc.)" — describes the agent and how to interact with it; may reference registries or endpoints |
| `agent-endpoint[<protocol>]` | "A URL (e.g. `https://`, `http://`) identifying the endpoint for the specified agent protocol" |

Defined protocols: **`mcp`** (Model Context Protocol), **`a2a`** (Agent-to-Agent),
**`web`** (web/human-facing UI). Docs example (swap agent):
`agent-endpoint[mcp] = https://token-swap.mcp`,
`agent-endpoint[a2a] = https://token-swap.a2a`,
`agent-endpoint[web] = https://agent.example.com/`.

### 4.2 ENSIP-25 — AI Agent Registry ENS Name Verification

<https://docs.ens.domains/ensip/25/>

Key format: **`agent-registration[<registry>][<agentId>]`** where `<registry>` is
the **ERC-7930 interoperable address with `0x` prefix** and `<agentId>` is the
registry-defined id (must not contain `[` or `]`).

Verification procedure:
1. read claimed ENS name + agentId + registry address from the registry entry;
2. build the key;
3. resolve that text record on the claimed name;
4. **non-empty value ⇒ verified.** "The presence of a non-empty value is
   interpreted as an attestation by the ENS name owner that the ENS name is
   associated with the referenced AI agent registry entry."

**ERC-8004 relation**: ERC-8004 "serves as the motivating use case — an on-chain
AI agent identity registry where agents declare associated ENS names requiring
verification." ENSIP-25 closes the loop the other way (name → registry entry), so
the binding is bidirectional and neither side can be spoofed alone.

Docs example: registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, ERC-7930
encoded `0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432`, agent `167`:
```
agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][167]
```

---

## 5. ens-cli — agent-native, and yes it does MCP + skills

Repo: <https://github.com/ensdomains/ens-cli>. Description (GitHub API):
*"Agent-native CLI for the ENS protocol. Not production-ready."* Last push
2026-08-25. README carries a WARNING: "experimental ENS CLI preview … not
released on npm … may include frequent breaking changes."

- "Built for autonomous AI agents but works for humans too."
- Built with **Incur** (<https://github.com/wevm/incur>) "for agent-native
  features (MCP server mode, skills, token-efficient output)" and **viem** for
  resolution with full CCIP-read.
- **Read ops execute; write ops emit unsigned calldata JSON `{to, data, value}`**
  for the caller to sign/broadcast. (Docs suggest
  <https://transact.swiss-knife.xyz/send-tx> for manual testing.)
- Install: `alias ens='npx "https://pkg.pr.new/ensdomains/cli/@ensdomains/cli@main"'`
  (or pin a commit hash in place of `main`). Bun v1.0+ to build from source.
- Agent integration block, verbatim:
  ```sh
  ens --llms       # LLM-readable command manifest
  ens mcp add      # register as an MCP server
  ens skills add   # generate skill files for agents
  ens --mcp        # run in MCP stdio mode
  ```
  → It can be wired straight into this repo as an MCP server *and* as skills.
- Commands (`src/commands/`): `available, get, migrate, price, register, renew,
  resolver, set, subname, subregistry, whois`. `src/lib/`: `client, cointype,
  context, contracts, records, utils, v2`. Chains: `mainnet | sepolia`
  (`src/lib/context.ts:11`).
- ENSv2-specific commands that do exactly what ARCADE needs:
  - `ens resolver deploy 0xOwner --chain sepolia --json` → predicts CREATE2
    address + emits `deployProxy` calldata; `alreadyDeployed` short-circuits.
    With `--name` + `--records '[{"type":"text","key":"url","value":"…"}]'` it
    initializes records in the deploy tx. Options `--admin`, `--salt`,
    `--role-bitmap` (default `0x1111…1111`).
  - `ens subregistry deploy parent.eth --deployer 0x… --chain sepolia --json`
  - `ens subregistry set parent.eth --registry 0xSub --chain sepolia`
  - `ens subname create sub.parent.eth --owner 0x… --chain sepolia`
    (options `--resolver --subregistry --duration --role-bitmap`; auto-walks the
    registry hierarchy to find the parent's subregistry)
  - `ens set text name.eth --key K --value V`, `ens set batch … --data '[…]'`
    (multicall), `ens set address`, `ens set contenthash`, `ens set name`
  - `ens register commit|reveal`, `ens renew`, `ens resolver set`, `ens whois`,
    `ens migrate`
- Config precedence: `--rpc` > `ETH_RPC_URL` > public fallback. Output `--json`
  or `--format yaml`.

Other ENS agent tooling (<https://docs.ens.domains/building-with-ai/>):
`https://docs.ens.domains/llms.txt`, `/llms-full.txt`; official recommendation
`claude mcp add context7 -- npx -y @upstash/context7-mcp`; community MCPs
(ETHID MCP, Ethereum MCP, ENS MCP by Namespace).

---

## 6. Concrete design for ARCADE

### 6.1 Name tree

```
arcade.eth                     (ETHRegistry 2LD, registered via ETHRegistrar commit/reveal)
  └─ UserRegistry "SellerRegistry"   (VerifiableFactory proxy, ARCADE hub owns root roles)
       └─ <seller>.arcade.eth        (register(label, sellerAddr, skillRegistry, resolver, bitmap, expiry))
            └─ UserRegistry "SkillRegistry" (one per seller, deployed by seller or hub)
                 └─ <skill>.<seller>.arcade.eth
```

Text records on `<skill>.<seller>.arcade.eth`:

| Key | Value | Source of key |
|---|---|---|
| `agent-endpoint[web]` | `https://hub.arcade.../x/<seller>/<skill>` | ENSIP-26 |
| `agent-endpoint[mcp]` | ARCADE buyer MCP URL for the skill | ENSIP-26 |
| `agent-context` | Markdown: what the skill does, schema, price, x402 flow | ENSIP-26 |
| `arcade.price` | e.g. `0.05` (USDC) | ARCADE-defined (ENSIP-5 free-form) |
| `arcade.chain` | `eip155:5042002` | CAIP-2, from repo CLAUDE.md |
| `arcade.payTo` | seller settlement address on Arc | ARCADE-defined |
| `arcade.schema` | JSON schema URL/hash | ARCADE-defined |
| `agent-registration[<erc7930 registry>][<agentId>]` | non-empty attestation | ENSIP-25 (if ERC-8004 registry is added) |
| `addr(node, coinType=60)` | seller EVM address | ENSv2 `setAddr` |

Prefer **namespaced custom keys** (`arcade.price`) — ENSIP-5 convention, and
avoids colliding with future standard keys. Put the same data in
`agent-context` as JSON so a generic ENSIP-26 agent (not just ARCADE) can use it.

### 6.2 Exact call sequence

**One-time (hub):**
1. `MockUSDC.mint(hub, 100_000_000)` → `MockUSDC.approve(ETHRegistrar, …)`
2. `ETHRegistrar.makeCommitment(...)` → `commit(...)` → wait ≥60s →
   `register("arcade", hub, secret, sellerRegistry, hubResolver, duration, MockUSDC, referrer)`
   — pass the **predicted** UserRegistry + resolver addresses here so no
   follow-up tx is needed (README explicitly supports predicting before deploy).
3. `VerifiableFactory.deployProxy(USER_REGISTRY_IMPL, saltFor("arcade.eth"), initialize(hub, ALL_ROLES))`
4. `VerifiableFactory.deployProxy(PERMISSIONED_RESOLVER_IMPL, keccak256(abi.encode(keccak256("OwnedResolver"), hub, 0)), initialize(hub, ALL_ROLES, setters))`
5. `ETHRegistry.setSubregistry(labelhash("arcade"), sellerRegistry)` and
   `ETHRegistry.setResolver(labelhash("arcade"), hubResolver)` (if not set at register)
6. `sellerRegistry.setParent(ETHRegistry, "arcade")`, then
   `sellerRegistry.revokeRootRoles(ROLE_SET_PARENT | ROLE_SET_PARENT_ADMIN, hub)` to lock it.

**Per seller onboarding (one tx from the hub, or from an ARCADE registrar
contract holding `ROLE_REGISTRAR | ROLE_RENEW` on `sellerRegistry`'s root):**
```solidity
sellerRegistry.register(
  sellerLabel, sellerAddress, IRegistry(skillRegistry), hubResolver,
  RegistryRolesLib.ROLE_SET_SUBREGISTRY | RegistryRolesLib.ROLE_SET_SUBREGISTRY_ADMIN
  | RegistryRolesLib.ROLE_SET_RESOLVER  | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN,
  // deliberately NOT ROLE_CAN_TRANSFER_ADMIN -> non-transferable seller identity
  uint64(block.timestamp + 90 days)     // expiring subname; renew on good standing
);
```

**Per skill listing:**
```
skillRegistry.register(skillLabel, sellerAddress, IRegistry(address(0)), hubResolver, bitmap, expiry)
hubResolver.setText(namehash("<skill>.<seller>.arcade.eth"), "arcade.price", "0.05")
hubResolver.setText(node, "arcade.chain", "eip155:5042002")
hubResolver.setText(node, "arcade.payTo", "0x…")
hubResolver.setText(node, "agent-endpoint[web]", "https://…/x/<seller>/<skill>")
hubResolver.setText(node, "agent-context", "<markdown>")
// batched via hubResolver.multicall([...]) — one tx
```

**Delegating the seller *daemon key* (the whole ENS-prize narrative):**
```js
const dnsName = toHex(packetToBytes(`${skill}.${seller}.arcade.eth`))
// daemon may update ONLY these keys, nothing else, on this name only:
for (const key of ['arcade.price', 'agent-endpoint[web]', 'agent-context'])
  await hubWallet.writeContract({ address: hubResolver, abi: permissionedResolverAbi,
    functionName: 'authorizeTextRoles', args: [dnsName, key, daemonKey, true] })
```
The daemon key can rotate its own price and endpoint but **cannot** touch
`arcade.payTo` (funds destination) — a genuinely new, demoable security property
that ENSv1 could not express. Revocation is the same call with `false`.
⚠ Cap: max **15 holders per role** per resource (EAC docs) — one resource here is
(node, textKeyHash), so 15 daemon keys per key per skill. Fine.

**Delisting:** `skillRegistry.unregister(labelhash(skill))` → status goes
AVAILABLE immediately; or let the 90-day expiry lapse; or
`hubResolver.clearRecords(node)` (bumps `recordVersions`) for a soft delist.

**Buyer-side resolution (stock viem, Sepolia, zero ARCADE-specific infra):**
```js
const sepoliaClient = createPublicClient({ chain: sepolia, transport: http() })
const name = normalize(`${skill}.${seller}.arcade.eth`)
const [endpoint, price, chain, payTo] = await Promise.all([
  sepoliaClient.getEnsText({ name, key: 'agent-endpoint[web]' }),
  sepoliaClient.getEnsText({ name, key: 'arcade.price' }),
  sepoliaClient.getEnsText({ name, key: 'arcade.chain' }),
  sepoliaClient.getEnsText({ name, key: 'arcade.payTo' }),
])
// then x402 402-challenge / pay on Arc (chain 5042002) to payTo
```
This replaces "sellers/buyers are identified by EVM addresses today" with
human-readable, hierarchically-owned, revocable agent names — the UX improvement
the continuity prize asks for. Add `ens whois`-style ENS resolution to
`packages/buyer` SDK + MCP so a buyer agent can say
`arcade.call('summarize.acme.arcade.eth', input)`.

### 6.3 Feasibility assessment

**High.** Everything needed is shipping API:
- Registry deploy + subname mint + expiry + non-transferability: ✅ documented,
  ABI-stable, and `ens-cli` already emits the calldata (`subregistry deploy/set`,
  `subname create`).
- Per-text-key delegation: ✅ `authorizeTextRoles` exists in
  `PermissionedResolver.sol:303` with a docs code sample.
- Read path: ✅ stock viem ≥2.35.0 `getEnsText` — no custom resolver client.
- Write path: ⚠ "ENSv2 write support in libraries is limited to preview
  releases" — so write with raw viem `writeContract` against the contracts-v2
  ABIs, or shell out to `ens-cli` for calldata. Budget for this; do **not** plan
  on ensjs v5 write helpers.

**Risks / effort estimate**
1. **Two live Sepolia deployment sets** (§1.2) — pick the one the ENS App /
   Explorer uses (Set A) so judges can see the name in the official UI, and
   resolve addresses at runtime.
2. Registering `arcade.eth` on Sepolia: `arcade` may be taken/reserved in the v2
   Sepolia namespace. Have a fallback label (`arcade-hub`, `arcadelabs`) and
   check `ETHRegistrar.available("arcade")` first. Reserved (pre-migrated) names
   can only be claimed by v1 owners via the migration controllers.
3. Contracts are "not yet final and may change prior to mainnet deployment"
   (overview page) — fine for a hackathon, note it in the README.
4. ~1 day of work: hub bootstrap script (Foundry or a viem TS script in
   `scripts/`), a `packages/core` ENS name ↔ listing mapper, buyer-SDK resolution,
   and a UI panel in `apps/web` showing the name tree + who holds which role.

### 6.4 "Targets an existing project's testnet deployment" with ARCADE on Arc

The continuity prize says the integration "must use ENSv2 on Sepolia and target
an existing project's testnet deployment." ARCADE's existing testnet deployment
*is* Arc testnet (chain 5042002). Reading of the requirement:

- The **ENS side must be on Sepolia** — non-negotiable; ENSv2 exists nowhere else
  (deployments table lists only Mainnet v1, Sepolia ENSv2 beta, Holesky legacy).
- "an existing project's testnet deployment" = *your project must already be
  deployed on a testnet and this integration must plug into it* — it does not say
  the project must live on Sepolia. ARCADE's hub, seller daemon and settlement on
  Arc testnet satisfy "existing testnet deployment."
- **Cross-chain is not just fine, it is the point.** ENSIP-26's own framing:
  "An ENS name provides a single, **multichain** identity for an AI agent."
  ENSv2 resolvers store multichain addresses via `setAddr(node, coinType, bytes)`,
  and ENSIP-25 uses **ERC-7930 interoperable addresses** precisely so a name can
  reference a registry on another chain. Naming on Sepolia + settlement on Arc is
  the canonical ENS pattern (mainnet naming + L2 settlement), not a workaround.

**Make the cross-chain link explicit and machine-checkable** so a judge cannot
call it decorative:
1. Store `arcade.chain = eip155:5042002` (CAIP-2) and `arcade.payTo` on every
   skill name, and have the buyer SDK **refuse to pay** if the 402 challenge's
   `payTo`/chain disagrees with what ENS resolved. That makes ENS the authority
   over the payment destination — a real security property, not a label.
2. Register the Arc address as a **multichain addr record**: derive the SLIP-44
   coinType for chain 5042002 (`0x80000000 | chainId` per ENSIP-11) and
   `setAddr(node, coinType, arcAddress)`, so `ens get address x.arcade.eth
   --coin-type <n>` returns the Arc settlement address.
3. Demo beat: *revoke the daemon's `authorizeTextRoles` on Sepolia → next buyer
   call on Arc refuses to settle.* One tx on Sepolia visibly changes behavior on
   Arc. That is the "functional demo, no hard-coded values" the prize wants.

### 6.5 Which open-track ENSv2 criteria this hits

| Criterion | ARCADE coverage |
|---|---|
| Hierarchical registry | `arcade.eth` → seller registry → skill registry, 3 levels |
| Own subname registry | two UserRegistry proxies via VerifiableFactory |
| Wildcard resolution | one resolver at `arcade.eth`, inherited by all descendants (longest-suffix) |
| Enhanced Access Control (role-based) | registry bitmaps per seller + resolver per-key grants |
| Permissioned Resolver | hub-owned OwnedResolver, `authorizeTextRoles` per key |
| Record aliasing | skill version aliases (`v2.skill…` → `skill…`) via `setAlias` |
| Namespace aliasing | mirror a seller's skill namespace under a category branch by reusing the subregistry |
| Expiring / revocable / non-transferable subnames | 90-day expiry, `unregister()`, withhold `ROLE_CAN_TRANSFER_ADMIN` |
| Bonus: AI agents as namespaces with identity + permissions | every skill is an agent namespace with ENSIP-26 records and a scoped daemon key |

---

## 7. Source index

- ENSv2 overview — <https://docs.ens.domains/ensv2/overview>
- Permissioned Registry — <https://docs.ens.domains/ensv2/permissioned-registry>
- Permissioned Resolver — <https://docs.ens.domains/ensv2/permissioned-resolver>
- Enhanced Access Control — <https://docs.ens.domains/ensv2/enhanced-access-control>
- Registry Hierarchy (namespace aliasing) — <https://docs.ens.domains/ensv2/registry-hierarchy>
- Universal Resolver V2 — <https://docs.ens.domains/ensv2/universal-resolver-v2>
- Verifiable Factory — <https://docs.ens.domains/ensv2/verifiable-factory>
- ETH Registrar — <https://docs.ens.domains/ensv2/eth-registrar>
- Contract-dev tutorial — <https://docs.ens.domains/ensv2/tutorial-contract-developers>
- App-dev tutorial — <https://docs.ens.domains/ensv2/tutorial-app-developers>
- ENSv2 readiness (library versions) — <https://docs.ens.domains/web/ensv2-readiness>
- Deployments — <https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta>
- Building with AI — <https://docs.ens.domains/building-with-ai/>
- ENSIP-25 — <https://docs.ens.domains/ensip/25/>
- ENSIP-26 — <https://docs.ens.domains/ensip/26/>
- ens-cli — <https://github.com/ensdomains/ens-cli> (`README.md`, `src/lib/v2.ts`,
  `src/lib/contracts.ts`, `src/lib/context.ts`, `src/commands/`)
- contracts-v2 — <https://github.com/ensdomains/contracts-v2>
  (`contracts/docs/addresses/sepolia.md`,
   `contracts/src/registry/PermissionedRegistry.sol`,
   `contracts/src/registry/libraries/RegistryRolesLib.sol`,
   `contracts/src/registry/interfaces/IPermissionedRegistry.sol`,
   `contracts/src/resolver/PermissionedResolver.sol`,
   `contracts/src/resolver/libraries/PermissionedResolverLib.sol`)
- docs repo — <https://github.com/ensdomains/docs>
  (`scripts/ensv2-deployments.ts`, `src/pages/learn/deployments.mdx`,
   `src/pages/ensv2/*.mdx`)
- ENS App <https://app.ens.dev> · ENS Explorer <https://explorer.ens.dev>
- Incur (ens-cli's agent framework) — <https://github.com/wevm/incur>
- Onchain verification 2026-09-04 via `https://ethereum-sepolia-rpc.publicnode.com`
  (`eth_getCode`, `getSubregistry("eth")`)
