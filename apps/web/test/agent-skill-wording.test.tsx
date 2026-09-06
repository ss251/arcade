import { expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PublishPage } from "../src/components/publish.tsx"

it.each([false, true])("names the Agent Skill format without changing local publishing authority (%s)", enabled => {
  const html = renderToStaticMarkup(<PublishPage enabled={enabled} />)
  expect(html).toContain("Agent Skill (open standard)")
  expect(html).toContain('href="https://agentskills.io/specification"')
  expect(html).toContain("ARCADE manifest")
  expect(html).toContain(enabled ? "Nothing is generated, registered or started" : "This hosted/default page cannot read your files")
  expect(html.includes('id="publish-target"')).toBe(enabled)
})
