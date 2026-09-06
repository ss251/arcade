/** Inert, bounded projection shared by discovery consumers. No IO, environment,
 * signer or dependency on the MCP server's private capabilities. */
export interface GraphEvidence {
  readonly agentId: string
  readonly settlementCount: number
  readonly feedbackCount: number
  readonly validationPassCount: number
}

export const checkedGraphEvidence = (raw: unknown): GraphEvidence | undefined => {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return undefined
    const own = (key: string): unknown => {
      const d = Object.getOwnPropertyDescriptor(raw, key)
      return d?.enumerable && "value" in d ? d.value : undefined
    }
    const agentId = own("agentId"), settlementCount = own("settlementCount"),
      feedbackCount = own("feedbackCount"), validationPassCount = own("validationPassCount")
    const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    if (typeof agentId !== "string" || !/^5042002:(0|[1-9][0-9]{0,77})$/.test(agentId) ||
      BigInt(agentId.slice(8)) >= 1n << 256n || !count(settlementCount) || !count(feedbackCount) || !count(validationPassCount)) return undefined
    return Object.freeze({ agentId, settlementCount, feedbackCount, validationPassCount })
  } catch { return undefined }
}

/** The configured hub reports these cached indexed facts; this client does not
 * independently query the chain or prove feedback's payment linkage. */
export const graphEvidenceLine = (raw: unknown): string => {
  const e = checkedGraphEvidence(raw)
  if (e === undefined) return ""
  const settlements = e.settlementCount === 0 ? "no settlements indexed yet" : `${e.settlementCount} settlements`
  return `Hub-reported Graph index: ERC-8004 agent ${e.agentId} — ${settlements} · ${e.feedbackCount} feedback entries · ${e.validationPassCount} validations passed (Arc testnet eip155:5042002 via The Graph; cached, not independently verified; feedback is not proven payment-backed).`
}
