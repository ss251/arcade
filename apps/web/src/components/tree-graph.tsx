import { useId, useState } from "react"
import { loadChainConfig } from "../../../../packages/core/src/chain-config.ts"
import { shortHash } from "../lib/format.ts"
import { NODE_H, NODE_W, layoutTree } from "../lib/tree-layout.ts"
import type { Layout } from "../lib/tree-layout.ts"
import type { TreeEvidenceFlag, TreeNode, TreeView } from "../lib/hub-decode.ts"

const labels: Record<TreeEvidenceFlag, string> = {
  "commitment-missing": "commitment missing", "commitment-mismatch": "commitment mismatch",
  "receipt-missing": "receipt missing", "receipt-conflict": "receipt conflict",
  "lineage-invalid": "lineage invalid", "evidence-malformed": "evidence malformed",
  "limit-exceeded": "evidence limit exceeded", "reservation-unresolved": "reservation unresolved"
}
const compact = (text: string, limit: number) => text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && /[1-9a-fA-F]/.test(value.slice(2))

/** H4 supplies the qualified URL; this guard never guesses a rail or creates a missing link. */
const suppliedLink = (node: TreeNode): string | null => {
  if (!node.settled || !hash(node.settleTx) || typeof node.explorer !== "string") return null
  for (const id of ["arc-testnet", "arc-mainnet"] as const) {
    const chain = loadChainConfig(id)
    if (chain.status === "ready" && node.explorer === `${chain.explorerBaseUrl}/tx/${node.settleTx}`) return node.explorer
  }
  return null
}
const description = (node: TreeNode) =>
  `${node.skillId}: ${node.price}, ${node.settled ? "recorded settled" : `not recorded settled — ${node.reason}`}`

