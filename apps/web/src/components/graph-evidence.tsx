import { checkedGraphEvidence } from "../../../../packages/buyer/src/graph-evidence.ts"

/** Independent index provenance, never a registry ownership or purchase gate. */
export function IndexedEvidence({ evidence }: { readonly evidence: unknown }) {
  const graph = checkedGraphEvidence(evidence)
  if (graph === undefined) return null
  return <section className="skill-evidence content-panel" aria-label="Indexed evidence">
    <h2>Graph index</h2>
    <p className="skill-note">Hub-reported, cached Arc testnet (eip155:5042002) evidence via The Graph;
      not independently verified. The index block and freshness are not supplied.</p>
    <dl className="skill-facts">
      <div><dt>Indexed agent</dt><dd><code className="skill-code">{graph.agentId}</code></dd></div>
      <div><dt>Indexed settlements</dt><dd>{graph.settlementCount}</dd></div>
      <div><dt>Indexed feedback</dt><dd>{graph.feedbackCount}</dd></div>
      <div><dt>Indexed validations passed</dt><dd>{graph.validationPassCount}</dd></div>
    </dl>
    <p className="skill-note">Indexed feedback is not proven payment-backed. These counts do not establish
      seller ownership, a current registry result, or purchase availability.</p>
  </section>
}
