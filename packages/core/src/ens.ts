import { encodeAbiParameters, keccak256, stringToHex, toHex } from "viem"
import { labelhash, namehash, normalize, packetToBytes } from "viem/ens"

/** ENSv2 beta names live on Sepolia; payment settlement stays on the selected Arc chain. */
export const ENS_SEPOLIA_CHAIN_ID = 11155111
export const ENS_TEXT_KEYS = Object.freeze({
  payTo: "arcade.payTo", chain: "arcade.chain", priceAtomic: "arcade.priceAtomic",
  endpoint: "arcade.endpoint", web: "agent-endpoint[web]", mcp: "agent-endpoint[mcp]",
  context: "agent-context"
} as const)

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const UINT256_MAX = (1n << 256n) - 1n
const addressOf = (value: string): `0x${string}` => {
  if (value.length !== 42 || !ADDRESS.test(value)) throw new Error("ENS: expected a 20-byte address")
  return value.toLowerCase() as `0x${string}`
}

/** ERC-7930 v1: version || eip155 type || reference length || reference || address length || address. */
export const erc7930Eip155 = (chainId: number | bigint, address: string): `0x${string}` => {
  if (typeof chainId !== "bigint" && !Number.isSafeInteger(chainId)) throw new Error("ERC-7930: invalid chain id")
  const id = BigInt(chainId)
  // The reference length field is one byte. Bound before converting a potentially huge integer.
  if (id <= 0n || id >= (1n << 2040n)) throw new Error("ERC-7930: chain reference must occupy 1–255 bytes")
  const hex = id.toString(16), ref = hex.length % 2 ? `0${hex}` : hex
  const length = (ref.length / 2).toString(16).padStart(2, "0")
  return `0x00010000${length}${ref}14${addressOf(address).slice(2)}`
}

/** ENSIP-25 permits registry-defined string IDs, not only ERC-8004 uint256 identifiers. */
export const agentRegistrationKey = (chainId: number | bigint, registry: string, agentId: string | number): string => {
  if (typeof agentId === "number" && (!Number.isSafeInteger(agentId) || agentId < 0)) throw new Error("ENS: invalid agent id")
  const id = String(agentId)
  if (id.includes("[") || id.includes("]")) throw new Error("ENS: agent id must not contain a bracket")
  if (id.length === 0 || id.length > 256 || id.trim() !== id || /[\u0000-\u001f\u007f]/.test(id)) throw new Error("ENS: invalid agent id")
  return `agent-registration[${erc7930Eip155(chainId, registry)}][${id}]`
}

// ARCADE-generated hierarchy components are single DNS-safe labels; a dotted input must
// never escape into a different seller/root hierarchy. Generic name helpers normalize ENS.
const component = (value: string): string => {
  if (value.length < 1 || value.length > 63 || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(value)) throw new Error("ENS: invalid label")
  return normalize(value)
}
const ensName = (value: string): string => {
  if (value.length > 253 || value.trim() !== value || value.endsWith(".")) throw new Error("ENS: invalid name")
  const name = normalize(value)
  const utf8 = new TextEncoder()
  if (!name.endsWith(".eth") || utf8.encode(name).byteLength > 253 || name.split(".").some(l => utf8.encode(l).byteLength > 63)) throw new Error("ENS: expected a bounded .eth name")
  return name
}
const rootName = (value: string): string => {
  const labels = value.split(".")
  if (labels.length !== 2 || labels[1]?.toLowerCase() !== "eth") throw new Error("ENS: root must be a .eth 2LD")
  return ensName(`${component(labels[0]!)}.eth`)
}

/** Address labels use the plan's stable first ten hex digits; registration still checks ownership. */
export const sellerLabelFor = (handleOrAddress: string): string => {
  if (handleOrAddress.length > 1024) throw new Error("ENS: invalid seller label")
  const raw = handleOrAddress.trim().toLowerCase()
  const label = ADDRESS.test(raw) ? `s${raw.slice(2, 12)}` : raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")
  if (label.length < 3) throw new Error("ENS: seller label must contain 3–63 characters")
  return component(label)
}
export const arcadeSellerName = (a: { readonly root: string; readonly sellerLabel: string }): string =>
  ensName(`${component(a.sellerLabel)}.${rootName(a.root)}`)
