# J11C1 — declared rails and local catalog filtering

After [J11B2](task-11b2-report.md), implement the first offline web slice of
[J11](task-11-brief.md). Current hub listing/detail responses carry the optional
public manifest rails, not a freshly probed payment challenge. Preserve that
distinction. No signer, payment probe, wallet/storage or upstream route change.

- Decode only a bounded plain array of one to three unique known identifiers:
  gateway, eip3009, erc8183. Copy/freeze in Circle preference order. Do not invoke
  accessors or coercion. Missing/malformed optional declarations stay unavailable
  without erasing a valid listing or inferring legacy/default rail support.
- Carry the projection through both the hub decoder and skill-page serialization
  boundary. Labels say Accepts (declared): gateway · exact · escrow; accompanying
  context states that declared support is not current availability or a browser
  escrow purchase path.
- Native labeled local filter: all, gateway, exact, escrow, unavailable metadata.
  Filter only the already decoded catalog; no extra reads or changed counters.
  Keep source outage, empty catalog and no filter matches distinct. Accessible
  result count, keyboard operation and mobile layout using existing ARCADE tokens.
- Preserve existing provenance colors, numeric typography, card grid and
  navigation. No redesigned hero, new dependencies or semantic colors.
- Test hostile/legacy/valid declarations, independent cloning, public projection
  and actual loader/route integration, card/detail output and filter behavior.
  Inspect owned synthetic browser views at desktop/mobile with keyboard use;
  no external hub, credentials, payment/ENS writes or live transaction evidence.

Receipt terminal/funding evidence is J11C2, not inferred from rail labels.
One sequential four-worker full gate per atomic commit; exact-one main FF,
no squash/push. J4/J5/J6/Task10 live pauses and existing payment safeguards remain.