/** Read-only recorded receipts. Neither a URL nor a digest is independent chain proof. */
export const TreeGraph = ({ view, initialMode = "diagram" }: { view: TreeView; initialMode?: "diagram" | "list" }) => {
  const [mode, setMode] = useState(initialMode), id = useId()
  let layout: Layout
  try { layout = layoutTree(view) }
  catch { return <p className="law">Receipt tree unavailable — invalid recorded topology.</p> }
  if (layout.nodes.length === 0) return <p className="law">No hops available in this receipt view.</p>
  const settled = layout.nodes.filter(node => node.settled).length
  // Layout places parents after their children. A reading order follows the validated
  // numeric node paths instead: each parent before its descendants, then the next sibling.
  const readingOrder = [...layout.nodes].sort((a, b) => {
    const left = a.nodeId.split(".").map(Number), right = b.nodeId.split(".").map(Number)
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      if (left[index] !== right[index]) return left[index]! - right[index]!
    }
    return left.length - right.length
  })
  return (
    <figure className="tree">
      <div className="tree-heading"><p className="tree-counts"><strong>{layout.nodes.length} calls</strong><span className="settled">{settled} recorded settled</span></p>
        <div className="tree-view-switch" role="group" aria-label="Receipt view"><button type="button" aria-pressed={mode === "diagram"} aria-controls={id} onClick={() => setMode("diagram")}>Diagram</button><button type="button" aria-pressed={mode === "list"} aria-controls={id} onClick={() => setMode("list")}>List</button></div>
      </div>
      <p className="note">Reported call relationships and payments. Open a receipt to inspect its supplied Arc transaction.</p>
      {mode === "diagram" ? <div id={id} className="tree-viewport" tabIndex={0} role="region" aria-label="Scrollable receipt graph">
        <svg viewBox={`-3 -3 ${layout.width + 6} ${layout.height + 6}`}
          width={layout.width + 6} height={layout.height + 6} role="group"
          aria-label={`Receipt tree: ${layout.nodes.length} jobs, ${settled} recorded settled`}>
          <title>Recorded receipt relationships. Read complete labels and reasons in Receipt details.</title>
          {layout.edges.map(edge => <path key={`${edge.from}->${edge.to}`} d={edge.path}
            className="tree-edge" fill="none" aria-hidden="true" />)}
          {layout.nodes.map(node => {
            const label = description(node), href = suppliedLink(node)
            const box = <g className={`node${node.settled ? " is-settled" : " is-refused"}`}>
              <title>{label}</title>
              <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H} rx={8} />
              <text x={node.x + 10} y={node.y + 19} className="node-skill">{compact(node.skillId, 21)}</text>
              <text x={node.x + 10} y={node.y + 39} className="node-price">{compact(node.price, 9)}</text>
              <text x={node.x + NODE_W - 10} y={node.y + 39} className="node-state" textAnchor="end">
                {node.settled ? "\u2713 settled" : compact(node.reason, 13)}
              </text>
            </g>
            return href === null
              ? <g key={node.nodeId} role="group" aria-label={label}>{box}</g>
              : <a key={node.nodeId} href={href} target="_blank" rel="noreferrer" aria-label={`${label}; open recorded transaction`}>{box}</a>
          })}
        </svg>
      </div> : <ol id={id} className="tree-list" aria-label="Receipt calls">{readingOrder.map(node => {
        const parent = node.parentNodeId === null ? null : layout.nodes.find(value => value.nodeId === node.parentNodeId)
        const href = suppliedLink(node)
        return <li key={node.nodeId} className={`tree-call${node.parentNodeId === null ? " is-root" : ""}`}>
          <div className="tree-call-name"><h4>{node.skillId.replaceAll("-", " ")}</h4><p className="note">{node.parentNodeId === null ? "Original call" : <>Hired by {parent?.skillId.replaceAll("-", " ") ?? "unknown caller"} · node <code>{node.parentNodeId}</code></>}</p></div>
          <div className="tree-call-payment"><span className="tree-money">{node.price}</span><span className={node.settled ? "settled" : "unsettled"}>{node.settled ? "Recorded settled" : "Not recorded settled"}</span></div>
          {node.settled ? null : <p className="tree-call-reason">{node.reason}</p>}
          {href === null ? null : <a className="tree-call-link" href={href} target="_blank" rel="noreferrer">View Arc receipt ↗</a>}
        </li>
      })}</ol>}
      <figcaption>
        <p>{view.complete ? "Complete recorded receipt set."
          : `Incomplete receipt evidence: ${view.evidenceFlags.map(flag => labels[flag]).join("; ")}.`}</p>
      </figcaption>
      <details className="tree-details">
        <summary>Receipt details — full labels and refusal reasons</summary>
        <p>{hash(view.treeHash)
          ? <>Recorded tree digest <span className="hashish">{shortHash(view.treeHash)}</span>.</>
          : "Tree digest unavailable."} Digest and transaction links are hub-recorded evidence, not independent chain proof.</p>
        {view.committed === undefined || view.ceiling === undefined ? null
          : <p><span className="tree-money">{view.committed}</span> of <span className="tree-money">{view.ceiling}</span> recorded sub-spend.</p>}
        <ol>{readingOrder.map(node => <li key={node.nodeId}>
          <span className="tree-detail-skill">{node.skillId} <span className="tree-parent">(node {node.nodeId})</span></span>
          <span className="tree-money">{node.price}</span>
          <span>{node.settled ? "recorded settled" : `not recorded settled — ${node.reason}`}</span>
          <span className="tree-parent">{node.parentNodeId === null ? "root"
            : `hired by node ${node.parentNodeId} — ${layout.nodes.find(parent => parent.nodeId === node.parentNodeId)?.skillId ?? "unknown"}`}</span>
          {suppliedLink(node) === null ? null : <a href={suppliedLink(node)!} target="_blank" rel="noreferrer">
            Recorded transaction for node {node.nodeId}
          </a>}
        </li>)}</ol>
      </details>
    </figure>
  )
}
