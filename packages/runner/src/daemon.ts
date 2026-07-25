import { Effect, Schema } from "effect"
import {
  HEARTBEAT_INTERVAL_MS,
  JobOutcome,
  PublicListing,
  SkillManifest,
  decodeHubMessage,
  assertManifestPublishable,
  NotPublishable,
  toPublicListing
} from "@arcade/core"
import { execSkill } from "./exec.ts"
import { loadSkills, type LoadedSkill } from "./skills.ts"
import type { RunnerConfig } from "./config.ts"

/**
 * Seller daemon.
 *
 * Dials OUT to the hub over a websocket and pulls work. No inbound ports, so this runs from
 * a laptop behind NAT — and, critically, the hub never receives anything but the PUBLIC
 * projection of each manifest plus job outputs. Prompts, entry paths, secret names and the
 * code itself stay on this machine by construction.
 */

export interface DaemonArgs {
  readonly config: RunnerConfig
  readonly skillsDir: string
}

export const startDaemon = (args: DaemonArgs) =>
  Effect.gen(function* () {
    const skills = yield* loadSkills(args.skillsDir)
    if (skills.length === 0) {
      return yield* Effect.fail(new Error(`no skills found in ${args.skillsDir}`))
    }

    const byId = new Map<string, LoadedSkill>(skills.map((s) => [s.manifest.id, s]))
    // The second of the two routes to the hub. `arcade publish` gates the interactive
    // path; this gates the automatic one, so a seat-backed skill sitting in the skills
    // directory cannot be announced just because the daemon started.
    const sellable = skills.filter((s) => {
      try {
        assertManifestPublishable(s.manifest)
        return true
      } catch (e) {
        if (e instanceof NotPublishable) {
          console.error(`skipping ${e.skillId}: ${e.credential} credential is not sellable`)
          console.error(`  ${e.reason.split("\n")[0]}`)
          return false
        }
        throw e
      }
    })
    const listings: Array<PublicListing> = sellable.map((s) => toPublicListing(s.manifest))

    console.log(`[runner] ${args.config.runnerId}`)
    for (const s of skills) {
      console.log(`  ${s.manifest.id}@${s.manifest.version}  ${s.manifest.price}  (${s.manifest.engine.adapter})`)
    }

    yield* Effect.async<never, Error>((resume) => {
      let activeJobs = 0
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let closed = false

      const connect = () => {
        const ws = new WebSocket(args.config.hubWsUrl)

        ws.addEventListener("open", () => {
          console.log(`[runner] connected to ${args.config.hubWsUrl}`)
          ws.send(
            JSON.stringify({
              _tag: "Hello",
              runnerId: args.config.runnerId,
              seller: args.config.sellerAddress,
              // ONLY the public projection crosses this wire. See packages/core/manifest.ts.
              listings: listings.map((l) => Schema.encodeSync(PublicListing)(l)),
              maxConcurrency: args.config.maxConcurrency,
              agentVersion: "0.1.0"
            })
          )
          heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  _tag: "Heartbeat",
                  runnerId: args.config.runnerId,
                  atMs: Date.now(),
                  activeJobs
                })
              )
            }
          }, HEARTBEAT_INTERVAL_MS)
        })

        ws.addEventListener("message", (ev) => {
          void Effect.runPromise(
            Effect.gen(function* () {
              const msg = yield* decodeHubMessage(JSON.parse(String(ev.data)))
              if (msg._tag !== "JobAssignment") return

              const skill = byId.get(msg.skillId)
              if (skill === undefined) {
                ws.send(
                  JSON.stringify({
                    _tag: "JobResult",
                    jobId: msg.jobId,
                    outcome: {
                      status: "failed",
                      startedAtMs: Date.now(),
                      finishedAtMs: Date.now(),
                      error: "unknown skill"
                    }
                  })
                )
                return
              }

              if (activeJobs >= args.config.maxConcurrency) {
                ws.send(
                  JSON.stringify({
                    _tag: "JobResult",
                    jobId: msg.jobId,
                    outcome: {
                      status: "failed",
                      startedAtMs: Date.now(),
                      finishedAtMs: Date.now(),
                      error: "runner at capacity"
                    }
                  })
                )
                return
              }

              activeJobs++
              console.log(`[runner] job ${msg.jobId} -> ${msg.skillId}`)
              const outcome = yield* execSkill({
                manifest: skill.manifest,
                skillDir: skill.dir,
                jobId: msg.jobId,
                input: msg.input,
                onLog: (line) =>
                  ws.send(JSON.stringify({ _tag: "JobLog", jobId: msg.jobId, line, atMs: Date.now() }))
              }).pipe(
                Effect.catchAllCause(() =>
                  Effect.succeed(
                    JobOutcome.make({
                      status: "failed",
                      startedAtMs: Date.now(),
                      finishedAtMs: Date.now(),
                      error: "runner exception"
                    })
                  )
                )
              )
              activeJobs--
              console.log(`[runner] job ${msg.jobId} ${outcome.status}`)

              ws.send(
                JSON.stringify({
                  _tag: "JobResult",
                  jobId: msg.jobId,
                  outcome: Schema.encodeSync(JobOutcome)(outcome)
                })
              )
            }).pipe(Effect.catchAllCause(() => Effect.void))
          )
        })

        ws.addEventListener("close", () => {
          if (heartbeat !== undefined) clearInterval(heartbeat)
          if (closed) return
          // Exponential-ish reconnect: a laptop seller sleeps, loses wifi, moves network.
          console.log("[runner] disconnected — reconnecting in 3s")
          setTimeout(connect, 3000)
        })

        ws.addEventListener("error", () => {
          /* close handler drives reconnect */
        })
      }

      connect()

      return Effect.sync(() => {
        closed = true
        if (heartbeat !== undefined) clearInterval(heartbeat)
        resume(Effect.void as never)
      })
    })
  })

export { SkillManifest }
