import { describe, expect, test } from "bun:test"
import {
  agentLabel,
  directChildren,
  pageSessions,
  resolveChild,
  sessionStatus,
  summarizeMessages,
} from "../src/core"

describe("Orchestra child session lookup", () => {
  const sessions = [
    { id: "parent", title: "Lead" },
    { id: "dev-id", parentID: "parent", title: "Developer" },
    { id: "reviewer-id", parentID: "parent", title: "Reviewer" },
    { id: "nested-id", parentID: "dev-id", title: "Nested" },
  ]

  test("only returns direct children", () => {
    expect(directChildren(sessions, "parent").map((session) => session.id)).toEqual([
      "dev-id",
      "reviewer-id",
    ])
  })

  test("accepts both session-list response shapes", () => {
    expect(pageSessions({ sessions })).toEqual(sessions)
    expect(pageSessions({ data: sessions })).toEqual(sessions)
  })

  test("resolves direct children by name or ID", () => {
    const children = directChildren(sessions, "parent")
    expect(resolveChild(children, "Developer").id).toBe("dev-id")
    expect(resolveChild(children, "reviewer-id").title).toBe("Reviewer")
  })

  test("rejects names outside the parent's child sessions", () => {
    expect(() => resolveChild(directChildren(sessions, "parent"), "nested-id"))
      .toThrow("No direct child")
  })

  test("derives busy and idle from the latest session transition", () => {
    expect(sessionStatus({ id: "busy", time: { busy: 20, idle: 10 } })).toBe("busy")
    expect(sessionStatus({ id: "idle", time: { busy: 10, idle: 20 } })).toBe("idle")
    expect(sessionStatus({ id: "new" })).toBe("new")
  })

  test("reads session messages in both plugin and API shapes", () => {
    expect(summarizeMessages([
      { role: "assistant", content: "reply" },
      { type: "user", content: [{ type: "text", text: "request" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "legacy" }] },
    ])).toEqual([
      { role: "assistant", createdAt: undefined, text: "reply" },
      { role: "user", createdAt: undefined, text: "request" },
      { role: "assistant", createdAt: undefined, text: "legacy" },
    ])
  })

  test("labels Developer and Reviewer distinctly without session IDs", () => {
    expect(agentLabel("Developer")).toBe("🛠 **Developer**")
    expect(agentLabel("Reviewer")).toBe("🔎 **Reviewer**")
    expect(agentLabel(undefined)).toBe("🤖 **Agent**")
  })
})
