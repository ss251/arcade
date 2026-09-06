import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { localPublishHostname, requirePublishHost } from "./src/lib/publish-binding.ts"

export default defineConfig({
  define: { __ARCADE_NETWORK__: JSON.stringify(process.env["ARCADE_NETWORK"] ?? "arc-testnet") },
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    {
      name: "arcade-local-publish-binding",
      config(config) {
        const host = localPublishHostname(process.env)
        if (host === undefined) return
        if (config.server?.host !== undefined) requirePublishHost(process.env, config.server.host)
        if (config.preview?.host !== undefined) requirePublishHost(process.env, config.preview.host)
        return { server: { host }, preview: { host } }
      },
      configResolved(config) {
        if (localPublishHostname(process.env) === undefined) return
        requirePublishHost(process.env, config.server.host, !!config.server.https)
        requirePublishHost(process.env, config.preview.host, !!config.preview.https)
        if (config.server.middlewareMode) throw new Error("Local publishing requires the owned loopback Vite listener.")
      }
    },
    tanstackStart(),
    // React's plugin must come after Start's.
    viteReact()
  ]
})
