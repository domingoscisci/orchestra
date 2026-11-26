import { expect, test } from "bun:test"
import { parseAgentFrontmatter } from "../panel/agent-frontmatter"

test("agent descriptions with colons do not block panel refresh", () => {
  const metadata = parseAgentFrontmatter([
    'description: Use the agent with this syntax: "example".',
    "mode: subagent",
  ].join("\n"))

  expect(metadata).toMatchObject({
    description: 'Use the agent with this syntax: "example".',
    mode: "subagent",
  })
})
