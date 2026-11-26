import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { parseAuditEvents } from "../panel/audit"

const event = {
  at: 1_800_000_000_000,
  operation: "delete_agent",
  decision: "allowed",
  resources: ["target:child-1 (Builder)"],
  sessionID: "parent-1",
  rootSessionID: "root-1",
}

test("parses bounded audit records", () => {
  expect(parseAuditEvents(JSON.stringify({ events: [event] }))).toEqual([event])
  expect(() => parseAuditEvents(JSON.stringify({
    events: Array.from({ length: 101 }, () => event),
  }))).toThrow("Invalid audit response")
})

test("rejects malformed audit data", () => {
  for (const value of [
    "{",
    JSON.stringify({ events: [{ ...event, decision: "approved" }] }),
    JSON.stringify({ events: [{ ...event, resources: ["x".repeat(4097)] }] }),
  ]) {
    expect(() => parseAuditEvents(value)).toThrow("Invalid audit response")
  }
})

test("panel exposes details and audit, not approval controls", async () => {
  const source = await readFile(new URL("../panel/main.ts", import.meta.url), "utf8")
  expect(source).toContain("data-audit")
  expect(source).toContain("Activation details")
  expect(source).not.toContain("data-approve")
  expect(source).not.toContain("data-deny")
  expect(source).not.toContain("/approvals")
})
