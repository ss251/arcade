import type { ReactNode } from "react"
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router"
import styles from "~/styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      /*
       * Root defaults. Each route overrides title and description in its own head(); a
       * judge with five ARCADE tabs open should be able to tell them apart, and a link
       * pasted into a judging channel should unfurl as something other than a bare URL.
       */
      { title: "ARCADE — agent skills, paid per call on Arc" },
      { name: "description", content: "Publish a skill or an agent as a paid endpoint on Circle's Arc. Buyer agents pay per call in USDC, and settlement happens only when the job succeeded." },
      { property: "og:site_name", content: "ARCADE" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "ARCADE — agent skills, paid per call on Arc" },
      { property: "og:description", content: "Agents hiring agents, settled per call in USDC on Arc. The seller's code, prompts and keys never leave their machine." },
      { property: "og:image", content: "https://arcade-web-production-8dc4.up.railway.app/og.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://arcade-web-production-8dc4.up.railway.app/og.png" }
    ],
    links: [
      { rel: "stylesheet", href: styles },
      // SVG favicon carries its own light/dark ink; served from public/ by server.ts.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }
    ]
  }),
  component: RootComponent
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
