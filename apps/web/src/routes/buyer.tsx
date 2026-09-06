import { createFileRoute } from "@tanstack/react-router"
import { Buyer } from "../components/buyer.tsx"

// No loader or server function: browser recovery capabilities never reach SSR.
export const Route = createFileRoute("/buyer")({ component: Buyer })
