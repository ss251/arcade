import { encodeAbiParameters, keccak256, parseAbi, stringToHex, toHex, type PublicClient } from "viem"
import { labelhash, namehash, normalize, packetToBytes } from "viem/ens"
import ensSepolia from "../../../config/ens/sepolia.json" with { type: "json" }

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

// Deployed contracts-v2 @97a57293f3b4279d94b571e678edb53ce62638f4 sources.
// In particular the beta registrar exposes isAvailable (not ENSv1's available).
export const ROOT_REGISTRY_ABI = parseAbi(["function getSubregistry(string label) view returns (address)"])
export const ETH_REGISTRAR_ABI = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MAX_COMMITMENT_AGE() view returns (uint64)",
  "function MIN_REGISTER_DURATION() view returns (uint64)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
  "function renew(string label, uint64 duration, address paymentToken, bytes32 referrer)"
])
export const PERMISSIONED_REGISTRY_ABI = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function renew(uint256 anyId, uint64 newExpiry)", "function unregister(uint256 anyId)",
  "function setSubregistry(uint256 anyId, address registry)", "function setResolver(uint256 anyId, address resolver)",
  "function setParent(address parent, string label)",
  "function grantRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function revokeRoles(uint256 anyId, uint256 roleBitmap, address account) returns (bool)",
  "function grantRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function getOwner(uint256 anyId) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function getExpiry(uint256 anyId) view returns (uint64)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function roles(uint256 resource, address account) view returns (uint256)"
])
export const PERMISSIONED_RESOLVER_ABI = parseAbi([
  "function initialize(address admin, uint256 roleBitmap, bytes[] setters)",
  "function setText(bytes32 node, string key, string value)", "function text(bytes32 node, string key) view returns (string)",
  "function setAddr(bytes32 node, uint256 coinType, bytes value)", "function clearRecords(bytes32 node)",
  "function multicall(bytes[] data) returns (bytes[])",
  "function authorizeTextRoles(bytes toName, string key, address account, bool grant) returns (bool)",
  "function authorizeNameRoles(bytes toName, uint256 roleBitmap, address account, bool grant) returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)"
])
export const VERIFIABLE_FACTORY_ABI = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)",
  "function verifyContract(address proxy) view returns (address implementation)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)"
])
export const USER_REGISTRY_INIT_ABI = parseAbi(["function initialize(address rootAccount, uint256 roleBitmap)"])
export const MOCK_USDC_ABI = parseAbi([
  "function mint(address to, uint256 amount)", "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)", "function allowance(address owner, address spender) view returns (uint256)"
])

export interface EnsDeployment {
  readonly set: "A" | "B"
  readonly source: string
  readonly rootRegistry: `0x${string}`
  readonly ethRegistry: `0x${string}`
  readonly ethRegistrar: `0x${string}`
  readonly universalResolver: `0x${string}`
  readonly permissionedResolverImpl: `0x${string}`
  readonly userRegistryImpl: `0x${string}`
  readonly verifiableFactory: `0x${string}`
  readonly mockUsdc: `0x${string}`
}
export interface EnsChainReader {
  readonly readContract: (args: { readonly address: `0x${string}`; readonly abi: unknown; readonly functionName: string; readonly args: readonly unknown[] }) => Promise<unknown>
  /** Production viem clients supply this; omitted only by a non-network test reader. */
  readonly getChainId?: () => Promise<number>
}
/** Adapt the plan's intentionally unknown ABI boundary to one statically typed RPC call.
 * Real viem clients cannot directly implement a reader promising to accept every unknown
 * ABI. Validate the discovery operation, then supply the pinned ABI without an unsafe cast.
 */
