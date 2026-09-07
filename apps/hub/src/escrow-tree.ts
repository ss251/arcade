/** Escrow-only current-disk child admission. No payment or capability authority. */
import type { Database } from "bun:sqlite"
import { hashJson } from "@arcade/core"
import { escrowActionContext, escrowCheck, escrowProviderContextHash, escrowUint } from "@arcade/payments"
import type { EscrowAdmission } from "./escrow-store.ts"
import type { TreeRow } from "./store.ts"
export interface EscrowRootTreeState {
  readonly closed: boolean; readonly ceilingAtomic: bigint; readonly reservedAtomic: bigint
  readonly committedAtomic: bigint; readonly children: ReadonlyArray<TreeRow>
}
interface Header { root_job_id: string; ceiling_atomic: string; closed: number }
interface Row { root_job_id: string; child_job_id: string; amount_atomic: string; state: string }
export function openEscrowTree(db: Database, read: (id: string) => EscrowAdmission | undefined) {
  db.exec(`CREATE TABLE IF NOT EXISTS escrow_root_trees (
    root_job_id TEXT PRIMARY KEY REFERENCES escrow_admissions(job_id),
    ceiling_atomic TEXT NOT NULL, closed INTEGER NOT NULL CHECK(closed IN (0,1)));`)
  if (!db.query<{ name: string }, []>("PRAGMA table_info(escrow_admissions)").all().some(c => c.name === "tree_digest"))
    db.exec("ALTER TABLE escrow_admissions ADD COLUMN tree_digest TEXT")
  const unavailable = () => { throw Error("escrow_tree_unavailable") }
  const id = (v: unknown) => { escrowCheck(typeof v === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(v)); return v }
  const atomic = (v: string) => { if (!/^(0|[1-9][0-9]{0,77})$/.test(v)) return unavailable(); return escrowUint(BigInt(v)) }
  const header = (root: string) => db.query<Header, [string]>("SELECT * FROM escrow_root_trees WHERE root_job_id = ?").get(root)
  const ownerOf = (root: string) => db.query("SELECT 1 FROM escrow_admissions WHERE job_id = ?").get(root) ||
    db.query("SELECT 1 FROM jobs WHERE id = ? AND escrow_key IS NOT NULL").get(root) ? read(root) : undefined
  const rawRows = (root: string) => db.query<Row, [string]>("SELECT * FROM tree_reservations WHERE root_job_id = ? ORDER BY rowid LIMIT 1001").all(root)
  const digest = (root: string) => hashJson({ header: header(root), rows: rawRows(root) })
  const assertBinding = (root: string) => {
    const binding = db.query<{ tree_digest: string | null }, [string]>("SELECT tree_digest FROM escrow_admissions WHERE job_id = ?").get(root)
    const h = header(root)
    if (!binding) { if (h) unavailable(); return }
    if (binding.tree_digest === null) { if (h || rawRows(root).length) unavailable(); return }
    if (!h || binding.tree_digest !== digest(root)) unavailable()
  }
  const persistDigest = (root: string) => {
    db.query("UPDATE escrow_admissions SET tree_digest = ? WHERE job_id = ?").run(digest(root), root)
    assertBinding(root)
  }
  function snapshot(root: string): EscrowRootTreeState | undefined {
    assertBinding(root)
    const owner = ownerOf(root), h = header(root)
    if (!owner) { if (h) unavailable(); return undefined }
    const rows = rawRows(root)
    if (!h) { if (rows.length) unavailable(); return undefined }
    try {
      id(root); escrowCheck(rows.length <= 1000 && [0, 1].includes(h.closed))
      const ceilingAtomic = atomic(h.ceiling_atomic)
      const children = rows.map(row => {
        id(row.child_job_id); escrowCheck(row.child_job_id !== root && ["reserved", "committed", "released"].includes(row.state))
        const amountAtomic = atomic(row.amount_atomic); escrowCheck(amountAtomic > 0n)
        escrowCheck(!db.query("SELECT 1 FROM escrow_admissions WHERE job_id = ?").get(row.child_job_id) &&
          !db.query("SELECT 1 FROM session_calls WHERE job_id = ?").get(row.child_job_id))
        return { childJobId: row.child_job_id, amountAtomic, state: row.state as TreeRow["state"] }
      })
      const sum = (state: TreeRow["state"]) => children.reduce((n, row) => n + (row.state === state ? row.amountAtomic : 0n), 0n)
      const reservedAtomic = sum("reserved"), committedAtomic = sum("committed")
      escrowCheck(reservedAtomic + committedAtomic <= ceilingAtomic)
      if (["settled", "refunded"].includes(owner.state)) escrowCheck(h.closed === 1 && reservedAtomic === 0n)
      return { closed: h.closed === 1, ceilingAtomic, children, reservedAtomic, committedAtomic }
    } catch { return unavailable() }
  }
  const bound = (raw: unknown, root: string) => {
    const context = escrowActionContext(raw), owner = read(id(root))
    escrowCheck(owner && escrowProviderContextHash(owner.context) === escrowProviderContextHash(context)); return owner
  }
  const prepare = db.transaction((raw: unknown, root: string, ceiling: bigint) => {
    const owner = bound(raw, root), value = escrowUint(ceiling), old = snapshot(root)
    if (old) { escrowCheck(old.ceilingAtomic === value); return }
    escrowCheck(owner.state === "admitted" || owner.state === "executing")
    db.query("INSERT INTO escrow_root_trees VALUES (?,?,0)").run(root, String(value))
    persistDigest(root)
    const saved = snapshot(root); if (!saved || saved.closed || saved.ceilingAtomic !== value) unavailable()
  })
  const close = db.transaction((raw: unknown, root: string) => {
    const owner = bound(raw, root), old = snapshot(root); escrowCheck(old !== undefined)
    if (!old.closed) {
      escrowCheck(["admitted", "executing", "uncertain"].includes(owner.state))
      db.query("UPDATE escrow_root_trees SET closed = 1 WHERE root_job_id = ?").run(root)
      persistDigest(root)
    }
    const saved = snapshot(root); if (!saved?.closed) return unavailable(); return saved
  })
  const reserve = db.transaction((root: string, child: string, amount: bigint, ceiling: bigint): boolean | undefined => {
    const owner = ownerOf(root)
    const existing = db.query<Row, [string]>("SELECT * FROM tree_reservations WHERE child_job_id = ?").get(child)
    // An unrelated legacy root cannot steal an escrow child through a stale cache.
    if (!owner) return existing && ownerOf(existing.root_job_id) ? false : undefined
    const tree = snapshot(root)
    if (!tree || tree.closed || owner.state !== "executing" || existing) return false
    try { id(child); escrowUint(amount); escrowUint(ceiling) } catch { return false }
    if (child === root || amount <= 0n || ceiling !== tree.ceilingAtomic || tree.children.length >= 1000 ||
      tree.reservedAtomic + tree.committedAtomic + amount > ceiling ||
      db.query("SELECT 1 FROM jobs WHERE id = ?").get(child) || db.query("SELECT 1 FROM receipts WHERE job_id = ?").get(child) ||
      db.query("SELECT 1 FROM session_calls WHERE job_id = ?").get(child)) return false
    db.query("INSERT INTO tree_reservations VALUES (?,?,?,?)").run(child, root, String(amount), "reserved")
    persistDigest(root)
    const saved = snapshot(root)?.children.find(r => r.childJobId === child)
    if (!saved || saved.amountAtomic !== amount || saved.state !== "reserved") unavailable()
    return true
  })
  const transition = db.transaction((child: string, state: "committed" | "released") => {
    const row = db.query<Row, [string]>("SELECT * FROM tree_reservations WHERE child_job_id = ?").get(child)
    if (!row || !ownerOf(row.root_job_id)) return false
    snapshot(row.root_job_id)
    if (row.state === state) return true
    escrowCheck(row.state === "reserved")
    db.query("UPDATE tree_reservations SET state = ? WHERE child_job_id = ?").run(state, child)
    persistDigest(row.root_job_id)
    if (snapshot(row.root_job_id)?.children.find(r => r.childJobId === child)?.state !== state) unavailable()
    return true
  })
  const validate = () => {
    const rows = db.query<Header, []>("SELECT * FROM escrow_root_trees LIMIT 10001").all()
    if (rows.length > 10000 || db.query(`SELECT 1 FROM tree_reservations JOIN escrow_admissions
      ON escrow_admissions.job_id = tree_reservations.root_job_id LEFT JOIN escrow_root_trees
      ON escrow_root_trees.root_job_id = tree_reservations.root_job_id WHERE escrow_root_trees.root_job_id IS NULL LIMIT 1`).get()) unavailable()
    for (const row of db.query<{ job_id: string }, []>("SELECT job_id FROM escrow_admissions WHERE tree_digest IS NOT NULL LIMIT 10001").all()) assertBinding(row.job_id)
    for (const row of rows) if (!snapshot(row.root_job_id)) unavailable()
  }
  db.transaction(validate).deferred()
  return { assertBinding, prepare: (raw: unknown, root: string, ceiling: bigint) => prepare.immediate(raw, root, ceiling),
    close: (raw: unknown, root: string) => close.immediate(raw, root),
    reserve: (root: string, child: string, amount: bigint, ceiling: bigint) => reserve.immediate(root, child, amount, ceiling),
    transition: (child: string, state: "committed" | "released") => transition.immediate(child, state),
    snapshot: (root: string) => db.transaction(snapshot).deferred(root) }
}
