/** Passive browser-only ordinary reads. No storage, server environment, approval,
 * signing, payment submission or retry. A raw result is NOT validated settlement.
 */
import { captureStoredJob } from "./job-store.ts"
import { decodeTree, type TreeView } from "./hub-decode.ts"
import { ordinaryHttp, OrdinaryJobHttpFailure, type OrdinaryReadOptions, type OrdinaryRawResult } from "./ordinary-http-transport.ts"
export { ORDINARY_BODY_LIMIT, OrdinaryJobHttpFailure, type OrdinaryReadOptions, type OrdinaryRawResult } from "./ordinary-http-transport.ts"

function read(input: unknown, kind: "result", options: OrdinaryReadOptions, fetchFn?: typeof fetch): Promise<OrdinaryRawResult>
function read(input: unknown, kind: "tree", options: OrdinaryReadOptions, fetchFn?: typeof fetch): Promise<TreeView>
function read(input: unknown, kind: "result" | "tree", options: OrdinaryReadOptions,
  fetchFn?: typeof fetch): Promise<OrdinaryRawResult | TreeView> {
  return ordinaryHttp(() => {
    const row = captureStoredJob(input)
    if (row === undefined) throw new OrdinaryJobHttpFailure()
    return {
      url: `${row.hubOrigin}/${kind === "tree" ? "trees" : "jobs"}/${row.jobId}${kind === "result" ? "/result" : ""}`,
      method: "GET", headers: { accept: "application/json", "x-job-token": row.token },
      maximumMs: kind === "result" ? 90000 : 10000,
      project(raw) {
        if (kind === "result") return raw
        if (raw.status !== 200) throw new OrdinaryJobHttpFailure()
        return decodeTree(raw.body, row.jobId)
      }
    }
  }, options, fetchFn)
}

/** Each invocation is one bounded read, never a polling or payment loop. */
export const readOrdinaryResult = (row: unknown, options: OrdinaryReadOptions = {}, fetchFn?: typeof fetch): Promise<OrdinaryRawResult> =>
  read(row, "result", options, fetchFn)
export const readOrdinaryTree = (row: unknown, options: OrdinaryReadOptions = {}, fetchFn?: typeof fetch): Promise<TreeView> =>
  read(row, "tree", options, fetchFn)
