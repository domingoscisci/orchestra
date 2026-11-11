import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

mock.module("@opencode/plugin", () => ({
  Plugin: { define: (definition: unknown) => definition },
}))

const { default: plugin } = await import("../src/index") as unknown as {
  default: { setup: (context: unknown) => Promise<void> }
}

const lead = "lead"
const roster = [{ name: "Dev", agent: "developer" }, { name: "Review", agent: "developer" }]
const domains = [{ name: "Quality", lead: "Review", members: ["Dev", "Review"] }]

describe("Orchestra team setup smoke tests", () => {
  let directory: string
  let tools: Record<string, { execute: (input: any, context: any) => Promise<any> }>
  let sessions: Map<string, any>
  let removed: string[]
  let events: string[]
  let failCreateAt = 0
  let failPrompt = false
  let failStateSave = false
  let failSwitch = false
  let failRemove = new Set<string>()
  let nextID: number

  const statePath = () => join(directory, ".opencode", "orchestra", "teams", "main.json")

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "orchestra-team-test-"))
    tools = {}
    removed = []
    events = []
    sessions = new Map([[
      "main", { id: "main", agent: "build", directory },
    ]])
    failCreateAt = 0
    failPrompt = false
    failStateSave = false
    failSwitch = false
    failRemove = new Set()
    nextID = 0

    const session = {
      get: async ({ sessionID }: { sessionID: string }) => {
        const value = sessions.get(sessionID)
        if (!value) throw new Error(`Missing session ${sessionID}`)
        return { ...value }
      },
      create: async (input: any) => {
        if (nextID + 1 === failCreateAt) throw new Error("create failed")
        const child = { ...input, id: `child-${++nextID}`, directory }
        sessions.set(child.id, child)
        events.push(`create:${child.id}`)
        return child
      },
      prompt: async ({ sessionID }: { sessionID: string }) => {
        events.push(`prompt:${sessionID}`)
        if (failStateSave) await mkdir(statePath(), { recursive: true })
        if (failPrompt) throw new Error("prompt failed")
      },
      remove: async ({ sessionID }: { sessionID: string }) => {
        if (failRemove.has(sessionID)) throw new Error("remove failed")
        sessions.delete(sessionID)
        removed.push(sessionID)
      },
      switchAgent: async ({ sessionID, agent }: { sessionID: string; agent: string }) => {
        events.push(`switch:${agent}`)
        if (failSwitch) throw new Error("switch failed")
        const value = sessions.get(sessionID)
        sessions.set(sessionID, { ...value, agent })
      },
    }
    const agents = {
      list: async () => ({ data: [
        { id: "lead", name: "Lead", mode: "primary", hidden: false },
        { id: "developer", name: "Developer", mode: "subagent", hidden: false },
        { id: "reviewer", name: "Reviewer", mode: "subagent", hidden: false },
      ] }),
    }

    await plugin.setup({
      session,
      agent: agents,
      location: { directory },
      tool: {
        transform: async (register: (editor: any) => void) => register({
          namespace() {},
          add(tool: any) { tools[tool.name] = tool },
        }),
      },
    })
  })

  afterEach(async () => rm(directory, { recursive: true, force: true }))

  const activate = (input: Record<string, unknown> = {}) => tools.activate_team.execute({
    lead,
    roster,
    domains,
    approved: true,
    ...input,
  }, { sessionID: "main" })

  test("activates a solo Team Lead and closes it back to the original agent", async () => {
    await activate({ roster: [], domains: [] })
    expect(sessions.get("main").id).toBe("main")
    expect(sessions.get("main").agent).toBe(lead)
    expect([...sessions.keys()]).toEqual(["main"])
    expect(JSON.parse(await readFile(statePath(), "utf8")).originalAgent).toBe("build")

    await tools.complete_team.execute({ confirmed: true }, { sessionID: "main" })
    expect(sessions.get("main").agent).toBe("build")
    await expect(readFile(statePath(), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("creates repeated roles and domains before switching the main agent", async () => {
    await activate()
    const childIDs = [...sessions.keys()].filter((id) => id !== "main")
    expect(childIDs).toHaveLength(2)
    expect(JSON.parse(await readFile(statePath(), "utf8")).domains).toEqual(domains)
    expect(events.indexOf(`create:${childIDs[1]}`)).toBeLessThan(events.indexOf(`switch:${lead}`))
    expect(sessions.get("main").agent).toBe(lead)
  })

  test("activates Developer and Reviewer without Domain Leads", async () => {
    await activate({
      roster: [
        { name: "Dev", agent: "developer" },
        { name: "Review", agent: "reviewer" },
      ],
      domains: [],
    })
    const state = JSON.parse(await readFile(statePath(), "utf8"))
    expect(state.roster.map((member: any) => member.agent)).toEqual(["developer", "reviewer"])
    expect(state.domains).toEqual([])
  })

  test("cancellation and child creation failure leave the main session unchanged", async () => {
    await expect(activate({ approved: false })).rejects.toThrow("explicit user approval")
    expect([...sessions.keys()]).toEqual(["main"])
    expect(events).toEqual([])

    failCreateAt = 2
    await expect(activate()).rejects.toThrow("create failed")
    expect([...sessions.keys()]).toEqual(["main"])
    expect(removed).toEqual(["child-1"])
    expect(sessions.get("main").agent).toBe("build")
  })

  test("failed replacement restores the previous team and active agent", async () => {
    await activate({ roster: [{ name: "Old", agent: "developer" }], domains: [] })
    const before = await readFile(statePath(), "utf8")
    const previousChildren = [...sessions.keys()].filter((id) => id !== "main")
    failSwitch = true

    await expect(activate()).rejects.toThrow("switch failed")
    expect(await readFile(statePath(), "utf8")).toBe(before)
    expect(sessions.get("main").agent).toBe(lead)
    expect([...sessions.keys()].filter((id) => id !== "main")).toEqual(previousChildren)
  })

  test("successful replacement persists the new team and retains old session history", async () => {
    await activate({ roster: [{ name: "Old", agent: "developer" }], domains: [] })
    const oldChild = [...sessions.keys()].find((id) => id !== "main")!

    await activate({ roster: [{ name: "New", agent: "reviewer" }], domains: [] })
    const newChild = [...sessions.keys()].find((id) => id !== "main" && id !== oldChild)!
    const state = JSON.parse(await readFile(statePath(), "utf8"))
    expect(state.roster.map((member: any) => member.name)).toEqual(["New"])
    expect(sessions.has(oldChild)).toBe(true)
    expect(sessions.has(newChild)).toBe(true)
    expect(sessions.get("main").agent).toBe(lead)
  })

  test("state save failure removes new child sessions without switching the lead", async () => {
    failStateSave = true
    await expect(activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] }))
      .rejects.toThrow()
    expect([...sessions.keys()]).toEqual(["main"])
    expect(sessions.get("main").agent).toBe("build")
    expect(removed).toEqual(["child-1"])
    expect(events.some((event) => event.startsWith("switch:"))).toBe(false)
  })

  test("reports sessions that could not be removed during rollback", async () => {
    failPrompt = true
    failRemove.add("child-1")
    await expect(activate()).rejects.toThrow("rollback incomplete: child-1")
    expect(sessions.has("main")).toBe(true)
    expect(sessions.has("child-1")).toBe(true)
    expect(sessions.get("main").agent).toBe("build")
  })

  test("a failed close keeps state so closing can be retried", async () => {
    await activate({ roster: [], domains: [] })
    failSwitch = true
    await expect(tools.complete_team.execute({ confirmed: true }, { sessionID: "main" }))
      .rejects.toThrow("switch failed")
    expect(await readFile(statePath(), "utf8")).toContain('"originalAgent":"build"')

    failSwitch = false
    await tools.complete_team.execute({ confirmed: true }, { sessionID: "main" })
    expect(sessions.get("main").agent).toBe("build")
    await expect(readFile(statePath(), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("a state-file removal failure keeps the restored team state for retry", async () => {
    await activate({ roster: [], domains: [] })
    const stateDirectory = join(directory, ".opencode", "orchestra", "teams")
    await chmod(stateDirectory, 0o500)
    try {
      await expect(tools.complete_team.execute({ confirmed: true }, { sessionID: "main" }))
        .rejects.toThrow()
      expect(sessions.get("main").agent).toBe("build")
      expect(await readFile(statePath(), "utf8")).toContain('"originalAgent":"build"')
    } finally {
      await chmod(stateDirectory, 0o700)
    }

    await tools.complete_team.execute({ confirmed: true }, { sessionID: "main" })
    await expect(readFile(statePath(), "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})
