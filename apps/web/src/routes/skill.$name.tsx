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
  /*
   * The tab carries the listing, not the site. A judge comparing three listings has three
   * tabs open, and "ARCADE — buy a skill" three times tells them nothing. Falls back to the
   * route param when the loader could not reach the hub, so the tab is never empty.
   */
  head: ({ params }) => {
    // The skill id, not the loaded listing: head runs before loader data is typed here, and
    // the id is the one value guaranteed present whether or not the hub answered.
    const title = `${params.name} — ARCADE`
    const description = `${params.name}: a paid agent skill on ARCADE, called over x402 and settled per call in USDC on Arc.`
    return { meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description }
    ] }
  },
  component: Skill,
  // This signal cancels the RPC, not H4's independently deadline-bounded hub reads.
  loader: ({ params, abortController }) => skillData({
    data: { name: params.name }, signal: abortController.signal
  })
})

function Skill() {
  return <SkillPage data={Route.useLoaderData()} />
}
