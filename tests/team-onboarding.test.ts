import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

mock.module("@opencode/plugin", () => ({
  Plugin: { define: (definition: unknown) => definition },
}))

const { default: plugin } = await import("../src/index") as unknown as {
  default: { setup: (context: unknown) => Promise<() => void> }
}

const lead = "lead"
const roster = [{ name: "Dev", agent: "developer" }, { name: "Review", agent: "developer" }]
const domains = [{ name: "Quality", lead: "Review", members: ["Dev", "Review"] }]

describe("Orchestra team setup smoke tests", () => {
  let directory: string
  let tools: Record<string, { execute: (input: any, context: any) => Promise<any> }>
  let sessions: Map<string, any>
  let storage: Map<string, unknown>
  let prompts: Map<string, string>
  let removed: string[]
  let events: string[]
  let queuedEvents: Array<{ event: any; resolve: () => void }>
  let wakeEvents: () => void
  let emit: (event: any) => Promise<void>
  let cleanup: () => void
  let failCreateAt = 0
  let failPrompt = false
  let failStorageSet = false
  let failStorageRemove = false
  let failSwitch = false
  let failRemove = new Set<string>()
  let nextID: number

  const legacyStatePath = () => join(directory, ".opencode", "orchestra", "teams", "main.json")
  const teamKey = (mainSessionID = "main") => `team:${mainSessionID}`
  const teamGuidePath = () => join(directory, "TEAM.md")
  const agentGuidePath = () => join(directory, "AGENTS.md")

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "orchestra-team-test-"))
    tools = {}
    removed = []
    events = []
    queuedEvents = []
    wakeEvents = () => undefined
    emit = (event) => new Promise((resolve) => {
      queuedEvents.push({ event, resolve })
      wakeEvents()
    })
    sessions = new Map([[
      "main", { id: "main", title: "Project", agent: "build", directory },
    ]])
    storage = new Map()
    prompts = new Map()
    failCreateAt = 0
    failPrompt = false
    failStorageSet = false
    failStorageRemove = false
    failSwitch = false
    failRemove = new Set()
    nextID = 0

    const session = {
      get: async ({ sessionID }: { sessionID: string }) => {
        const value = sessions.get(sessionID)
        if (!value) throw new Error(`Missing session ${sessionID}`)
        return { ...value }
      },
      list: async () => ({ sessions: [...sessions.values()] }),
      create: async (input: any) => {
        if (nextID + 1 === failCreateAt) throw new Error("create failed")
        const child = { ...input, id: `child-${++nextID}`, directory }
        sessions.set(child.id, child)
        events.push(`create:${child.id}`)
        return child
      },
      prompt: async ({ sessionID, text }: { sessionID: string; text: string }) => {
        events.push(`prompt:${sessionID}`)
        prompts.set(sessionID, text)
        if (failPrompt) throw new Error("prompt failed")
      },
      context: async () => [],
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
        {
          id: "lead", name: "Lead", description: "Coordinates the team.",
          mode: "primary", hidden: false,
        },
        {
          id: "developer", name: "Developer", description: "Implements changes.",
          mode: "subagent", hidden: false,
        },
        {
          id: "reviewer", name: "Reviewer", description: "Reviews changes.",
          mode: "subagent", hidden: false,
        },
      ] }),
    }

    const event = {
      subscribe: async function* ({ signal }: { signal: AbortSignal }) {
        while (!signal.aborted) {
          const item = queuedEvents.shift()
          if (!item) {
            await new Promise<void>((resolve) => {
              wakeEvents = resolve
              signal.addEventListener("abort", resolve, { once: true })
            })
            continue
          }
          yield item.event
          item.resolve()
        }
      },
    }

    cleanup = await plugin.setup({
      session,
      agent: agents,
      storage: {
        get: async (key: string) => storage.get(key),
        set: async (key: string, value: unknown) => {
          if (failStorageSet) throw new Error("storage set failed")
          storage.set(key, value)
        },
        remove: async (key: string) => {
          if (failStorageRemove) throw new Error("storage remove failed")
          storage.delete(key)
        },
      },
      event,
      location: { directory },
      tool: {
        transform: async (register: (editor: any) => void) => register({
          namespace() {},
          add(tool: any) { tools[tool.name] = tool },
        }),
      },
    })
  })

  afterEach(async () => {
    cleanup()
    wakeEvents()
    await rm(directory, { recursive: true, force: true })
  })

  const activate = (input: Record<string, unknown> = {}, sessionID = "main") =>
    tools.activate_team.execute({
      lead,
      roster,
      domains,
      approved: true,
      ...input,
    }, { sessionID })

  test("storage probe reads, writes, and removes a unique value", async () => {
    const output = await tools.storage_probe.execute({}, { sessionID: "main" })
    expect(JSON.parse(output.content)).toEqual({
      readMissing: true,
      writeAndRead: true,
      remove: true,
    })
    expect(storage.size).toBe(0)
  })

  test("storage probe saves for a later invocation and removes the value", async () => {
    expect(JSON.parse((await tools.storage_probe.execute(
      { phase: "save" }, { sessionID: "main" },
    )).content)).toEqual({ saved: true })
    expect(storage.size).toBe(1)
    expect(JSON.parse((await tools.storage_probe.execute(
      { phase: "verify" }, { sessionID: "main" },
    )).content)).toEqual({ survivedRestart: true, remove: true })
    expect(storage.size).toBe(0)
  })

  test("activates a solo Team Lead and closes it back to the original agent", async () => {
    await activate({ roster: [], domains: [] })
    expect(sessions.get("main").id).toBe("main")
    expect(sessions.get("main").agent).toBe(lead)
    expect([...sessions.keys()]).toEqual(["main"])
    expect(storage.get(teamKey())).toMatchObject({
      teamRun: { originalAgent: "build" },
      teamMembers: [{ name: "Team Lead", acronym: "TL", role: lead }],
      domains: [],
    })
    const guide = await readFile(teamGuidePath(), "utf8")
    expect(guide).toContain("# Team definition: Project")
    expect(guide).toContain("**TL — Team Lead** — Team Lead: Coordinates the team.")
    expect(guide).toContain("## Hierarchy\n\n- **TL — Team Lead** (Team Lead)")
    expect(guide).toContain("The Team Lead MUST")
    expect(guide).toContain("MUST NOT bypass the hierarchy")
    expect(guide).not.toContain("INV-B03")
    expect(await readFile(agentGuidePath(), "utf8")).toContain("TEAM.md")

    await tools.complete_team.execute({ confirmed: true }, { sessionID: "main" })
    expect(sessions.get("main").agent).toBe("build")
    expect(storage.has(teamKey())).toBe(false)
  })

  test("creates repeated roles and domains before switching the main agent", async () => {
    await activate({
      roster: [
        { name: "Dev", agent: "developer" },
        { name: "Review", agent: "reviewer" },
      ],
      domains,
    })
    const childIDs = [...sessions.keys()].filter((id) => id !== "main")
    expect(childIDs).toHaveLength(2)
    const team = storage.get(teamKey()) as any
    expect(team.domains).toHaveLength(1)
    expect(team.teamMembers.map((member: any) => member.acronym)).toEqual(["TL", "D", "R"])
    expect(team.domains[0].memberIds).toEqual([
      team.teamMembers[1].id,
      team.teamMembers[2].id,
    ])
    expect(prompts.get(childIDs[0])).toContain("MUST message only their immediate parent")
    expect(prompts.get(childIDs[0])).toContain("relay across branches through the hierarchy")
    expect(prompts.get(childIDs[0])).not.toContain("INV-B03")
    expect(prompts.get(childIDs[0])).toContain("Team roster: TL: Team Lead")
    expect(prompts.get(childIDs[0])).toContain("direct communication contacts are: TL: Team Lead")
    const guide = await readFile(teamGuidePath(), "utf8")
    expect(guide).toContain("**D — Dev** — developer: Implements changes.")
    expect(guide).toContain("**R — Review** — reviewer: Reviews changes.")
    expect(guide).toContain("  - **D — Dev** (developer)\n  - **R — Review** (reviewer)")
    expect(guide).toContain("**Quality** — lead: R (Review); members: D (Dev), R (Review)")
    expect(events.indexOf(`create:${childIDs[1]}`)).toBeLessThan(events.indexOf(`switch:${lead}`))
    expect(sessions.get("main").agent).toBe(lead)
  })

  test("creates a child session under the invoking child session", async () => {
    const parent = { id: "parent-child", parentID: "main", title: "Developer", directory }
    sessions.set(parent.id, parent)

    const output = JSON.parse((await tools.create_agent.execute({
      name: "Nested reviewer",
      prompt: "Review the implementation",
    }, { sessionID: parent.id })).content)

    expect(output).toMatchObject({ parentID: parent.id, name: "Nested reviewer" })
    expect(sessions.get(output.sessionID)).toMatchObject({
      parentID: parent.id,
      title: "Nested reviewer",
    })
    expect(events).toContain(`prompt:${output.sessionID}`)
    expect(prompts.get(output.sessionID)).toContain("When finished, report your result")
  })

  test("activates Developer and Reviewer without Domain Leads", async () => {
    await activate({
      roster: [
        { name: "Dev", agent: "developer" },
        { name: "Review", agent: "reviewer" },
      ],
      domains: [],
    })
    const state = storage.get(teamKey()) as any
    expect(state.teamMembers.slice(1).map((member: any) => member.role))
      .toEqual(["developer", "reviewer"])
    expect(state.domains).toEqual([])
  })

  test("assigns in the background and records ACK without notifying the parent", async () => {
    await activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] })
    const created = JSON.parse((await tools.assign_task.execute({
      agent: "Dev",
      task: "Implement the requested change",
    }, { sessionID: "main" })).content)

    expect(created).toMatchObject({ status: "pending_ack", assignee: "D" })
    expect(prompts.get("child-1")).toContain(created.assignmentId)
    expect(prompts.get("child-1")).toContain("tools.orchestra.acknowledge_task")
    expect(prompts.has("main")).toBe(false)
    expect((storage.get(teamKey()) as any).teamMembers[1].assignment)
      .toMatchObject({ id: created.assignmentId, status: "pending_ack" })

    await tools.acknowledge_task.execute({
      assignmentId: created.assignmentId,
      status: "started",
    }, { sessionID: "child-1" })
    expect((storage.get(teamKey()) as any).teamMembers[1].assignment.status)
      .toBe("started")
    expect(prompts.has("main")).toBe(false)

    const inspection = JSON.parse((await tools.inspect_agent.execute({
      agent: "Dev",
    }, { sessionID: "main" })).content)
    expect(inspection.assignment).toMatchObject({
      id: created.assignmentId,
      status: "started",
    })

    await tools.report_task.execute({
      assignmentId: created.assignmentId,
      outcome: "completed",
      summary: "Implemented the change; 3 tests pass.",
    }, { sessionID: "child-1" })
    expect((storage.get(teamKey()) as any).teamMembers[1].assignment)
      .toMatchObject({ status: "completed", summary: "Implemented the change; 3 tests pass." })
    expect(prompts.get("main")).toContain("Final Orchestra task report")
    expect(prompts.get("main")).toContain("Implemented the change; 3 tests pass.")
  })

  test("records and notifies an initial assignment block", async () => {
    await activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] })
    const created = JSON.parse((await tools.assign_task.execute({
      agent: "Dev",
      task: "Implement the requested change",
    }, { sessionID: "main" })).content)

    await tools.acknowledge_task.execute({
      assignmentId: created.assignmentId,
      status: "blocked",
      summary: "Missing required input",
    }, { sessionID: "child-1" })
    expect((storage.get(teamKey()) as any).teamMembers[1].assignment)
      .toMatchObject({ status: "blocked", summary: "Missing required input" })
    expect(prompts.get("main")).toContain("is blocked")
    expect(prompts.get("main")).toContain("Missing required input")
  })

  test("rolls back a pending assignment if its prompt cannot be submitted", async () => {
    await activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] })
    failPrompt = true
    await expect(tools.assign_task.execute({
      agent: "Dev",
      task: "Do not start if dispatch fails",
    }, { sessionID: "main" })).rejects.toThrow("prompt failed")
    expect((storage.get(teamKey()) as any).teamMembers[1].assignment).toBeUndefined()
  })

  test("enforces assignment authority, busy state, and fixed roster", async () => {
    await activate({
      roster: [
        { name: "Dev", agent: "developer" },
        { name: "Review", agent: "reviewer" },
      ],
      domains,
    })
    sessions.set("child-1", { ...sessions.get("child-1"), time: { busy: 20 } })
    await expect(tools.assign_task.execute({
      agent: "Dev",
      task: "Do not queue while busy",
    }, { sessionID: "main" })).rejects.toThrow("already working")
    expect((storage.get(teamKey()) as any).teamMembers[1].assignment).toBeUndefined()
    sessions.set("child-1", { id: "child-1", parentID: "main", title: "Dev", directory })
    const first = await tools.assign_task.execute({
      agent: "Dev",
      task: "First task",
    }, { sessionID: "main" })
    expect(JSON.parse(first.content).status).toBe("pending_ack")
    await expect(tools.assign_task.execute({
      agent: "Dev",
      task: "Overlapping task",
    }, { sessionID: "main" })).rejects.toThrow("already has an active assignment")
    await expect(tools.assign_task.execute({
      agent: "Review",
      task: "Unauthorized task",
    }, { sessionID: "child-1" })).rejects.toThrow("not authorized")
    await expect(tools.create_agent.execute({
      name: "Extra",
      prompt: "Do more work",
    }, { sessionID: "main" })).rejects.toThrow("roster is fixed")
    await expect(tools.delete_agent.execute({ agent: "Dev" }, { sessionID: "main" }))
      .rejects.toThrow("roster is fixed")
  })

  test("allows a Domain Lead to assign work only within its domain", async () => {
    await activate({
      roster: [
        { name: "Dev", agent: "developer" },
        { name: "Review", agent: "reviewer" },
      ],
      domains,
    })
    const result = await tools.assign_task.execute({
      agent: "Dev",
      task: "Domain work",
    }, { sessionID: "child-2" })
    expect(JSON.parse(result.content)).toMatchObject({ status: "pending_ack" })
  })

  test("labels send_message as a transport receipt, not recipient acknowledgment", async () => {
    await activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] })
    const output = await tools.send_message.execute({
      to: "Dev",
      message: "Implement the requested change",
    }, { sessionID: "main" })

    expect(output.content).toContain("transport receipt only")
    expect(output.content).toContain("not confirmation")
    expect(prompts.get("child-1")).toContain("Implement the requested change")
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

  test("failed activation removes the new state and restores the original agent", async () => {
    failSwitch = true

    await expect(activate()).rejects.toThrow("switch failed")
    expect(storage.has(teamKey())).toBe(false)
    expect(sessions.get("main").agent).toBe("build")
    expect([...sessions.keys()]).toEqual(["main"])
    await expect(readFile(teamGuidePath(), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(agentGuidePath(), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" })
  })

  test("restores existing guides if activation fails after the chosen overwrite", async () => {
    await writeFile(teamGuidePath(), "Keep original team content\n")
    await writeFile(agentGuidePath(), "Keep original agent instructions\n")
    failSwitch = true

    await expect(activate({
      roster: [],
      domains: [],
      teamGuideMode: "overwrite",
    })).rejects.toThrow("switch failed")

    expect(await readFile(teamGuidePath(), "utf8")).toBe("Keep original team content\n")
    expect(await readFile(agentGuidePath(), "utf8"))
      .toBe("Keep original agent instructions\n")
  })

  test("does not replace an active immutable team", async () => {
    await activate({ roster: [{ name: "Old", agent: "developer" }], domains: [] })
    const before = structuredClone(storage.get(teamKey()))
    const childIDs = [...sessions.keys()].filter((id) => id !== "main")

    await expect(activate({ roster: [{ name: "New", agent: "reviewer" }], domains: [] }))
      .rejects.toThrow("already active")
    expect(storage.get(teamKey())).toEqual(before)
    expect([...sessions.keys()].filter((id) => id !== "main")).toEqual(childIDs)
  })

  test("asks before changing an existing TEAM.md and makes no session changes", async () => {
    await writeFile(teamGuidePath(), "User's existing team guide\n")
    await expect(activate({ roster: [], domains: [] }))
      .rejects.toThrow("Ask whether to overwrite it (recommended) or append")
    expect([...sessions.keys()]).toEqual(["main"])
    expect(storage.has(teamKey())).toBe(false)
    expect(await readFile(teamGuidePath(), "utf8")).toBe("User's existing team guide\n")
  })

  test("overwrites TEAM.md by choice and appends to an existing AGENTS.md", async () => {
    await writeFile(teamGuidePath(), "Old team instructions\n")
    await writeFile(agentGuidePath(), "# Project instructions\n\nKeep this text.\n")
    await activate({ roster: [], domains: [], teamGuideMode: "overwrite" })

    expect(await readFile(teamGuidePath(), "utf8")).toContain("# Team definition: Project")
    expect(await readFile(teamGuidePath(), "utf8")).not.toContain("Old team instructions")
    const agents = await readFile(agentGuidePath(), "utf8")
    expect(agents).toContain("Keep this text.")
    expect(agents).toContain("<!-- Orchestra team guidance -->")
  })

  test("appends TEAM.md by choice and does not duplicate existing AGENTS guidance", async () => {
    await writeFile(teamGuidePath(), "# Existing Team Guide\n\nKeep it.\n")
    await writeFile(agentGuidePath(),
      "# Existing instructions\n\n<!-- Orchestra team guidance -->\nAlready linked.\n")
    const originalAgents = await readFile(agentGuidePath(), "utf8")
    await activate({ roster: [], domains: [], teamGuideMode: "append" })

    const team = await readFile(teamGuidePath(), "utf8")
    expect(team).toContain("Keep it.")
    expect(team).toContain("---\n\n# Team definition: Project")
    expect(await readFile(agentGuidePath(), "utf8")).toBe(originalAgents)
  })

  test("serializes concurrent activation attempts for one main session", async () => {
    const outcomes = await Promise.allSettled([
      activate({ roster: [{ name: "First", agent: "developer" }], domains: [] }),
      activate({ roster: [{ name: "Second", agent: "reviewer" }], domains: [] }),
    ])
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1)
    expect(storage.has(teamKey())).toBe(true)
    expect([...sessions.keys()].filter((id) => id !== "main")).toHaveLength(1)
  })

  test("storage write failure removes new child sessions without switching the lead", async () => {
    failStorageSet = true
    await expect(activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] }))
      .rejects.toThrow("storage set failed")
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
    expect(storage.get(teamKey())).toMatchObject({ teamRun: { originalAgent: "build" } })

    failSwitch = false
    await tools.complete_team.execute({ confirmed: true }, { sessionID: "main" })
    expect(sessions.get("main").agent).toBe("build")
    expect(storage.has(teamKey())).toBe(false)
  })

  test("a storage removal failure keeps the restored team state for retry", async () => {
    await activate({ roster: [], domains: [] })
    failStorageRemove = true
    await expect(tools.complete_team.execute({ confirmed: true }, { sessionID: "main" }))
      .rejects.toThrow("storage remove failed")
    expect(sessions.get("main").agent).toBe("build")
    expect(storage.has(teamKey())).toBe(true)

    failStorageRemove = false
    await tools.complete_team.execute({ confirmed: true }, { sessionID: "main" })
    expect(storage.has(teamKey())).toBe(false)
  })

  test("does not migrate the legacy JSON onboarding state", async () => {
    await mkdir(join(directory, ".opencode", "orchestra", "teams"), { recursive: true })
    await writeFile(legacyStatePath(), JSON.stringify({
      originalAgent: "build",
      lead,
      roster: [{ name: "Legacy", agent: "developer", sessionID: "legacy-child" }],
      domains: [],
    }))

    await activate({ roster: [], domains: [] })
    expect((storage.get(teamKey()) as any).teamMembers[0].name).toBe("Team Lead")
    expect(JSON.parse(await readFile(legacyStatePath(), "utf8")).roster[0].name)
      .toBe("Legacy")
  })

  test("keys state separately for distinct main sessions", async () => {
    sessions.set("main-2", { id: "main-2", title: "Project Two", agent: "build", directory })
    await activate({ roster: [], domains: [] })
    await activate({ roster: [], domains: [], teamGuideMode: "append" }, "main-2")
    expect(storage.has(teamKey())).toBe(true)
    expect(storage.has(teamKey("main-2"))).toBe(true)
    expect((storage.get(teamKey()) as any).teamRun.id)
      .not.toBe((storage.get(teamKey("main-2")) as any).teamRun.id)
  })

  test("persists repeated execution status updates for one child session", async () => {
    await activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] })
    const childID = [...sessions.keys()].find((id) => id !== "main")!
    const transitions = [
      ["session.execution.started", "started"],
      ["session.execution.succeeded", "concluded"],
      ["session.execution.started", "started"],
      ["session.execution.failed", "interrupted"],
    ] as const
    for (const [type, status] of transitions) {
      await emit({ type, data: { sessionID: childID } })
      const team = storage.get(teamKey()) as any
      expect(team.teamMembers[1].session.status).toBe(status)
      expect(Date.parse(team.teamMembers[1].session.updatedAt)).toBeGreaterThan(0)
    }
  })

  test("serializes overlapping execution events for the same team", async () => {
    await activate({ roster: [{ name: "Dev", agent: "developer" }], domains: [] })
    const childID = [...sessions.keys()].find((id) => id !== "main")!
    await Promise.all([
      emit({ type: "session.execution.started", data: { sessionID: childID } }),
      emit({ type: "session.execution.succeeded", data: { sessionID: childID } }),
    ])
    const team = storage.get(teamKey()) as any
    expect(team.teamMembers[1].session.status).toBe("concluded")
  })

  test("documents the status meaning and operating/validation boundary", async () => {
    await activate({ roster: [], domains: [] })
    const [teamGuide, agentsGuide, commandGuide, model] = await Promise.all([
      readFile(teamGuidePath(), "utf8"),
      readFile(agentGuidePath(), "utf8"),
      readFile(new URL("../src/commands/team.md", import.meta.url), "utf8"),
      readFile(new URL("../_docs/model/team-data-model.md", import.meta.url), "utf8"),
    ])
    expect(teamGuide).toContain("## Rules")
    expect(teamGuide).toContain("MUST NOT")
    expect(teamGuide).toContain("MUST run in the background")
    expect(teamGuide).toContain("acknowledge_task")
    expect(teamGuide).toContain("report_task")
    expect(teamGuide).not.toContain("INV-B03")
    expect(agentsGuide).toContain("TEAM.md")
    expect(commandGuide).toContain("Do not expose internal invariant codes")
    expect(model).toContain("latest observed execution state")
    expect(model).toContain("last persisted status may be stale")
    expect(model).toContain("stored status alone does not")
  })

  test("rejects malformed persisted state rather than trusting it", async () => {
    storage.set(teamKey(), { teamRun: {}, teamMembers: [], domains: [] })
    await expect(tools.complete_team.execute({ confirmed: true }, { sessionID: "main" }))
      .rejects.toThrow("Invalid persisted Orchestra team")
  })
})
