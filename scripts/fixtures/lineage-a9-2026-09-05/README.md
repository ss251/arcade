# A9 historical offline-lineage inputs

These files are byte-for-byte snapshots of the three skill inputs at repository commit
`381093ef9e701d0d3b070812a46dcc41995850e6` on 2026-09-05. They exist only to keep A9's
keyless, test-rail HTTP/broker regression reproducible after the live wallet listing evolves.

They are not current marketplace listings, live proof, a replayable funded configuration, or
evidence of any post-A9 topology. The live lineage command continues to load the current files
from `skills/` and continues to enforce the original exact three-listing checks. Program snapshots
use the inert filename `run.ts.txt`; the test-only loader copies their bytes to an owned temporary
directory before execution.

| Snapshot | SHA-256 |
| --- | --- |
| `loop-probe/arcade.json` | `bfb1cf68e85d957935b81828aa72dbc30df786930545f791e86138f238491c3f` |
| `loop-probe/run.ts.txt` | `e70ba39feba972bca6b06b2ca0bd7e8cf62f35595a6ecec1869be4e529d0bd19` |
| `wallet-risk-note/arcade.json` | `1577e89bcf048a3a1f7851b2eec5072ad6555be043ac720851941713774466df` |
| `wallet-risk-note/run.ts.txt` | `a713128d33f8b56c9a55298f83afbb37b8d4165a0b00797fb442624eb3368b62` |
| `usdc-flow-check/arcade.json` | `760df29360dba616e10aa51f075b07861368279556b1761c53b9334ba5a6230e` |
| `usdc-flow-check/run.ts.txt` | `2f605bd93956b753f7463fa7a24d898fba393cefd8cd5efafa79e136086e9f7b` |

Any byte change requires a new versioned fixture directory and a new test contract. Never update
these hashes in place to make a later topology look like the historical three-job A9 run.
