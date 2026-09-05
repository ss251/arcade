#!/usr/bin/env bun
/** Explicit seller-role withdrawal entry; no SDK convenience call or import-time IO. */
export const withdrawMain = async (raw: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> => {
  const { fundingMain, captureCliArgv } = await import("../packages/buyer/src/gateway-funding-cli.ts")
  let args: readonly string[]
  try { args = captureCliArgv(raw) } catch { return fundingMain([], { env, role: "seller" }) }
  return fundingMain(["gateway-withdraw", ...args], { env, role: "seller" })
}

if (import.meta.main) {
  const { runOwnedFundingCli } = await import("../packages/buyer/src/gateway-funding-cli.ts")
  await runOwnedFundingCli(() => withdrawMain(process.argv.slice(2), process.env))
}
