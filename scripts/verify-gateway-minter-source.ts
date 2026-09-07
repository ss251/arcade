/** Read-only J5C reproducibility check. No signer, wallet environment or send RPC. */
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { isAbsolute } from "node:path"
import { keccak256, stringToHex, type Hex } from "viem"

export const MINTER_SOURCE = Object.freeze({
  explorer: "https://testnet.arcscan.app/api/v2/smart-contracts/0x9ef4c7ad4f577be713972310e655337bfd0b84bf",
  artifact: "https://raw.githubusercontent.com/circlefin/evm-gateway-contracts/fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8/script/compiled-contract-artifacts/GatewayMinter.json",
  explorerSha256: "a96005ae9f46468a9490e70a7bea54699790ad80486cb96ee14bc634a9e36b62",
  artifactSha256: "2c80edc746fdb941ac6c7214b0d6619eedf3c76fdddc0e76c6cffe65a85f76c8",
  implementation: "0x9ef4c7ad4f577be713972310e655337bfd0b84bf" as Hex,
  runtimeHash: "0x0c479785c0c0f5a450bcf3200c854db9da6e4b585a5b694ca4eac85396cc28f5",
  metadataTail: "a2646970667358221220a22698663fbb412bbcf08bb97bcb8db175587b4f060769e51329b77da758a0b364736f6c634300081d0033",
  compiler: "0.8.29+commit.ab55807c.Emscripten.clang"
})
const changedSources: Readonly<Record<string, string>> = Object.freeze({
  "src/GatewayMinter.sol": "0x07045b1b2d7f953e46d128852b61e931f81e8ccc0a12ccda9ea4eddeb27d699c",
  "src/GatewayCommon.sol": "0x2253953090c0e794479cbfec0dfb1bf1564b62e311fd969d843feb6cab03535f"
})
const fail = (): never => { throw Error("minter_source_unavailable") }
function check(value: unknown): asserts value { if (!value) fail() }
export const sourceSha256 = (text: string) => createHash("sha256").update(text).digest("hex")
export interface SourceCompiler { version(): string; compile(input: string): string }
type Source = { file_path: string; source_code: string }
type Artifact = { metadata: string | { sources: Record<string, { keccak256: string }> } }
type Explorer = Source & { additional_sources: Source[]; deployed_bytecode: string; compiler_settings: Record<string, unknown> }
/** Exact full bytecode binding; not metadata trimming or wildcard normalization. */
export function bindDeclaredSelf(code: string, references: unknown, implementation: string): Hex {
  check(/^(?:[a-f0-9]{2})+$/.test(code) && /^0x[a-f0-9]{40}$/.test(implementation) && !/^0x0{40}$/.test(implementation))
  check(references && typeof references === "object" && !Array.isArray(references))
  const entries = Object.values(references)
  check(entries.length === 1 && Array.isArray(entries[0]) && entries[0].length === 3)
  const offsets = [3634, 3675, 3968]
  let result = code
  for (let i = 0; i < offsets.length; i++) {
    const r = entries[0][i] as { start?: unknown; length?: unknown }
    const start = offsets[i]!
    check(r && r.start === start && r.length === 32 && result.slice(start * 2, (start + 32) * 2) === "00".repeat(32))
    result = result.slice(0, start * 2) + implementation.slice(2).padStart(64, "0") + result.slice((start + 32) * 2)
  }
  return `0x${result}`
}
export function reproduceMinter(explorerText: string, artifactText: string, compiler: SourceCompiler) {
  check(sourceSha256(explorerText) === MINTER_SOURCE.explorerSha256 && sourceSha256(artifactText) === MINTER_SOURCE.artifactSha256)
  check(compiler.version() === MINTER_SOURCE.compiler)
  const explorer = JSON.parse(explorerText) as Explorer, artifact = JSON.parse(artifactText) as Artifact
  const metadata = typeof artifact.metadata === "string" ? JSON.parse(artifact.metadata) as Exclude<Artifact["metadata"], string> : artifact.metadata
  const sources = [explorer, ...explorer.additional_sources]
  check(sources.length === 36 && Object.keys(metadata.sources).length === 36 && new Set(sources.map(s => s.file_path)).size === 36)
  const sourceHashes = sources.map(s => {
    const hash = keccak256(stringToHex(s.source_code)), accepted = metadata.sources[s.file_path]?.keccak256
    check(accepted !== undefined && hash === (changedSources[s.file_path] ?? accepted))
    return { path: s.file_path, hash, accepted, unchanged: hash === accepted }
  })
  check(sourceHashes.filter(s => !s.unchanged).length === 2)
  const settings = { ...explorer.compiler_settings, outputSelection: {
    "*": { "*": ["evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences", "metadata"] }
  } }
  const input = JSON.stringify({ language: "Solidity", sources: Object.fromEntries(sources.map(s => [s.file_path, { content: s.source_code }])), settings })
  const output = JSON.parse(compiler.compile(input)) as { errors?: { severity: string }[]; contracts: Record<string, Record<string, {
    metadata: string; evm: { deployedBytecode: { object: string; immutableReferences: unknown } }
  }>> }
  check(!output.errors?.some(e => e.severity === "error"))
  const contract = output.contracts["src/GatewayMinter.sol"]?.["GatewayMinter"]
  check(contract)
  const bytecode = contract.evm.deployedBytecode
  const bound = bindDeclaredSelf(bytecode.object, bytecode.immutableReferences, MINTER_SOURCE.implementation)
  check(bound.length === 24204 && bound === explorer.deployed_bytecode && keccak256(bound) === MINTER_SOURCE.runtimeHash)
  check(bound.endsWith(MINTER_SOURCE.metadataTail))
  return Object.freeze({ compiler: compiler.version(), sourceBundleSha256: sourceSha256(explorerText),
    artifactSha256: sourceSha256(artifactText), standardInputSha256: sourceSha256(input), sourceHashes,
    sourceCount: sources.length, matchingAcceptedSources: 34, settings, immutableReferences: bytecode.immutableReferences,
    normalizedRuntimeHash: keccak256(`0x${bytecode.object}`), boundRuntimeHash: keccak256(bound),
    runtimeBytes: 12101, fullRuntimeMatch: true, metadataTailMatch: true,
    // An IPFS CID hashes a DAG-PB/UnixFS block, not the plain metadata JSON.
    metadataJsonSha256: sourceSha256(contract.metadata) })
}
export async function readPinnedSource(url: string, expectedHash: string, request: typeof fetch = fetch): Promise<string> {
  check(url === MINTER_SOURCE.explorer || url === MINTER_SOURCE.artifact)
  const response = await request(url, { signal: AbortSignal.timeout(15000), redirect: "error", credentials: "omit",
    headers: { accept: "application/json", "accept-encoding": "identity" } })
  check(response.status === 200 && !response.redirected && (!response.url || response.url === url) && response.body)
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0, count = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      check(length <= 1048576 && ++count <= 4096)
      chunks.push(part.value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = Buffer.concat(chunks), text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  check(sourceSha256(text) === expectedHash)
  return text
}
export async function minterSourceMain(args: readonly string[]) {
  check(args.length === 2 && args[0] === "--solc-module" && typeof args[1] === "string" && isAbsolute(args[1]) && args[1].endsWith("/solc/index.js"))
  // Explicit operator-selected local compiler, installed separately with lifecycle scripts disabled.
  const module = await import(pathToFileURL(args[1]).href) as { default: SourceCompiler }
  check(module.default.version() === MINTER_SOURCE.compiler)
  const explorer = await readPinnedSource(MINTER_SOURCE.explorer, MINTER_SOURCE.explorerSha256)
  const artifact = await readPinnedSource(MINTER_SOURCE.artifact, MINTER_SOURCE.artifactSha256)
  return reproduceMinter(explorer, artifact, module.default)
}
if (import.meta.main) {
  const fuse = setTimeout(() => process.exit(2), 65000)
  try { console.log(JSON.stringify(await minterSourceMain(process.argv.slice(2)), null, 2)) }
  catch { console.error("minter_source_unavailable"); process.exitCode = 2 }
  finally { clearTimeout(fuse) }
}
