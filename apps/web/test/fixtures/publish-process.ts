// Offline child fixture only. No seller executable, wallet or network.
import { writeFileSync } from "node:fs"
import { join } from "node:path"
writeFileSync(join(process.env["HOME"]!, "pid"), String(process.pid))
const mode = process.argv[3]
if (mode === "success") {
  console.log(JSON.stringify({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd() }))
} else if (mode === "nonzero") {
  console.log('{"validLooking":true}'); console.error("PRIVATE_DIAGNOSTIC"); process.exitCode = 1
} else if (mode === "oversize") {
  process.stdout.write("x".repeat(1048577))
} else if (mode === "stderr") {
  process.stderr.write("x".repeat(65537)); console.log("not a valid result")
} else if (mode === "utf8") {
  process.stdout.write(Buffer.from([0xff, 0xff]))
} else {
  process.on("SIGTERM", () => {})
  setInterval(() => {}, 100)
}
