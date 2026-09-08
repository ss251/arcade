import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { PublishPage } from "../components/publish.tsx"
import { publishOnPlatform } from "../lib/publish-policy.ts"

// Scalar feature state only. No source paths, child, private preview or key reads.
const settings = createServerFn({ method: "GET" }).handler(() => ({
  enabled: process.env["ARCADE_PUBLISH_LOCAL"] === "1" && !publishOnPlatform(process.env)
}))
export const Route = createFileRoute("/publish")({
  head: () => ({ meta: [
    { title: "Publish a skill — ARCADE" },
    { name: "description", content: "See exactly what publishing reveals and what it does not. Your engine, prompts, entry point and keys never leave your machine." },
    { property: "og:title", content: "Publish a skill — ARCADE" },
    { property: "og:description", content: "See exactly what publishing reveals and what it does not. Your engine, prompts, entry point and keys never leave your machine." }
  ] }),
  loader: ({ abortController }) => settings({ signal: abortController.signal }),
  component: () => <PublishPage enabled={Route.useLoaderData().enabled} />,
  errorComponent: () => <PublishPage enabled={false} />
})
