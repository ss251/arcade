# A9 compatibility brief — immutable historical offline inputs

G14 will evolve wallet-risk-note into a two-child composite. A9's historical
three-job proof and exact live verifier must not be changed to imply a four-job
run. Its offline tests currently copy today's skill sources, so isolate their
historical inputs first as a separate compatibility checkpoint.

Snapshot all three manifests/programs byte-for-byte at base `381093e`, record and
test their SHA-256 fingerprints, and keep program snapshots inert until copied
into owned test directories. Extract only the current preparation helper into a
shared explicit-source builder. Historical test loading must have one fixed
path and fixed hashes; live loading must still select only current workspace
files and enforce all original exact guards. Add no CLI, environment or profile
switch selecting old files for live work.

Use genuine missing-export/fixture Reds and retain every former offline entry,
broker, SDK, cycle and capacity assertion. Verify current manifest drift still
refuses. Independently compare retained live prefix/validator/CLI bodies and all
six snapshot bytes. Do not edit the loop-probe manifest, lineage shell wrapper,
live evidence, approval, role, price or send logic. No key, funded run or network
claim is authorized. Full test/type gates and a separate local commit precede
the main merge/all-four-gate verification; never push.
