import type { ChainConfig } from "@arcade/core"

export interface ChainRpc {
  readonly chainId: () => Promise<number>
  readonly read: (fn: "name" | "version" | "decimals") => Promise<unknown>
  readonly balanceOf: (addr: string) => Promise<bigint>
}

const pendingFinding = (cfg: ChainConfig): string =>
  `${cfg.id} is pending: fill config/chains/${cfg.id}.json from docs.arc.io (see docs/mainnet-runbook.md)`

export const chainStartupRefusal = (cfg: ChainConfig, rail: string): string | undefined => {
  if (cfg.status === "pending") return pendingFinding(cfg)
  if (rail === "gateway" && cfg.gateway === null) return "Gateway is not available on this network"
  return undefined
}

/** Gateway uses Circle's hosted facilitator, so metadata checks require no local wallet. */
export const chainMetadataCheck = async (
  cfg: ChainConfig,
  rpc: Pick<ChainRpc, "chainId" | "read">
): Promise<{ ok: boolean; findings: string[] }> => {
  if (cfg.status === "pending") {
    return {
      ok: false,
      findings: [pendingFinding(cfg)]
    }
  }

  const findings: string[] = []
  const check = async <T>(
    label: string,
    read: () => Promise<T>,
    mismatch: (value: T) => string | undefined
  ): Promise<void> => {
    try {
      const finding = mismatch(await read())
      if (finding !== undefined) findings.push(finding)
    } catch {
      // Keep failed reads distinct from mismatches, and do not copy transport errors
      // that may contain private URLs.
      findings.push(`${label}: RPC failed`)
    }
  }

  // Sequential reads avoid a burst against the public RPC. Collect every failure so
  // boot diagnostics show the complete configuration problem in one pass.
  await check("chainId", () => rpc.chainId(), (id) =>
    id === cfg.chainId ? undefined : `chainId: rpc reports ${id}, config says ${cfg.chainId}`)
  await check("usdc name", () => rpc.read("name"), (name) =>
    name === cfg.usdc.eip712Name ? undefined : `usdc name: ${String(name)} ≠ ${cfg.usdc.eip712Name}`)
  await check("usdc version", () => rpc.read("version"), (version) =>
    version === cfg.usdc.eip712Version ? undefined : `usdc version: ${String(version)} ≠ ${cfg.usdc.eip712Version}`)
  await check("usdc decimals", () => rpc.read("decimals"), (decimals) =>
    (typeof decimals === "number" || typeof decimals === "bigint") && Number(decimals) === cfg.usdc.decimals
      ? undefined
      : `usdc decimals: ${String(decimals)} ≠ ${cfg.usdc.decimals}`)
  return { ok: findings.length === 0, findings }
}

export const chainCheck = async (
  cfg: ChainConfig,
  rpc: ChainRpc,
  facilitator: string
): Promise<{ ok: boolean; findings: string[] }> => {
  const metadata = await chainMetadataCheck(cfg, rpc)
  if (cfg.status === "pending") return metadata
  const findings = metadata.findings
  try {
    const balance = await rpc.balanceOf(facilitator)
    if (balance <= 0n) findings.push(`facilitator ${facilitator} has no USDC for gas`)
  } catch {
    // A failed RPC is not evidence of an empty wallet.
    findings.push(`facilitator ${facilitator}: RPC failed`)
  }
  return { ok: findings.length === 0, findings }
}
