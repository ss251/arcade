import { Effect } from "effect"

/**
 * Runner config lives at ~/.arcade/config.json — outside the repo, so a seller's identity
 * and hub token are never at risk of being committed.
 */

export interface RunnerConfig {
  readonly runnerId: string
  readonly sellerAddress: string
  readonly hubUrl: string
  readonly hubWsUrl: string
  readonly maxConcurrency: number
}

export const configPath = (): string =>
  `${process.env["HOME"] ?? "."}/.arcade/config.json`

export const readConfig = Effect.tryPromise({
  try: async (): Promise<RunnerConfig> => {
    const file = Bun.file(configPath())
    if (!(await file.exists())) {
      throw new Error(`no config at ${configPath()} — run: arcade runner init`)
    }
    return (await file.json()) as RunnerConfig
  },
  catch: (e) => new Error(String((e as Error)?.message ?? e))
})

export const writeConfig = (cfg: RunnerConfig) =>
  Effect.tryPromise({
    try: async () => {
      await Bun.write(configPath(), `${JSON.stringify(cfg, null, 2)}\n`)
      return cfg
    },
    catch: (e) => new Error(String((e as Error)?.message ?? e))
  })

export const defaultConfig = (over: Partial<RunnerConfig> = {}): RunnerConfig => {
  const hubUrl = over.hubUrl ?? process.env["ARCADE_HUB"] ?? "http://localhost:8787"
  return {
    runnerId: over.runnerId ?? `rnr_${crypto.randomUUID().slice(0, 8)}`,
    sellerAddress: over.sellerAddress ?? process.env["ARCADE_SELLER"] ?? "",
    hubUrl,
    hubWsUrl: over.hubWsUrl ?? `${hubUrl.replace(/^http/, "ws")}/ws`,
    maxConcurrency: over.maxConcurrency ?? 2
  }
}
