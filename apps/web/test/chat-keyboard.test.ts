import { expect, it } from "vitest"
import { composerKeyAction } from "../src/components/chat.tsx"

it("sends plain Enter while preserving newlines and composition commits", () => {
  expect(composerKeyAction("first line\nsecond line", "Enter")).toBe("send")
  expect(composerKeyAction("first line", "Enter", { shift: true })).toBe("native")
  expect(composerKeyAction("入力", "Enter", { composing: true })).toBe("native")
  expect(composerKeyAction("入力", "Enter", { keyCode: 229 })).toBe("native")
})

it("keeps slash completion separate from sending a completed command", () => {
  expect(composerKeyAction("/sk", "Enter")).toHaveProperty("name", "skills")
  expect(composerKeyAction("/skills", "Enter")).toBe("send")
  expect(composerKeyAction("/buy", "Enter")).toHaveProperty("name", "buy")
  expect(composerKeyAction("/buy diff-triage", "Enter")).toBe("send")
  expect(composerKeyAction("/skills", "Enter", { shift: true })).toBe("native")
  expect(composerKeyAction("/", "ArrowDown")).toBe("next")
  expect(composerKeyAction("/", "ArrowUp")).toBe("previous")
  expect(composerKeyAction("/", "Escape")).toBe("clear")
  expect(composerKeyAction("hello", "ArrowDown")).toBe("native")
})
