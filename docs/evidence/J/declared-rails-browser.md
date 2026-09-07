# Declared rails — offline browser observation

September8,2026, approximately00:10–00:16IST. Synthetic public catalogue and
detail fixtures only, using the actual development Start routes, H4 decoder,
skill-page projection and client hydration. No live hub or payment was used.

The shared Chrome harness twice stopped at its permission boundary. Its
documented helper reported ready but the next attempt remained blocked; no
upgrade or further permission retry was performed. Verification used a fresh
Codex in-app browser tab instead. This is not an owner live-wallet review.

## Observed

- Native Declared payment rail control: All declarations showed3 of3 synthetic
  listings; selecting Escrow showed only Diff Triage,1 of3.
- Keyboard Up opened the native menu; Up then Return selected Exact and visibly
  showed Diff Triage plus Exact Skill,2 of3.
- Declaration unavailable showed only Legacy Skill,1 of3. It did not assert
  that the legacy listing has no supported rail.
- Screenshot review with viewport overrides390×844 and1280×900: filter label,
  explanatory text, focus outline, result count and full card rail declarations
  were readable; existing mobile stacked/desktop grid layout and money/provenance
  styling were retained. These dark-scheme images were inspected inline in the
  execution conversation, not exported PNGs or production screenshots.
- A separate actual skill-detail tab,390×844: all three declared labels and
  the explicit no-browser-escrow-purchases note were visible. Synthetic hostile
  description markup remained escaped text; the full seller address wrapped.

## Bounds and cleanup

The catalogue fixture's existing300,000ms hard cutoff expired before the final
counter read, which returned ConnectionRefused. Therefore this manual pass
does not claim final catalogue request counts. The automated route test
separately verifies its allowed one-listings/one-stats/zero-other reads.
The owned catalogue process was reaped with exit1 from that cutoff; both exact
ports independently returned ECONNREFUSED afterward.

The separate detail fixture returned exactly detail1,receipts1,names0,other0.
It was explicitly stopped, reaped with exit0, and both exact ports independently
returned ECONNREFUSED. Both created in-app tabs were closed; temporary viewport
overrides were reset. The loopback URLs served only during their runs and no
long-lived demo service remains.

No owner keys, saved-wallet data, model/provider calls, payment probes or
signatures, sends, RPC, ENS writes, deployments, approval replay or spending.
Only declared support is shown; no current availability, escrow settlement,
refund or independently verified execution is claimed.