export const ensDeploymentReader = (client: Pick<PublicClient, "readContract" | "getChainId">): EnsChainReader => ({
  getChainId: () => client.getChainId(),
  readContract: async a => {
    if (a.functionName !== "getSubregistry" || a.args.length !== 1 || a.args[0] !== "eth") throw new Error("ENS: unsupported deployment discovery call")
    return client.readContract({ address: addressOf(a.address), abi: ROOT_REGISTRY_ABI, functionName: "getSubregistry", args: ["eth"] })
  }
})
const deploymentFields = ["rootRegistry", "ethRegistry", "ethRegistrar", "universalResolver", "permissionedResolverImpl", "userRegistryImpl", "verifiableFactory", "mockUsdc"] as const
const checkedDeployment = (value: unknown): EnsDeployment => {
  if (typeof value !== "object" || value === null) throw new Error("ENS: invalid deployment configuration")
  const fields = Object.getOwnPropertyDescriptors(value)
  const own = (key: string): unknown => fields[key] !== undefined && "value" in fields[key] ? fields[key].value : undefined
  const set = own("set"), source = own("source")
  if ((set !== "A" && set !== "B") || typeof source !== "string" || source.length > 512 || !source.startsWith("https://")) throw new Error("ENS: invalid deployment configuration")
  const addresses = {} as Record<typeof deploymentFields[number], `0x${string}`>
  for (const field of deploymentFields) {
    const v = own(field)
    if (typeof v !== "string" || /^0x0{40}$/i.test(v)) throw new Error("ENS: invalid deployment address")
    addresses[field] = addressOf(v)
  }
  return Object.freeze({ set, source, ...addresses })
}
const checkedSets = (sets: readonly unknown[]): ReadonlyArray<EnsDeployment> => {
  if (!Array.isArray(sets) || sets.length < 1 || sets.length > 2) throw new Error("ENS: invalid deployment candidates")
  const result = sets.map(checkedDeployment)
  if (new Set(result.map(d=>d.set)).size !== result.length) throw new Error("ENS: duplicate deployment candidate")
  return Object.freeze(result)
}
export const loadEnsDeployments = (): ReadonlyArray<EnsDeployment> => {
  if (ensSepolia.chainId !== ENS_SEPOLIA_CHAIN_ID) throw new Error("ENS deployment manifest must select Sepolia")
  return checkedSets(ensSepolia.deployments)
}
const readDeadline = <T>(read: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("ENS read timed out")), 5000)
  Promise.resolve().then(read).then(value => { clearTimeout(timer); resolve(value) }, () => { clearTimeout(timer); reject(new Error("ENS read unavailable")) })
})
/** Bounded, read-only discovery. This validates root→eth only, not all deployed bytecode. */
export const resolveEnsDeployment = async (reader: EnsChainReader, sets: ReadonlyArray<EnsDeployment> = loadEnsDeployments()): Promise<EnsDeployment> => {
  const candidates = checkedSets(sets)
  if (reader.getChainId !== undefined && await readDeadline(() => reader.getChainId!()) !== ENS_SEPOLIA_CHAIN_ID) throw new Error("ENS RPC must be Sepolia")
  const findings: string[] = []
  for (const d of candidates) {
    try {
      const got = await readDeadline(() => reader.readContract({ address:d.rootRegistry, abi:ROOT_REGISTRY_ABI, functionName:"getSubregistry", args:["eth"] }))
      if (typeof got === "string" && got.length === 42 && ADDRESS.test(got) && got.toLowerCase() === d.ethRegistry) return d
      findings.push(`set ${d.set}: inconsistent root-to-eth registry link`)
    } catch { findings.push(`set ${d.set}: root registry unreadable`) }
  }
  throw new Error(`no consistent ENSv2 deployment on Sepolia: ${findings.join("; ")}. Update config/ens/sepolia.json from the official ENS deployments; beta addresses may change.`)
}

