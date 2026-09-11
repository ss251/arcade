import { loadChainConfig } from "@arcade/core"

const cfg = loadChainConfig()
const chainName = cfg.id === "arc-testnet" ? "Arc Testnet" : "Arc Mainnet"

/**
 * The visitor's wallet. No new dependency — viem is already in the tree, and its custom
 * transport over `window.ethereum` plus `toAccount` lands exactly on the seam
 * `fetch-with-payment` already exposes (`options.account: Account`, one offline
 * `signTypedData`).
 *
 * ## The chain guard has to be an ACTION, not a wall
 *
 * Chain 5042002 is in no wallet by default, so the early chain check fires for essentially
 * every first-time visitor — which means the guard IS the experience for most people who
 * try this. A guard that only says "you are on the wrong network" is a dead end at the one
 * moment someone is deciding whether to trust us with money. `wallet_addEthereumChain` adds
 * and switches in a single prompt, so the refusal comes with the remedy attached — the same
 * reason the Railway refusal carries the reference-variable syntax rather than only naming
 * the problem.
 *
 * It belongs at CONNECT time, before the Confirmation card, rather than after someone has
 * read a price and decided to pay. Refuse early rather than fail late.
 */

/** Minimal EIP-1193 surface. Typed here so nothing needs `any` at the callsite. */
export interface Eip1193Provider {
  request(args: { method: string; params?: ReadonlyArray<unknown> }): Promise<unknown>
  on?(event: string, handler: (...args: ReadonlyArray<never>) => void): void
}

export const ARC_ADD_CHAIN_PARAMS = {
  chainId: `0x${cfg.chainId.toString(16)}`,
  chainName,
  rpcUrls: cfg.rpcHttp,
  blockExplorerUrls: [cfg.explorerBaseUrl],
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    /*
     * EIGHTEEN, and this is the trap `packages/core/src/chain.ts` exists to warn about.
     *
     * Arc's USDC is one address in two roles: the ERC-20 interface at 6 decimals, which
     * every price, payment and receipt uses, and the NATIVE gas token at 18, which
     * `eth_getBalance` returns. These parameters describe the NATIVE currency, so they take
     * `USDC_NATIVE_DECIMALS`.
     *
     * Reaching for the payments constant is the natural mistake — it is the one this whole
     * app otherwise speaks — and it would show every visitor a wallet balance wrong by a
     * factor of 10^12, on the screen where they are deciding whether to trust us with money.
     */
    decimals: cfg.usdc.nativeDecimals
  }
} as const

export const getProvider = (): Eip1193Provider | undefined => {
  const w = globalThis as { ethereum?: Eip1193Provider }
  return w.ethereum
}

export const currentChainId = async (p: Eip1193Provider): Promise<number> =>
  Number(await p.request({ method: "eth_chainId" }))

export const onArc = async (p: Eip1193Provider): Promise<boolean> =>
  cfg.status === "ready" && (await currentChainId(p)) === cfg.chainId

/**
 * Put the wallet on Arc, adding the network if it does not have it.
 *
 * 4902 is "unrecognized chain" — the expected answer for a first-time visitor, not an
 * error. Some wallets return it from `wallet_switchEthereumChain`, others throw it, and at
 * least one reports it nested; all three are treated the same because the remedy is
 * identical and guessing wrong would strand someone at the network prompt.
 */
export const ensureArc = async (p: Eip1193Provider): Promise<void> => {
  if (cfg.status !== "ready") throw new Error(`${chainName} configuration is pending`)
  if (await onArc(p)) return
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_ADD_CHAIN_PARAMS.chainId }]
    })
  } catch (e) {
    const code = (e as { code?: number; data?: { originalError?: { code?: number } } })
    const unrecognized =
      code?.code === 4902 || code?.data?.originalError?.code === 4902
    if (!unrecognized) throw e
    // Adds AND switches in one prompt, which is why the guard can be an action.
    await p.request({ method: "wallet_addEthereumChain", params: [ARC_ADD_CHAIN_PARAMS] })
  }
}

export const connect = async (
  p: Eip1193Provider
): Promise<{ readonly address: string }> => {
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as ReadonlyArray<string>
  const address = accounts[0]
  if (address === undefined) throw new Error("no account was authorized")
  // Chain BEFORE the card, never after. See the module note.
  await ensureArc(p)
  return { address }
}

/**
 * Why the wallet cannot be used, as a sentence for a person — or `undefined` when it can.
 *
 * Pure, so the Confirmation card's blocked state is testable without a browser, and so this
 * is the ONLY place the wording lives.
 */
export const walletBlocker = (
  hasProvider: boolean,
  chainId: number | undefined
): string | undefined => {
  if (!hasProvider) {
    return (
      "No wallet detected in this browser. ARCADE never holds funds — a purchase is signed " +
      "by your own wallet, so one has to be installed to buy anything. Everything else on " +
      "this page works without one."
    )
  }
  if (cfg.status !== "ready") return `${chainName} configuration is pending; purchases are unavailable.`
  if (chainId === undefined) return undefined
  if (chainId === cfg.chainId) return undefined
  return (
    `Your wallet is on chain ${chainId}. Payments here are signed for ${chainName} ` +
    `(${cfg.chainId}) and the signature is bound to that chain, so it cannot be produced ` +
    `on another. Connecting will offer to add and switch to it in one step.`
  )
}