export const arcadeSkillName = (a: { readonly root: string; readonly sellerLabel: string; readonly skillId: string }): string =>
  ensName(`${component(a.skillId)}.${arcadeSellerName(a)}`)
export const labelId = (label: string): bigint => BigInt(labelhash(component(label)))
/** DNS encoding contains one terminating root byte, as returned by viem. */
export const dnsNameOf = (name: string): `0x${string}` => toHex(packetToBytes(ensName(name)))

// Official contracts-v2 RegistryRolesLib / PermissionedResolverLib nybble bitmaps.
// https://github.com/ensdomains/contracts-v2/tree/main/contracts/src
export const RegistryRoles = Object.freeze({
  REGISTRAR: 1n, REGISTER_RESERVED: 1n << 4n, SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n, CAN_TRANSFER_ADMIN: 1n << 156n,
  SET_URI: 1n << 36n, CAN_NAME: 1n << 120n, UPGRADE: 1n << 124n
} as const)
export const ResolverRoles = Object.freeze({
  SET_ADDR: 1n, SET_TEXT: 1n << 4n, SET_CONTENTHASH: 1n << 8n,
  SET_ALIAS: 1n << 28n, CLEAR: 1n << 32n, SET_DATA: 1n << 36n, UPGRADE: 1n << 124n
} as const)
const admin = (role: bigint) => role << 128n
export const ALL_ROLES = BigInt(`0x${"1".repeat(64)}`)
/** Transfer authority is withheld from the seller; namespace root admins can still change grants. */
export const SELLER_SUBNAME_ROLES = RegistryRoles.SET_SUBREGISTRY | admin(RegistryRoles.SET_SUBREGISTRY) |
  RegistryRoles.SET_RESOLVER | admin(RegistryRoles.SET_RESOLVER) | RegistryRoles.RENEW | admin(RegistryRoles.RENEW)
export const SKILL_SUBNAME_ROLES = RegistryRoles.RENEW | admin(RegistryRoles.RENEW) |
  RegistryRoles.UNREGISTER | admin(RegistryRoles.UNREGISTER) | RegistryRoles.SET_RESOLVER | admin(RegistryRoles.SET_RESOLVER)

/** User salt; the VerifiableFactory additionally binds it to msg.sender. */
export const userRegistrySalt = (name: string, version = 0n): bigint => {
  if (version < 0n || version > UINT256_MAX) throw new Error("ENS: salt version must be uint256")
  return BigInt(keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
    [keccak256(stringToHex("UserRegistry")), namehash(ensName(name)), version]
  )))
}
export const ownedResolverSalt = (owner: string): bigint => BigInt(keccak256(encodeAbiParameters(
  [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
  [keccak256(stringToHex("OwnedResolver")), addressOf(owner), 0n]
)))

/** Pure browser-safe parser. Runtime consumers explicitly pass ARCADE_ENS_TTL. */
export const ensTtlSeconds = (raw?: string): number => {
  if (raw === undefined || raw.trim() === "") return 6 * 3600
  if (raw.length > 32) throw new Error("ARCADE_ENS_TTL is outside safe integer seconds")
  const match = /^(\d+)(s|m|h|d)?$/.exec(raw.trim())
  if (match === null) throw new Error("ARCADE_ENS_TTL must look like 900, 15m, 6h or 90d")
  const scale = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] ?? "s"]!
  const seconds = Number(match[1]) * scale
  if (!Number.isSafeInteger(seconds)) throw new Error("ARCADE_ENS_TTL is outside safe integer seconds")
  if (seconds < 60) throw new Error("ARCADE_ENS_TTL must be at least 60s")
  return seconds
}
