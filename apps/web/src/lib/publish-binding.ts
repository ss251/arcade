import { publishOnPlatform } from "./publish-policy.ts"
import { PublishDisabled } from "./publish-preview.ts"

/** Supported production and Vite entrypoints must use this before binding. */
export const localPublishHostname = (env: Record<string, string | undefined>): "127.0.0.1" | undefined => {
  if (env["ARCADE_PUBLISH_LOCAL"] !== "1") return undefined
  if (publishOnPlatform(env)) throw new PublishDisabled()
  return "127.0.0.1"
}
export const requirePublishHost = (env: Record<string, string | undefined>, host: unknown, tls = false): void => {
  const expected = localPublishHostname(env)
  if (expected !== undefined && (host !== expected || tls)) throw new PublishDisabled()
}
