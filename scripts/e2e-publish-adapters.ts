#!/usr/bin/env bun
import { runPublishAdaptersEvidence } from "../packages/runner/src/publish-adapters-evidence.ts"

if (import.meta.main) {
  try { process.exitCode = await runPublishAdaptersEvidence(process.argv.slice(2)) }
  catch {
    console.error("Adapter evidence could not complete; check the local runner configuration.")
    process.exitCode = 1
  }
}
