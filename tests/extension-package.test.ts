import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
)

test("extension manages YAML teams and prompts the plugin to activate them", async () => {
  const contributes = packageJson.openchamber.contributes
  const panel = await readFile(new URL("../panel/main.ts", import.meta.url), "utf8")
  const service = await readFile(new URL("../service/main.ts", import.meta.url), "utf8")

  expect(contributes.opencodePlugin).toBe("plugin")
  expect(contributes.service).toEqual({
    entry: "service/main.js",
    runtime: "host",
  })
  expect(contributes.commands).toBeUndefined()
  expect(contributes.capabilities).toEqual(["files", "prompt"])
  expect(packageJson.dependencies.yaml).toBeDefined()
  expect(panel).toContain('const TEAM_FILE = ".team.yml"')
  expect(panel).toContain("parseYaml(content)")
  expect(panel).toContain("stringifyYaml(teamStore")
  expect(panel).toContain('host.prompt({ text: request, send: true })')
  expect(panel).toContain("host.serviceRequest")
  expect(panel).toContain("crypto.randomUUID()")
  expect(service).toContain('request.url?.match(/^\\/v1\\/activations\\/')
  expect(service).toContain('endpoint.hostname !== "127.0.0.1"')
  expect(panel).toContain('await walk(".opencode/agents")')
  expect(panel).toContain('data-lead-role')
  expect(panel).toContain('agentOptions("roster"')
})
