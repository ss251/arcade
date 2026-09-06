import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { SkillPage } from "~/components/skill-page.tsx"
import { loadSkillPage } from "~/lib/skill-page-data.ts"
import * as hub from "~/lib/hub.ts"

/** Validation and public projection happen before Start serializes the response. */
export const skillData = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(({ data }) => loadSkillPage(data, hub))

export const Route = createFileRoute("/skill/$name")({
  component: Skill,
  // This signal cancels the RPC, not H4's independently deadline-bounded hub reads.
  loader: ({ params, abortController }) => skillData({
    data: { name: params.name }, signal: abortController.signal
  })
})

function Skill() {
  return <SkillPage data={Route.useLoaderData()} />
}
