/** Passive original target capture; no normalization, URL inference or IO.
 * Other argument fields belong to their enclosing decoder. Both present (even
 * undefined), accessors and inherited targets are refused, never stripped.
 */
import { nameOk, skillIdOk } from "./hub-decode.ts"

export type PurchaseTarget = Readonly<{ skillId: string; name?: never } | { name: string; skillId?: never }>
export function capturePurchaseTarget(value: unknown): PurchaseTarget | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return undefined
    const skill = Object.getOwnPropertyDescriptor(value, "skillId")
    const name = Object.getOwnPropertyDescriptor(value, "name")
    if (Boolean(skill) === Boolean(name)) return undefined
    if (skill?.enumerable && "value" in skill && skillIdOk(skill.value)) return Object.freeze({ skillId: skill.value })
    if (name?.enumerable && "value" in name && nameOk(name.value)) return Object.freeze({ name: name.value })
    return undefined
  } catch { return undefined }
}
