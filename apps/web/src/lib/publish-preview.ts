import { Schema } from "effect"
import { SkillManifest } from "../../../../packages/core/src/manifest.ts"
import { parsePrice } from "../../../../packages/core/src/money.ts"
import { createPublishPreview } from "../../../../packages/runner/src/publish-preview.ts"

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type ObjectJson = { [key: string]: Json }
export interface PublishPreview {
  readonly target: string; readonly skillId: string
  readonly engine: { readonly adapter: string; readonly credential: string }
  readonly grants: readonly string[]; readonly advisory?: string
  readonly public: ObjectJson; readonly private: ObjectJson
}
export type PublishPreviewDocument =
  | { readonly kind: "directory"; readonly target: string; readonly entries: readonly PublishPreview[]; readonly skipped: readonly [] }
  | { readonly version: 1; readonly kind: "generated"; readonly source: "mcp" | "openapi"; readonly written: false;
      readonly target: string; readonly entries: readonly PublishPreview[]; readonly skipped: readonly { name: string; reason: "not-marked-read-only" }[] }

export class PublishFailed extends Error {
  readonly _tag = "PublishFailed"
  constructor() { super("Could not read a bounded CLI preview.") }
}
export class PublishDisabled extends Error {
  readonly _tag = "PublishDisabled"
  constructor() { super("Publishing previews run on your own explicitly enabled local machine, not this hosted site.") }
}
const object = (value: unknown): ObjectJson => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw 0
  return value as ObjectJson
}
const keys = (value: ObjectJson, allowed: readonly string[]) => {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw 0
}
const short = (value: unknown, max = 1024): value is string => typeof value === "string" &&
  value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value)
const same = (a: Json, b: Json): boolean => {
  if (a === b) return true
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
  const aa = Object.keys(a), bb = Object.keys(b)
  return aa.length === bb.length && aa.every(key => Object.hasOwn(b, key) && same((a as ObjectJson)[key]!, (b as ObjectJson)[key]!))
}
const entry = (value: unknown): PublishPreview => {
  const raw = object(value)
  keys(raw, ["target", "skillId", "engine", "grants", "advisory", "public", "private"])
  if (!short(raw.target)) throw 0
  const pub = object(raw.public), priv = object(raw.private)
  keys(priv, ["engine", "secrets", "egress", "workdir"])
  // Reject excess fields before combining the public and private halves.
  keys(pub, ["id", "version", "serviceName", "description", "tags", "iconUrl", "price", "replaces",
    "bounds", "inputSchema", "outputSchema", "canaryInput"])
  const manifest = Schema.decodeUnknownSync(SkillManifest, { onExcessProperty: "error" })({ ...pub, ...priv })
  const preview = createPublishPreview(raw.target, manifest)
  const canonical: Json = JSON.parse(JSON.stringify(preview))
  if (!same(raw, canonical)) throw 0
  // JSON roundtrip removes schema-class prototypes; equality above proves this DTO.
  const plain = object(canonical)
  return { ...preview, public: object(plain.public), private: object(plain.private) }
}

/** Actual current CLI JSON only. This function performs no IO or execution and
 * returns no raw output/error if any bound or cross-field validation fails. */
export const parsePreview = (stdout: unknown): PublishPreviewDocument => {
  try {
    if (typeof stdout !== "string" || stdout.length > 1048576 || new TextEncoder().encode(stdout).byteLength > 1048576) throw 0
    const raw: unknown = JSON.parse(stdout)
    let nodes = 0
    const check = (value: unknown, depth: number): void => {
      if (++nodes > 20000 || depth > 24) throw 0
      if (value === null || typeof value === "string" || typeof value === "boolean") return
      if (typeof value === "number") { if (!Number.isFinite(value)) throw 0; return }
      if (typeof value !== "object") throw 0
      for (const child of Object.values(value)) check(child, depth + 1)
    }
    check(raw, 0)
    const doc = object(raw)
    if (!Object.hasOwn(doc, "kind")) {
      const result = entry(doc)
      return { kind: "directory", target: result.target, entries: [result], skipped: [] }
    }
    keys(doc, ["version", "kind", "source", "written", "target", "entries", "skipped"])
    if (doc.version !== 1 || doc.kind !== "generated" || doc.written !== false ||
      (doc.source !== "mcp" && doc.source !== "openapi") || !short(doc.target) ||
      !Array.isArray(doc.entries) || doc.entries.length < 1 || doc.entries.length > 64 ||
      !Array.isArray(doc.skipped) || doc.skipped.length > 1000 || (doc.source === "openapi" && doc.skipped.length !== 0)) throw 0
    const entries = doc.entries.map(entry), ids = new Set<string>(), skippedNames = new Set<string>()
    for (const row of entries) {
      if (row.engine.adapter !== doc.source || ids.has(row.skillId)) throw 0
      if (typeof row.public.price !== "string") throw 0
      parsePrice(row.public.price) // Match the actual generated CLI's positive-price gate.
      ids.add(row.skillId)
    }
    const skipped = doc.skipped.map(value => {
      const row = object(value); keys(row, ["name", "reason"])
      if (!short(row.name, 256) || row.reason !== "not-marked-read-only" || skippedNames.has(row.name)) throw 0
      skippedNames.add(row.name)
      return { name: row.name, reason: "not-marked-read-only" as const }
    })
    return { version: 1, kind: "generated", source: doc.source, written: false, target: doc.target, entries, skipped }
  } catch { throw new PublishFailed() }
}