/** Propose only; a returned fallback is not owner consent to register that name. */
export const pickAvailableLabel = async (candidates: ReadonlyArray<string>, isAvailable: (label: string) => Promise<boolean>): Promise<string> => {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 16) throw new Error("ENS: invalid label candidates")
  const labels = [...new Set(candidates.map(component))]
  for (const label of labels) {
    try { if (await readDeadline(() => isAvailable(label)) === true) return label } catch { /* Unreadable is never free. */ }
  }
  throw new Error(`none of these .eth labels is verifiably available: ${labels.join(", ")}; owner must choose an available label`)
}
export interface SkillRecordInput {
  readonly name: string; readonly endpoint: string; readonly payTo: string; readonly caip2: string
  readonly priceAtomic: bigint; readonly webUrl: string; readonly mcpUrl?: string | undefined; readonly context: string
  readonly agentRegistration?: { readonly chainId: number | bigint; readonly registry: string; readonly agentId: string | number }
}
const publicAddress = (value:string): `0x${string}` => {
  const result=addressOf(value)
  if(/^0x0{40}$/.test(result)) throw new Error("ENS: nonzero public address required")
  return result
}
const publicUrl = (value:string):URL => {
  if(value.length>2048 || /[\s\\%?#]/.test(value)) throw new Error("ENS: invalid public endpoint")
  const url=new URL(value)
  if(url.username||url.password||url.hash||url.search || !(url.protocol==="https:"||url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname))) throw new Error("ENS: public endpoint requires HTTPS or loopback")
  return url
}
/** Exact integer payment facts; route seller and FeeSplitter payee are distinct fields. */
export const skillTextRecords = (a:SkillRecordInput):ReadonlyArray<{readonly key:string;readonly value:string}> => {
  const name=ensName(a.name), endpoint=publicUrl(a.endpoint)
  const path=/^https?:\/\/[^/]+(\/x\/(0x[0-9a-fA-F]{40})\/([a-z0-9][a-z0-9-]*))$/.exec(a.endpoint)
  if(!path||path[1]!==endpoint.pathname||component(path[3]!)!==name.split(".")[0]||name.split(".").length!==4) throw new Error("ENS: endpoint must match the skill name")
  publicAddress(path[2]!);publicAddress(a.payTo);publicUrl(a.webUrl)
  if(a.mcpUrl!==undefined) publicUrl(a.mcpUrl)
  if(!/^eip155:[1-9][0-9]{0,15}$/.test(a.caip2)||!Number.isSafeInteger(Number(a.caip2.slice(7)))) throw new Error("ENS: invalid payment chain")
  if(typeof a.priceAtomic!=="bigint"||a.priceAtomic<0n||a.priceAtomic>UINT256_MAX) throw new Error("ENS: price must be uint256")
  if(a.context.length===0||new TextEncoder().encode(a.context).byteLength>2048||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(a.context)) throw new Error("ENS: invalid agent context")
  const facts={name,endpoint:a.endpoint,payTo:a.payTo,chain:a.caip2,priceAtomic:a.priceAtomic.toString(),protocol:"x402",...(a.mcpUrl===undefined?{}:{mcp:a.mcpUrl})}
  const records:Array<{key:string;value:string}>=[{key:ENS_TEXT_KEYS.endpoint,value:a.endpoint},{key:ENS_TEXT_KEYS.payTo,value:a.payTo},{key:ENS_TEXT_KEYS.chain,value:a.caip2},{key:ENS_TEXT_KEYS.priceAtomic,value:a.priceAtomic.toString()},{key:ENS_TEXT_KEYS.web,value:a.webUrl},...(a.mcpUrl===undefined?[]:[{key:ENS_TEXT_KEYS.mcp,value:a.mcpUrl}]),{key:ENS_TEXT_KEYS.context,value:`${a.context}\n\n${JSON.stringify(facts)}`}]
  if(a.agentRegistration) records.push({key:agentRegistrationKey(a.agentRegistration.chainId,a.agentRegistration.registry,a.agentRegistration.agentId),value:"1"})
  if(records.some(r=>new TextEncoder().encode(r.value).byteLength>4096)) throw new Error("ENS: record exceeds reader limit")
  return Object.freeze(records.map(r=>Object.freeze(r)))
}

export interface EnsSkillState { readonly skillId:string;readonly label:string;readonly name:string;readonly priceAtomic:string }
/** Public namespace state only. Runtime file IO is exported from @arcade/core/ens-state,
 * never this browser-safe root module. Optional owner/daemon pin new setup provenance. */
export interface EnsState {
  readonly root:string;readonly sellerLabel:string;readonly seller:string;readonly deploymentSet:string
  readonly universalResolver:string;readonly sellerRegistry:string;readonly skillRegistry:string;readonly resolver:string
  readonly ttlSeconds:number;readonly skills:ReadonlyArray<EnsSkillState>;readonly owner?:string;readonly daemon?:string
}
const dataRecord = (input:unknown,allowed:readonly string[]):Record<string,unknown> => {
  if(typeof input!=="object"||input===null||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input))) throw new Error("ENS: expected public state object")
  const descriptors=Object.getOwnPropertyDescriptors(input), result:Record<string,unknown>={}
  for(const key of Reflect.ownKeys(descriptors)) {
    if(typeof key!=="string"||!allowed.includes(key)||!("value" in descriptors[key]!)) throw new Error("ENS: unexpected state field or accessor")
    result[key]=descriptors[key]!.value
  }
  return result
}
/** Decode, validate hierarchy/deployment, reject secret-bearing fields and freeze. */
export const decodeEnsState = (value:unknown):EnsState => {
  const o=dataRecord(value,["root","sellerLabel","seller","deploymentSet","universalResolver","sellerRegistry","skillRegistry","resolver","ttlSeconds","skills","owner","daemon"])
  const str=(key:string):string=>{if(typeof o[key]!=="string")throw new Error("ENS: missing state field");return o[key] as string}
  const root=rootName(str("root")), sellerLabel=component(str("sellerLabel")), seller=publicAddress(str("seller"))
  if(root!==o.root||sellerLabel!==o.sellerLabel)throw new Error("ENS: state names must be normalized")
  const d=loadEnsDeployments().find(d=>d.set===o.deploymentSet)
  if(!d||publicAddress(str("universalResolver"))!==d.universalResolver)throw new Error("ENS: state resolver must match deployment")
  const addresses={sellerRegistry:publicAddress(str("sellerRegistry")),skillRegistry:publicAddress(str("skillRegistry")),resolver:publicAddress(str("resolver"))}
  const ttl=o.ttlSeconds
  if(typeof ttl!=="number"||!Number.isSafeInteger(ttl)||ttl<60||ttl>365*86400) throw new Error("ENS: unsupported state TTL")
  if(!Array.isArray(o.skills)||o.skills.length<1||o.skills.length>64)throw new Error("ENS: state requires 1–64 skills")
  const skills=o.skills.map((raw):EnsSkillState=>{
    const s=dataRecord(raw,["skillId","label","name","priceAtomic"])
    if(typeof s.skillId!=="string"||typeof s.label!=="string"||typeof s.name!=="string"||typeof s.priceAtomic!=="string"||s.skillId!==component(s.skillId)||s.label!==s.skillId||s.name!==arcadeSkillName({root,sellerLabel,skillId:s.skillId})||!/^(0|[1-9][0-9]{0,77})$/.test(s.priceAtomic)||BigInt(s.priceAtomic)>UINT256_MAX)throw new Error("ENS: invalid skill state")
    return Object.freeze({skillId:s.skillId,label:s.label,name:s.name,priceAtomic:s.priceAtomic})
  })
  if(new Set(skills.map(s=>s.skillId)).size!==skills.length)throw new Error("ENS: duplicate skill state")
  const owner=o.owner===undefined?undefined:publicAddress(str("owner")), daemon=o.daemon===undefined?undefined:publicAddress(str("daemon"))
  if(daemon!==undefined&&(daemon===owner||daemon===seller))throw new Error("ENS: daemon must be a distinct scoped account")
  return Object.freeze({root,sellerLabel,seller,deploymentSet:d.set,universalResolver:d.universalResolver,...addresses,ttlSeconds:ttl,skills:Object.freeze(skills),...(owner===undefined?{}:{owner}),...(daemon===undefined?{}:{daemon})})
}
