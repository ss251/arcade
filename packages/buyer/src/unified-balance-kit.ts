/** SDK-only binding. No keys, transports, observers or signing clients are
 * created on import. The CLI runtime supplies separately guarded adapters. */
import { UnifiedBalanceKit, createUnifiedBalanceKitContext, resolveChainIdentifier } from "@circle-fin/unified-balance-kit"
import { captureUnifiedFundingPlan, unifiedSpendParams, UnifiedFundingFailure, type UnifiedFundingDependencies } from "./unified-balance-funding.ts"

type KitAdapter = Parameters<UnifiedBalanceKit["getDelegateStatus"]>[0]["from"]["adapter"]
type FundingKit = Pick<UnifiedBalanceKit, "getDelegateStatus" | "spend">
type GatewayProvider = ReturnType<typeof createUnifiedBalanceKitContext>["providers"][0]
/** Pinned1.6.0 provider seam: requestConfig is an internal, published type.
 * Do not configure provider headers: that SDK factory replaces requestConfig
 * with headers-only when headers exist. The owned fetch boundary independently
 * refuses a second transfer dispatch, redirects and unbounded response bodies. */
export const oneAttemptUnifiedProvider = (provider: GatewayProvider): GatewayProvider => ({
  ...provider,
  spend: (params, options) => provider.spend(params, { ...options,
    requestConfig: { maxRetries: 1, timeout: 5000, retryDelay: 0 } })
})
export const createUnifiedFundingKit = () => {
  const context = createUnifiedBalanceKitContext({ disableAnalytics: true, disableErrorReporting: true })
  return new UnifiedBalanceKit({ excludeDefaultProviders: true, providers: [oneAttemptUnifiedProvider(context.providers[0])],
    disableAnalytics: true, disableErrorReporting: true })
}

/** Owner adapter must be read-only. Delegate adapter must guard signing, gas and
 * receipt polling; this binding is not authority to use unbounded SDK defaults. */
export const unifiedKitBindings = (kit: FundingKit, ownerAdapter: KitAdapter, delegateAdapter: KitAdapter):
  Pick<UnifiedFundingDependencies, "delegateStatus" | "spend"> => Object.freeze({
  async delegateStatus(identity) {
    const plan = captureUnifiedFundingPlan({ owner: identity.owner, recipient: identity.delegate, sourceChain: identity.sourceChain, amount: "0.000001" })
    const actual = await ownerAdapter.getAddress(resolveChainIdentifier(plan.sourceChain))
    if (actual.toLowerCase() !== plan.owner) throw new UnifiedFundingFailure("read_unavailable")
    return kit.getDelegateStatus({ from: { adapter: ownerAdapter, chain: plan.sourceChain },
      delegateAddress: plan.recipient, token: "USDC" })
  },
  async spend(plan) {
    const params = unifiedSpendParams(plan, delegateAdapter)
    const from = await delegateAdapter.getAddress(resolveChainIdentifier(params.from.allocations.chain))
    const to = await delegateAdapter.getAddress(resolveChainIdentifier("Arc_Testnet"))
    if (from.toLowerCase() !== params.to.recipientAddress || to.toLowerCase() !== params.to.recipientAddress) throw new UnifiedFundingFailure("input_invalid")
    return kit.spend(params)
  }
})
