#!/usr/bin/env bun
import { Cause, Effect, Exit } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { explorerTxUrl, parsePrice } from "@arcade/core"
import { callSkill } from "./index.ts"

/**
 * `arcade-buy <skillId> --input '{...}'`
 *
 * The buyer side in one command. Reads the buyer key from ARCADE_BUYER_KEY — never a flag,
 * so it cannot land in shell history.
 */

/** Importing the buyer package/entry never dispatches or reads a spending key. */
const legacyBuyerMain = async (args: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> => {
const skillId = args[0]

const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i > -1 ? args[i + 1] : undefined
}

if (skillId === undefined || skillId.startsWith("--")) {
  console.log(`usage: arcade-buy <skillId> --input '{"...":"..."}' [--hub URL] [--seller 0x..] [--max-amount 0.50]

env:
  ARCADE_BUYER_KEY   buyer private key (testnet throwaway)
  ARCADE_HUB         hub URL (default http://localhost:8787)
`)
  return 2
}

const hubUrl = flag("hub") ?? env["ARCADE_HUB"] ?? "http://localhost:8787"
const inputRaw = flag("input") ?? "{}"
const maxAmount = flag("max-amount")

const key = env["ARCADE_BUYER_KEY"]
if (key === undefined) {
  console.error("ARCADE_BUYER_KEY is not set (use a testnet throwaway key)")
  return 2
}

const main = Effect.gen(function* () {
  const account = privateKeyToAccount(key as `0x${string}`)

  // Resolve the seller from the listing unless one was given.
  const seller =
    flag("seller") ??
    (yield* Effect.promise(async () => {
      const res = await fetch(`${hubUrl}/listings/${skillId}`)
      if (!res.ok) throw new Error(`listing ${skillId} not found on ${hubUrl}`)
      return ((await res.json()) as { seller: string }).seller
    }))

  console.log(`buyer   ${account.address}`)
  console.log(`hub     ${hubUrl}`)
  console.log(`skill   ${skillId} (seller ${seller})`)

  const out = yield* callSkill({
    hubUrl,
    seller,
    skillId,
    input: JSON.parse(inputRaw),
    account,
    ...(maxAmount === undefined ? {} : { maxAmountAtomic: parsePrice(maxAmount) })
  })

  console.log(`\nstatus  ${out.status}`)
  console.log(`result  ${JSON.stringify(out.result, null, 2)}`)

  const r = out.receipt as Record<string, string | boolean | null>
  console.log(`\nreceipt`)
  if (out.authorizedRail !== undefined) console.log(`  authorization rail ${out.authorizedRail} (local choice, not settlement proof)`)
  console.log(`  price        ${r["price"]}`)
  console.log(`  seller share ${r["sellerShare"]}`)
  console.log(`  platform fee ${r["fee"]}`)
  console.log(`  settled      ${r["settled"]}  (${r["reason"]})`)
  if (typeof r["settleTx"] === "string") {
    console.log(`  tx           ${explorerTxUrl(r["settleTx"])}`)
  }
})

// `Effect.runPromise` rejects with a FiberFailure whose `.message` is the literal string
// "An error has occurred" — which is what a buyer saw when a call failed, with no
// indication of whether the payment, the job or the poll was at fault. Running to an Exit
// and printing the Cause gives the tagged error and its fields instead.
const exit = await Effect.runPromiseExit(main)
if (Exit.isFailure(exit)) {
  console.error(Cause.pretty(exit.cause))
  return 1
}
return 0
}

/** Reserved strict commands cannot fall through to the permissive legacy parser. */
export const buyerMain = async (raw: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<number> => {
  const { fundingMain, captureCliArgv } = await import("./gateway-funding-cli.ts")
  let args: readonly string[]
  try { args = captureCliArgv(raw) } catch { return fundingMain([], { env, role: "buyer" }) }
  if (args[0] === "fund") {
    const { runUnifiedFundingCommand } = await import("./unified-balance-cli.ts")
    return runUnifiedFundingCommand(args, env)
  }
  if (args[0] === "session" || args[0] === "--help" || args[0]?.startsWith("gateway-")) {
    return fundingMain(args, { env, role: "buyer" })
  }
  return legacyBuyerMain(args, env)
}

if (import.meta.main) {
  if (process.argv[2] === "fund" || process.argv[2] === "session" || process.argv[2] === "--help" || process.argv[2]?.startsWith("gateway-")) {
    const { runOwnedFundingCli } = await import("./gateway-funding-cli.ts")
    await runOwnedFundingCli(() => buyerMain(process.argv.slice(2), process.env))
  } else process.exitCode = await buyerMain(process.argv.slice(2), process.env)
}
