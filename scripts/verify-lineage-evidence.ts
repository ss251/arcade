import { readFileSync } from "node:fs"

type Row = Record<string, unknown>
const row = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const txPattern = /^0x[0-9a-fA-F]{64}$/

/** The public feed hides job ids, so join this purchase and its descendants by tx hash. */
export const verifyLineageEvidence = (buyerOutput: string, rawReceipts: unknown) => {
  const resultText = /^result  ([\s\S]*?)\n\nreceipt\s*$/m.exec(buyerOutput)?.[1]
  if (resultText === undefined) throw new Error("buyer output has no result")
  const output = row(JSON.parse(resultText))
  if (!/^status  succeeded\s*$/m.test(buyerOutput) || output["ok"] !== true) {
    throw new Error("buyer output did not succeed")
  }
  const hired = output["hired"]
  if (!Array.isArray(hired) || !hired.some((line) => typeof line === "string" && line.includes("lineage_cycle"))) {
    throw new Error("buyer output did not report the expected cycle refusal")
  }
  const rootTx = /^  tx\s+https:\/\/testnet\.arcscan\.app\/tx\/(0x[0-9a-fA-F]{64})\s*$/m.exec(buyerOutput)?.[1]
  if (rootTx === undefined) throw new Error("this purchase has no Arc testnet settlement transaction")
  if (!Array.isArray(rawReceipts)) throw new Error("/receipts did not return an array")
  const receipts = rawReceipts.map(row)
  const root = receipts.find((r) => r["settleTx"] === rootTx && r["skillId"] === "loop-probe" && r["hop"] === 0)
  if (root === undefined) throw new Error("no root receipt matches this purchase")

  const assertSettled = (r: Row): void => {
    if (r["settled"] !== true) throw new Error(`${String(r["skillId"])} did not settle`)
    if (r["network"] !== "eip155:5042002") throw new Error("receipt is not on Arc testnet")
    if (typeof r["settleTx"] !== "string" || !txPattern.test(r["settleTx"])) throw new Error("receipt is missing a settlement transaction")
    if (r["explorer"] !== `https://testnet.arcscan.app/tx/${r["settleTx"]}`) throw new Error("receipt has an invalid explorer link")
  }
  assertSettled(root)
  if (!Array.isArray(root["children"]) || root["children"].length < 2) throw new Error("root receipt has fewer than two descendants")
  const children = root["children"].map(row)
  for (const child of children) {
    if (child["settled"] !== true) throw new Error("root contains an unsettled child")
  }

  const descendant = (skillId: string, hop: number, ancestors: string[]): Row => {
    const child = children.find((c) => c["skillId"] === skillId)
    if (child === undefined) throw new Error(`root tree is missing ${skillId}`)
    const full = receipts.find((r) => r["skillId"] === skillId && r["settleTx"] === child["settleTx"])
    if (full === undefined) throw new Error(`no ${skillId} receipt matches the purchased tree`)
    assertSettled(full)
    if (full["hop"] !== hop || JSON.stringify(full["ancestors"]) !== JSON.stringify(ancestors)) {
      throw new Error(`${skillId} has incorrect lineage`)
    }
    return full
  }
  const wallet = descendant("wallet-risk-note", 1, ["loop-probe"])
  const flow = descendant("usdc-flow-check", 2, ["loop-probe", "wallet-risk-note"])
  return { root, wallet, flow }
}

if (import.meta.main) {
  try {
    const buyerPath = process.argv[2]
    const receiptsPath = process.argv[3]
    if (buyerPath === undefined || receiptsPath === undefined) throw new Error("usage: verify-lineage-evidence.ts <buyer-output> <receipts-json>")
    const evidence = verifyLineageEvidence(readFileSync(buyerPath, "utf8"), JSON.parse(readFileSync(receiptsPath, "utf8")))
    console.log("verified public receipt tree")
    console.log(JSON.stringify(evidence, null, 2))
    for (const receipt of Object.values(evidence)) console.log(`${String(receipt["skillId"])}: ${String(receipt["explorer"])}`)
  } catch (error) {
    console.error(`lineage evidence failed: ${String((error as Error)?.message ?? error)}`)
    process.exitCode = 1
  }
}
