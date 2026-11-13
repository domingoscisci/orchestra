import { describe, expect, test } from "bun:test"
import {
  agentLabel,
  acknowledgeTeamAssignment,
  applySessionExecutionEvent,
  canAssignTeamTask,
  createTeamAssignment,
  directChildren,
  nextAcronym,
  pageSessions,
  reportTeamAssignment,
  resolveChild,
  sessionStatus,
  teamStorageKey,
  trackExecution,
  summarizeMessages,
  type TeamDocument,
  validateTeamDocument,
  validateTeamRoster,
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

  test("tracks execution from started until any terminal event", () => {
    const executions = new Map<string, boolean>()
    trackExecution(executions, { type: "session.execution.started", data: { sessionID: "child" } })
    expect(sessionStatus({ id: "child" }, executions)).toBe("busy")
    for (const type of [
      "session.execution.succeeded",
      "session.execution.failed",
      "session.execution.interrupted",
    ]) {
      executions.set("child", true)
      trackExecution(executions, { type, data: { sessionID: "child" } })
      expect(sessionStatus({ id: "child" }, executions)).toBe("idle")
    }
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

describe("Orchestra team roster validation", () => {
  const agents = [
    { id: "lead", mode: "primary" as const, hidden: false },
    { id: "dev", mode: "subagent" as const, hidden: false },
    { id: "both", mode: "all" as const, hidden: false },
    { id: "hidden", mode: "subagent" as const, hidden: true },
  ]

  test("accepts a solo Team Lead and compatible participant roles", () => {
    expect(() => validateTeamRoster("lead", [], [], agents)).not.toThrow()
    expect(() => validateTeamRoster("lead", [
      { name: "Dev", agent: "dev" },
      { name: "QA", agent: "dev" },
    ], [{ name: "Quality", lead: "QA", members: ["Dev", "QA"] }], agents))
      .not.toThrow()
  })

  test("rejects duplicate names, hidden roles, and incompatible leads", () => {
    expect(() => validateTeamRoster("lead", [
      { name: "Dev", agent: "dev" },
      { name: " dev ", agent: "dev" },
    ], [], agents)).toThrow("duplicate participant name")
    expect(() => validateTeamRoster("lead", [{ name: "Dev", agent: "hidden" }], [], agents))
      .toThrow("no longer available")
    expect(() => validateTeamRoster("dev", [], [], agents)).toThrow("Team Lead role")
    expect(() => validateTeamRoster("lead", [
      { name: "Team Lead", agent: "dev" },
    ], [], agents)).toThrow("duplicate participant name")
  })

  test("rejects domain leads or members outside the roster", () => {
    expect(() => validateTeamRoster("lead", [{ name: "Dev", agent: "dev" }], [
      { name: "Build", lead: "lead", members: ["Dev"] },
    ], agents)).toThrow("Invalid domain assignment")
    expect(() => validateTeamRoster("lead", [
      { name: "Dev", agent: "dev" },
    ], [{ name: "Build", lead: "Team Lead", members: ["Team Lead"] }], agents))
      .toThrow("Invalid domain assignment")
  })

  test("requires the Domain Lead to be a unique member of one domain", () => {
    expect(() => validateTeamRoster("lead", [
      { name: "Dev", agent: "dev" },
      { name: "QA", agent: "dev" },
    ], [
      { name: "Build", lead: "Dev", members: ["Dev", "QA"] },
      { name: "Quality", lead: "QA", members: ["QA"] },
    ], agents)).toThrow("Invalid domain assignment")
    expect(() => validateTeamRoster("lead", [
      { name: "Dev", agent: "dev" },
    ], [{ name: "Build", lead: "Dev", members: [] }], agents))
      .toThrow("Invalid domain assignment")
  })
})

describe("Orchestra persistent team model", () => {
  const validTeam = (): TeamDocument => ({
    teamRun: {
      id: "run-1",
      leadMemberId: "member-lead",
      createdAt: "2026-11-13T09:00:00.000Z",
      originalAgent: "build",
    },
    teamMembers: [
      {
        id: "member-lead",
        runId: "run-1",
        name: "Team Lead",
        acronym: "TL",
        role: "lead",
        session: {
          id: "session-main",
          status: "started" as const,
          updatedAt: "2026-11-13T09:00:00.000Z",
        },
      },
      {
        id: "member-dev",
        runId: "run-1",
        name: "Developer",
        acronym: "D",
        role: "dev",
        session: {
          id: "session-dev",
          parentSessionId: "session-main",
          status: "started" as const,
          updatedAt: "2026-11-13T09:00:00.000Z",
        },
      },
      {
        id: "member-review",
        runId: "run-1",
        name: "Reviewer",
        acronym: "R",
        role: "reviewer",
        session: {
          id: "session-review",
          parentSessionId: "session-main",
          status: "started" as const,
          updatedAt: "2026-11-13T09:00:00.000Z",
        },
      },
    ],
    domains: [{
      id: "domain-dev",
      runId: "run-1",
      name: "Development",
      leadMemberId: "member-dev",
      memberIds: ["member-dev", "member-review"],
    }],
  })

  test("accepts a valid team and keys it by the main session", () => {
    expect(() => validateTeamDocument(validTeam())).not.toThrow()
    expect(teamStorageKey("session-main")).toBe("team:session-main")
  })

  test("authorizes Team Lead and Domain Lead assignment scopes", () => {
    const team = validTeam()
    expect(canAssignTeamTask(team, "member-lead", "member-dev")).toBe(true)
    expect(canAssignTeamTask(team, "member-dev", "member-review")).toBe(true)
    expect(canAssignTeamTask(team, "member-dev", "member-lead")).toBe(false)
    expect(canAssignTeamTask(team, "member-review", "member-dev")).toBe(false)
    expect(canAssignTeamTask(team, "member-lead", "member-lead")).toBe(false)
  })

  test("records assignment acknowledgment and final outcome transitions", () => {
    const team = validTeam()
    const assignment = createTeamAssignment(
      team, "member-lead", "member-dev", "Implement change", "task-1",
      "2026-11-13T09:01:00.000Z",
    )
    expect(assignment.status).toBe("pending_ack")
    expect(() => createTeamAssignment(
      team, "member-lead", "member-dev", "Second task", "task-2",
    )).toThrow("already has an active assignment")

    expect(acknowledgeTeamAssignment(
      team, "session-dev", "task-1", "started", undefined,
      "2026-11-13T09:02:00.000Z",
    )).toMatchObject({ status: "started", updatedAt: "2026-11-13T09:02:00.000Z" })
    expect(reportTeamAssignment(
      team, "session-dev", "task-1", "completed", "Implemented and tested",
      "2026-11-13T09:03:00.000Z",
    ).assignment).toMatchObject({
      status: "completed",
      summary: "Implemented and tested",
      updatedAt: "2026-11-13T09:03:00.000Z",
    })

    expect(createTeamAssignment(
      team, "member-lead", "member-dev", "Next task", "task-2",
    )).toMatchObject({ id: "task-2", status: "pending_ack" })
  })

  test("records blocked work and rejects stale or unauthorized transitions", () => {
    const team = validTeam()
    createTeamAssignment(team, "member-dev", "member-review", "Review", "task-1")
    expect(acknowledgeTeamAssignment(
      team, "session-review", "task-1", "blocked", "Missing input",
    )).toMatchObject({ status: "blocked", summary: "Missing input" })
    expect(() => reportTeamAssignment(
      team, "session-review", "task-1", "completed", "Done",
    )).toThrow("No matching started assignment")
    expect(() => createTeamAssignment(
      team, "member-review", "member-dev", "Unauthorized", "task-2",
    )).toThrow("not authorized")
    expect(() => acknowledgeTeamAssignment(
      team, "session-review", "task-1", "started",
    )).toThrow("No matching pending assignment")
  })

  test("rejects malformed assignment state and cross-team assigners", () => {
    const team = validTeam()
    createTeamAssignment(team, "member-lead", "member-dev", "Implement", "task-1")
    team.teamMembers[1].assignment!.assignedByMemberId = "outside-run"
    expect(() => validateTeamDocument(team)).toThrow("assigned by a member outside the run")

    const invalidStatus = validTeam()
    createTeamAssignment(invalidStatus, "member-lead", "member-dev", "Implement", "task-1")
    invalidStatus.teamMembers[1].assignment!.status = "unknown" as any
    expect(() => validateTeamDocument(invalidStatus)).toThrow("invalid status")
  })

  test("rejects invalid roots, missing parents, and cyclic hierarchies", () => {
    const noRoot = validTeam()
    noRoot.teamMembers[1].session.parentSessionId = undefined
    expect(() => validateTeamDocument(noRoot)).toThrow("exactly one root")

    const missingParent = validTeam()
    missingParent.teamMembers[1].session.parentSessionId = "missing"
    expect(() => validateTeamDocument(missingParent)).toThrow("parent outside the run")

    const cycle = validTeam()
    cycle.teamMembers[2].session.parentSessionId = "session-dev"
    cycle.teamMembers[1].session.parentSessionId = "session-review"
    expect(() => validateTeamDocument(cycle)).toThrow("cycle")
  })

  test("rejects duplicate sessions, acronyms, and cross-run records", () => {
    const duplicateSession = validTeam()
    duplicateSession.teamMembers[1].session.id = "session-main"
    expect(() => validateTeamDocument(duplicateSession)).toThrow("duplicate session ID")

    const duplicateAcronym = validTeam()
    duplicateAcronym.teamMembers[1].acronym = "tl"
    expect(() => validateTeamDocument(duplicateAcronym)).toThrow("duplicate acronym")

    const otherRun = validTeam()
    otherRun.teamMembers[1].runId = "run-2"
    expect(() => validateTeamDocument(otherRun)).toThrow("different run")

    const duplicateName = validTeam()
    duplicateName.teamMembers[1].name = "team lead"
    expect(() => validateTeamDocument(duplicateName)).toThrow("duplicate member name")
  })

  test("rejects domain references and membership conflicts", () => {
    const missingLead = validTeam()
    missingLead.domains[0].memberIds = []
    expect(() => validateTeamDocument(missingLead)).toThrow("Domain Lead membership")

    const teamLeadDomain = validTeam()
    teamLeadDomain.domains[0].leadMemberId = "member-lead"
    teamLeadDomain.domains[0].memberIds.push("member-lead")
    expect(() => validateTeamDocument(teamLeadDomain)).toThrow("Domain Lead membership")

    const invalidReference = validTeam()
    invalidReference.domains[0].memberIds.push("other-member")
    expect(() => validateTeamDocument(invalidReference)).toThrow("outside the run")

    const duplicateMembership = validTeam()
    duplicateMembership.domains.push({
      id: "domain-second",
      runId: "run-1",
      name: "Other",
      leadMemberId: "member-dev",
      memberIds: ["member-dev"],
    })
    expect(() => validateTeamDocument(duplicateMembership)).toThrow("multiple domains")
  })

  test("updates one session through repeated execution cycles", () => {
    const team = validTeam()
    const session = team.teamMembers[1].session
    for (const [type, status, updatedAt] of [
      ["session.execution.started", "started", "2026-11-13T09:01:00.000Z"],
      ["session.execution.succeeded", "concluded", "2026-11-13T09:02:00.000Z"],
      ["session.execution.started", "started", "2026-11-13T09:03:00.000Z"],
      ["session.execution.failed", "interrupted", "2026-11-13T09:04:00.000Z"],
    ] as const) {
      expect(applySessionExecutionEvent(
        team,
        { type, data: { sessionID: session.id } },
        updatedAt,
      )).toBe(true)
      expect(session).toMatchObject({ status, updatedAt })
    }
    expect(applySessionExecutionEvent(team, {
      type: "session.status",
      data: { sessionID: session.id },
    })).toBe(false)
    expect(applySessionExecutionEvent(team, {
      type: "session.execution.succeeded",
      data: { sessionID: "not-a-member" },
    })).toBe(false)
  })

  test("generates distinct initials and suffixes for acronym collisions", () => {
    const used = new Set<string>()
    expect(nextAcronym("Team Lead", used)).toBe("TL")
    expect(nextAcronym("Team Liaison", used)).toBe("TL2")
    expect(nextAcronym("Team Liaison", used)).toBe("TL3")
  })
})
