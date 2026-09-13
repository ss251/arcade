/**
 * Owner/root RENEW of one expired ARCADE skill leaf on ENSv2 Sepolia.
 *
 *   bun --no-env-file run scripts/ens-renew-leaf.ts                # read-only preflight + simulation
 *   bun --no-env-file run scripts/ens-renew-leaf.ts --send         # sign with the Keychain owner key and send
 *
 * The owner key is read in-process from Keychain (`arcade-ens-owner`) only with --send, and is
 * never printed or exported. The script refuses unless the leaf is expired, the parent seller
 * name is live, the owner holds root roles on the skill registry, and an eth_call simulation of
 * the exact renew succeeds. After sending it waits for the Sepolia receipt (not Arc), reads the
 * expiry and owner back, and writes a journal line per step under handoff/ (gitignored).
 */
import { execFile } from "node:child_process"
import { appendFileSync, mkdirSync } from "node:fs"
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { sepolia } from "viem/chains"
import { labelhash } from "viem/ens"

const SEND = process.argv.includes("--send")
const RPC = "https://ethereum-sepolia-rpc.publicnode.com"
const ETH_REGISTRY = "0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2" as const   // ENSv2 Sepolia set A
const ROOT_LABEL = "arcade", SELLER_LABEL = "scf821769ed", SKILL_LABEL = "usdc-flow-check"
const OWNER = "0x8260C32f90593f1B3B3bcba0Ec1D40ff8C189469" as const
const SELLER = "0xcf821769ED3c0E55e152745377bb833d7155A78a" as const
const KNOWN_SKILL_REGISTRY = "0xdafbdd2d7109d4706999573f60a3d1c17a96bdc6" as const // from the Sept 5 owner renewal
const DURATION = 30n * 24n * 3600n
const ALL_ROLES = BigInt(`0x${"1".repeat(64)}`)
const JOURNAL_DIR = "/Users/thescoho/Developer/arc-hackathon/handoff/ens-renew-2026-09-13"

const ABI = parseAbi([
  "function getSubregistry(string label) view returns (address)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function roles(uint256 resource, address account) view returns (uint256)",
  "function renew(uint256 anyId, uint64 newExpiry)",
])
const labelId = (label: string) => BigInt(labelhash(label))
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const fail = (m: string): never => { console.error("REFUSED:", m); process.exit(1) }
const journal = (entry: Record<string, unknown>) => {
  mkdirSync(JOURNAL_DIR, { recursive: true, mode: 0o700 })
  appendFileSync(`${JOURNAL_DIR}/journal.jsonl`, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n", { mode: 0o600 })
}
const keychain = (service: string) => new Promise<Hex>((resolve, reject) =>
  execFile("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8" }, (err, out) => {
    if (err) return reject(new Error("keychain read failed"))
    const v = out.trim(); if (!/^0x[0-9a-fA-F]{64}$/.test(v)) return reject(new Error("keychain value is not a private key")); resolve(v as Hex)
  }))

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) })
if ((await pub.getChainId()) !== 11155111) fail("wrong chain")
const head = await pub.getBlock()
const now = head.timestamp

const sellerRegistry = await pub.readContract({ address: ETH_REGISTRY, abi: ABI, functionName: "getSubregistry", args: [ROOT_LABEL] })
const skillRegistry = await pub.readContract({ address: sellerRegistry, abi: ABI, functionName: "getSubregistry", args: [SELLER_LABEL] })
if (!same(skillRegistry, KNOWN_SKILL_REGISTRY)) fail(`skill registry ${skillRegistry} differs from the retained ${KNOWN_SKILL_REGISTRY}`)
const sellerState = await pub.readContract({ address: sellerRegistry, abi: ABI, functionName: "getState", args: [labelId(SELLER_LABEL)] })
if (!(sellerState.expiry > now)) fail(`parent seller name expired at ${sellerState.expiry}`)
const leaf = await pub.readContract({ address: skillRegistry, abi: ABI, functionName: "getState", args: [labelId(SKILL_LABEL)] })
if (!same(leaf.latestOwner, SELLER)) fail(`leaf latestOwner ${leaf.latestOwner} is not the seller`)
if (!(leaf.expiry < now)) fail(`leaf is not expired (expiry ${leaf.expiry}, now ${now}); nothing to revive`)
const ownerRoles = await pub.readContract({ address: skillRegistry, abi: ABI, functionName: "roles", args: [0n, OWNER] })
if (ownerRoles !== ALL_ROLES) fail("owner does not hold root roles on the skill registry")
const balance = await pub.getBalance({ address: OWNER })
const newExpiry = now + DURATION

const report = {
  sepoliaBlock: Number(head.number), chainTime: Number(now), sellerRegistry, skillRegistry,
  sellerExpiry: Number(sellerState.expiry), leafExpiry: Number(leaf.expiry), leafExpiredForSeconds: Number(now - leaf.expiry),
  leafTokenId: leaf.tokenId.toString(), leafLatestOwner: leaf.latestOwner, ownerBalanceWei: balance.toString(),
  plan: { function: "renew(uint256,uint64)", anyId: labelId(SKILL_LABEL).toString(), newExpiry: Number(newExpiry), newExpiryIso: new Date(Number(newExpiry) * 1000).toISOString() },
}
// Simulate the exact call from the owner before anything is signed.
await pub.simulateContract({ address: skillRegistry, abi: ABI, functionName: "renew", args: [labelId(SKILL_LABEL), newExpiry], account: OWNER })
  .catch((e) => fail(`simulation reverted: ${(e as Error).message.split("\n")[0]}`))
console.log(JSON.stringify({ ...report, simulation: "ok", mode: SEND ? "send" : "dry-run" }, null, 1))
if (!SEND) process.exit(0)

journal({ step: "intent", ...report })
const account = privateKeyToAccount(await keychain("arcade-ens-owner"))
if (!same(account.address, OWNER)) fail("keychain key does not match the owner address")
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) })
const hash = await wallet.writeContract({ address: skillRegistry, abi: ABI, functionName: "renew", args: [labelId(SKILL_LABEL), newExpiry] })
journal({ step: "sent", hash })
console.log("sent", hash)
const receipt = await pub.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 240_000 })
journal({ step: "receipt", hash, status: receipt.status, block: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString() })
if (receipt.status !== "success") fail(`renew transaction reverted in block ${receipt.blockNumber}`)
const expiry = await pub.readContract({ address: skillRegistry, abi: ABI, functionName: "getExpiry", args: [labelId(SKILL_LABEL)] })
const owner = await pub.readContract({ address: skillRegistry, abi: ABI, functionName: "getOwner", args: [labelId(SKILL_LABEL)] })
const after = await pub.readContract({ address: skillRegistry, abi: ABI, functionName: "getState", args: [labelId(SKILL_LABEL)] })
const ok = expiry === newExpiry && same(owner, SELLER) && after.tokenId === leaf.tokenId
journal({ step: "readback", expiry: Number(expiry), owner, tokenId: after.tokenId.toString(), ok })
console.log(JSON.stringify({ hash, block: Number(receipt.blockNumber), gasUsed: receipt.gasUsed.toString(), expiry: Number(expiry), expiryIso: new Date(Number(expiry) * 1000).toISOString(), owner, tokenUnchanged: after.tokenId === leaf.tokenId, ok }, null, 1))
if (!ok) fail("readback mismatch after renewal; reconcile from the journal before any retry")
