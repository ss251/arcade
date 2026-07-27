import { describe, expect, it, vi } from "vitest"
import { ARC_CHAIN_ID, USDC_DECIMALS, USDC_NATIVE_DECIMALS } from "@arcade/core"
import {
  ARC_ADD_CHAIN_PARAMS,
  connect,
  ensureArc,
  walletBlocker,
  type Eip1193Provider
} from "../src/lib/wallet.ts"

/**
 * The chain guard has to be an action, not a wall.
 *
 * Chain 5042002 is in no wallet by default, so the guard fires for essentially every
 * first-time visitor — it IS the experience for most people who try this. A guard that only
 * reports the problem is a dead end at the moment someone is deciding whether to trust us
 * with money, which is the same reason the Railway refusal carries the reference-variable
 * syntax rather than only naming what is missing.
 */

const provider = (chainId: number, opts: { switchFails?: number } = {}): Eip1193Provider => {
  let current = chainId
  const calls: Array<string> = []
  const p = {
    calls,
    request: vi.fn(async ({ method, params }: { method: string; params?: ReadonlyArray<unknown> }) => {
      calls.push(method)
      if (method === "eth_chainId") return `0x${current.toString(16)}`
      if (method === "eth_requestAccounts") return ["0xdaACA688cE93d6EA0BDf4cdA9925C5526f3cA5e1"]
      if (method === "wallet_switchEthereumChain") {
        if (opts.switchFails !== undefined) {
          const err = Object.assign(new Error("Unrecognized chain ID"), { code: opts.switchFails })
          throw err
        }
        current = ARC_CHAIN_ID
        return null
      }
      if (method === "wallet_addEthereumChain") {
        current = ARC_CHAIN_ID
        return null
      }
      throw new Error(`unexpected ${method} ${JSON.stringify(params)}`)
    })
  }
  return p as unknown as Eip1193Provider & { calls: Array<string> }
}

const methodsOf = (p: Eip1193Provider) => (p as unknown as { calls: Array<string> }).calls

describe("adding Arc — the parameters", () => {
  /**
   * THE trap `packages/core/src/chain.ts` exists to warn about. Arc's USDC is one address
   * in two roles: 6 decimals for the ERC-20 interface every price and receipt uses, 18 for
   * the native gas token `eth_getBalance` returns. These parameters describe the NATIVE
   * currency. Reaching for the payments constant is the natural mistake — it is the one
   * this app otherwise speaks — and it would show every visitor a balance wrong by 10^12,
   * in their wallet, while deciding whether to trust us.
   */
  it("declares 18 native decimals, NOT the 6 used for payments", () => {
    expect(ARC_ADD_CHAIN_PARAMS.nativeCurrency.decimals).toBe(18)
    expect(ARC_ADD_CHAIN_PARAMS.nativeCurrency.decimals).toBe(USDC_NATIVE_DECIMALS)
    expect(ARC_ADD_CHAIN_PARAMS.nativeCurrency.decimals).not.toBe(USDC_DECIMALS)
  })

  it("encodes the chain id as hex, which is what EIP-3085 wants", () => {
    expect(ARC_ADD_CHAIN_PARAMS.chainId).toBe(`0x${ARC_CHAIN_ID.toString(16)}`)
    expect(parseInt(ARC_ADD_CHAIN_PARAMS.chainId, 16)).toBe(ARC_CHAIN_ID)
  })

  it("takes every value from chain.ts rather than restating one", () => {
    expect(ARC_ADD_CHAIN_PARAMS.rpcUrls[0]).toContain("rpc.testnet.arc.network")
    expect(ARC_ADD_CHAIN_PARAMS.blockExplorerUrls[0]).toContain("testnet.arcscan.app")
  })
})

describe("ensureArc — the guard offers the remedy", () => {
  it("does nothing when already on Arc", async () => {
    const p = provider(ARC_CHAIN_ID)
    await ensureArc(p)
    expect(methodsOf(p)).not.toContain("wallet_switchEthereumChain")
    expect(methodsOf(p)).not.toContain("wallet_addEthereumChain")
  })

  it("switches when the wallet already knows Arc", async () => {
    const p = provider(1)
    await ensureArc(p)
    expect(methodsOf(p)).toContain("wallet_switchEthereumChain")
    expect(methodsOf(p)).not.toContain("wallet_addEthereumChain")
  })

  it("ADDS the chain on 4902, which is the first-time visitor's path", async () => {
    // Not an error — "unrecognised chain" is the expected answer for a wallet that has
    // never seen Arc, which is nearly all of them.
    const p = provider(1, { switchFails: 4902 })
    await ensureArc(p)
    expect(methodsOf(p)).toContain("wallet_addEthereumChain")
  })

  it("rethrows a rejection that is NOT 4902", async () => {
    // 4001 is the user declining. Adding the chain in response would re-prompt someone who
    // just said no, which is how a guard becomes a nuisance.
    const p = provider(1, { switchFails: 4001 })
    await expect(ensureArc(p)).rejects.toThrow()
    expect(methodsOf(p)).not.toContain("wallet_addEthereumChain")
  })
})

describe("connect — chain before the card", () => {
  it("puts the wallet on Arc as part of connecting, not after a price is shown", async () => {
    const p = provider(1, { switchFails: 4902 })
    const { address } = await connect(p)
    expect(address).toMatch(/^0x/)
    // The ordering is the property: accounts, then chain — both before any card renders.
    const m = methodsOf(p)
    expect(m.indexOf("eth_requestAccounts")).toBeLessThan(m.indexOf("wallet_addEthereumChain"))
  })
})

describe("walletBlocker — a sentence for a person", () => {
  it("says the page still works without a wallet", () => {
    const msg = walletBlocker(false, undefined)
    expect(msg).toContain("never holds funds")
    expect(msg).toContain("Everything else on this page works without one")
  })

  it("names the wrong chain and promises the one-step remedy", () => {
    const msg = walletBlocker(true, 1)
    expect(msg).toContain("chain 1")
    expect(msg).toContain(String(ARC_CHAIN_ID))
    // The remedy, not just the diagnosis.
    expect(msg).toContain("add and switch to it in one step")
  })

  it("blocks nothing on Arc", () => {
    // The inverse. A blocker that fired on the correct chain would block every purchase.
    expect(walletBlocker(true, ARC_CHAIN_ID)).toBeUndefined()
  })

  it("blocks nothing while the chain is still unknown", () => {
    // Before `eth_chainId` returns, "unknown" must not render as "wrong" — a card that
    // flashes a scary message and then withdraws it teaches people to ignore it.
    expect(walletBlocker(true, undefined)).toBeUndefined()
  })
})
