import { createFileRoute } from "@tanstack/react-router"
import { Buyer } from "../components/buyer.tsx"

// No loader or server function: browser recovery capabilities never reach SSR.
export const Route = createFileRoute("/buyer")({
  head: () => ({ meta: [
    { title: "Your purchases — ARCADE" },
    { name: "description", content: "Receipts for calls you paid for, with the receipt tree for any job that hired another seller mid-run." },
    { property: "og:title", content: "Your purchases — ARCADE" },
    { property: "og:description", content: "Receipts for calls you paid for, with the receipt tree for any job that hired another seller mid-run." }
  ] }),
  component: Buyer
})
