export type AgentSession = {
  id: string
  parentID?: string
  title?: string
  time?: { busy?: number; idle?: number }
}

export type SessionMessage = {
  role?: string
  type?: string
  time?: { created?: number }
  content?: string | Array<{ type?: string; text?: string }>
  info?: { role?: string; time?: { created?: number } }
  parts?: Array<{ type?: string; text?: string }>
}

export type TeamAgent = {
  id: string
  mode: "primary" | "subagent" | "all"
  hidden?: boolean
}

export type TeamRosterEntry = { name: string; agent: string }
export type TeamDomain = { name: string; lead: string; members: string[] }
export type TeamSessionStatus = "started" | "concluded" | "interrupted"
export type TeamAssignmentStatus = "pending_ack" | "started" | "blocked" | "completed"

export type TeamAssignment = {
  id: string
  assignedByMemberId: string
  task: string
  status: TeamAssignmentStatus
  createdAt: string
  updatedAt: string
  summary?: string
}

export type TeamDocument = {
  teamRun: {
    id: string
    leadMemberId: string
    createdAt: string
    originalAgent: string
    savedTeamId?: string
  }
  teamMembers: Array<{
    id: string
    runId: string
    name: string
    acronym: string
    role: string
    session: {
      id: string
      parentSessionId?: string
      status: TeamSessionStatus
      updatedAt: string
    }
    assignment?: TeamAssignment
  }>
  domains: Array<{
    id: string
    runId: string
    name: string
    leadMemberId: string
    memberIds: string[]
  }>
}

export function teamStorageKey(mainSessionID: string) {
  return `team:${mainSessionID}`
}

export function nextAcronym(name: string, used: Set<string>) {
  const base = name.trim().split(/\s+/)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toUpperCase() || "M"
  let acronym = base
  for (let suffix = 2; used.has(acronym.toLowerCase()); suffix++) {
    acronym = `${base}${suffix}`
  }
  used.add(acronym.toLowerCase())
  return acronym
}

export function planTeamStructure(
  lead: string,
  roster: TeamRosterEntry[],
  domains: TeamDomain[],
) {
  const used = new Set<string>()
  return [
    { name: "Team Lead", role: lead, acronym: nextAcronym("Team Lead", used), parent: null },
    ...roster.map((member) => {
      const domain = domains.find((item) => item.members.some((name) =>
        name.trim().toLowerCase() === member.name.trim().toLowerCase(),
      ))
      const domainLead = domain && roster.find((entry) =>
        entry.name.trim().toLowerCase() === domain.lead.trim().toLowerCase(),
      )?.name.trim()
      return {
        name: member.name.trim(),
        role: member.agent,
        acronym: nextAcronym(member.name, used),
        parent: domainLead && domainLead.toLowerCase() !== member.name.trim().toLowerCase()
          ? domainLead
          : "Team Lead",
      }
    }),
  ]
}

function invalidTeam(reason: string): never {
  throw new Error(`Invalid persisted Orchestra team: ${reason}`)
}

// Labels are rendered into TEAM.md and bootstrap prompts, so they must stay
// on their own line; line breaks and control characters are structure, not data.
const unsafeTeamLabel = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/

export function hasUnsafeTeamLabel(value: string) {
  return unsafeTeamLabel.test(value)
}

export function teamLabel(value: string, field: string) {
  if (hasUnsafeTeamLabel(value)) {
    throw new Error(
      `Invalid ${field}: line breaks and control characters are not allowed`,
    )
  }
  return value.trim()
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) invalidTeam(`${field} is missing`)
  return value
}

export function validateTeamDocument(value: unknown): asserts value is TeamDocument {
  if (!isObject(value) || !isObject(value.teamRun) ||
    !Array.isArray(value.teamMembers) || !Array.isArray(value.domains)) {
    invalidTeam("expected teamRun, teamMembers, and domains")
  }

  const run = value.teamRun
  const runID = requiredString(run.id, "teamRun.id")
  requiredString(run.leadMemberId, "teamRun.leadMemberId")
  const originalAgent = requiredString(run.originalAgent, "teamRun.originalAgent")
  if (hasUnsafeTeamLabel(originalAgent)) {
    invalidTeam("teamRun.originalAgent has line breaks or control characters")
  }
  if (run.savedTeamId !== undefined) {
    requiredString(run.savedTeamId, "teamRun.savedTeamId")
  }
  if (!Number.isFinite(Date.parse(requiredString(run.createdAt, "teamRun.createdAt")))) {
    invalidTeam("teamRun.createdAt is not a date")
  }

  const memberIDs = new Set<string>()
  const sessionIDs = new Set<string>()
  const acronyms = new Set<string>()
  const names = new Set<string>()
  const assignmentIDs = new Set<string>()
  const membersBySession = new Map<string, TeamDocument["teamMembers"][number]>()

  for (const [index, rawMember] of value.teamMembers.entries()) {
    if (!isObject(rawMember) || !isObject(rawMember.session)) {
      invalidTeam(`teamMembers[${index}] has no embedded session`)
    }
    const member = rawMember as unknown as TeamDocument["teamMembers"][number]
    const id = requiredString(member.id, `teamMembers[${index}].id`)
    if (memberIDs.has(id)) invalidTeam(`duplicate member ID ${id}`)
    memberIDs.add(id)
    if (requiredString(member.runId, `${id}.runId`) !== runID) {
      invalidTeam(`${id} belongs to a different run`)
    }
    const name = requiredString(member.name, `${id}.name`)
    if (hasUnsafeTeamLabel(name)) {
      invalidTeam(`${id}.name has line breaks or control characters`)
    }
    const normalizedName = name.trim().toLowerCase()
    if (names.has(normalizedName)) invalidTeam(`duplicate member name ${member.name}`)
    names.add(normalizedName)
    const role = requiredString(member.role, `${id}.role`)
    if (hasUnsafeTeamLabel(role)) {
      invalidTeam(`${id}.role has line breaks or control characters`)
    }
    const acronym = requiredString(member.acronym, `${id}.acronym`)
    if (hasUnsafeTeamLabel(acronym)) {
      invalidTeam(`${id}.acronym has line breaks or control characters`)
    }
    const normalizedAcronym = acronym.toLowerCase()
    if (acronyms.has(normalizedAcronym)) invalidTeam(`duplicate acronym ${member.acronym}`)
    acronyms.add(normalizedAcronym)

    const session = member.session
    const sessionID = requiredString(session.id, `${id}.session.id`)
    if (sessionIDs.has(sessionID)) invalidTeam(`duplicate session ID ${sessionID}`)
    sessionIDs.add(sessionID)
    if (!(["started", "concluded", "interrupted"] as unknown[]).includes(session.status)) {
      invalidTeam(`${sessionID} has an invalid status`)
    }
    if (!Number.isFinite(Date.parse(requiredString(session.updatedAt, `${sessionID}.updatedAt`)))) {
      invalidTeam(`${sessionID}.updatedAt is not a date`)
    }
    if (session.parentSessionId !== undefined) {
      requiredString(session.parentSessionId, `${sessionID}.parentSessionId`)
    }
    membersBySession.set(sessionID, member)
    if (member.assignment !== undefined) {
      if (!isObject(member.assignment)) {
        invalidTeam(`${id}.assignment is malformed`)
      }
      const assignment = member.assignment
      const assignmentID = requiredString(assignment.id, `${id}.assignment.id`)
      if (assignmentIDs.has(assignmentID)) invalidTeam(`duplicate assignment ID ${assignmentID}`)
      assignmentIDs.add(assignmentID)
      requiredString(assignment.task, `${assignmentID}.task`)
      if (!( ["pending_ack", "started", "blocked", "completed"] as unknown[])
        .includes(assignment.status)) {
        invalidTeam(`${assignmentID} has an invalid status`)
      }
      for (const field of ["createdAt", "updatedAt"] as const) {
        if (!Number.isFinite(Date.parse(requiredString(assignment[field], `${assignmentID}.${field}`)))) {
          invalidTeam(`${assignmentID}.${field} is not a date`)
        }
      }
      requiredString(assignment.assignedByMemberId, `${assignmentID}.assignedByMemberId`)
      if (["blocked", "completed"].includes(assignment.status)) {
        requiredString(assignment.summary, `${assignmentID}.summary`)
      } else if (assignment.summary !== undefined) {
        invalidTeam(`${assignmentID} has a summary before a terminal status`)
      }
    }
  }

  const lead = value.teamMembers.find((member) => member.id === run.leadMemberId)
  if (!lead) invalidTeam("Team Lead member does not exist")
  const roots = value.teamMembers.filter((member) => !member.session.parentSessionId)
  if (roots.length !== 1 || roots[0].id !== run.leadMemberId) {
    invalidTeam("expected exactly one root, owned by the Team Lead")
  }

  for (const member of value.teamMembers) {
    const visited = new Set<string>()
    let current = member
    while (current.session.parentSessionId) {
      if (visited.has(current.id)) invalidTeam("member hierarchy contains a cycle")
      visited.add(current.id)
      const parent = membersBySession.get(current.session.parentSessionId)
      if (!parent) invalidTeam(`${current.id} has a parent outside the run`)
      current = parent
    }
    if (current.id !== run.leadMemberId) {
      invalidTeam(`${member.id} is not connected to the Team Lead`)
    }
  }

  for (const member of value.teamMembers) {
    if (member.assignment && !memberIDs.has(member.assignment.assignedByMemberId)) {
      invalidTeam(`${member.assignment.id} was assigned by a member outside the run`)
    }
  }

  const domainIDs = new Set<string>()
  const domainMembers = new Set<string>()
  for (const [index, rawDomain] of value.domains.entries()) {
    if (!isObject(rawDomain) || !Array.isArray(rawDomain.memberIds)) {
      invalidTeam(`domains[${index}] is malformed`)
    }
    const domain = rawDomain as unknown as TeamDocument["domains"][number]
    const id = requiredString(domain.id, `domains[${index}].id`)
    if (domainIDs.has(id)) invalidTeam(`duplicate domain ID ${id}`)
    domainIDs.add(id)
    if (requiredString(domain.runId, `${id}.runId`) !== runID) {
      invalidTeam(`${id} belongs to a different run`)
    }
    requiredString(domain.name, `${id}.name`)
    if (hasUnsafeTeamLabel(domain.name)) {
      invalidTeam(`${id}.name has line breaks or control characters`)
    }
    const leadMemberId = requiredString(domain.leadMemberId, `${id}.leadMemberId`)
    if (leadMemberId === run.leadMemberId || !memberIDs.has(leadMemberId) ||
      !domain.memberIds.includes(leadMemberId)) {
      invalidTeam(`${id} has no valid Domain Lead membership`)
    }
    const uniqueMembers = new Set<string>()
    for (const memberId of domain.memberIds) {
      requiredString(memberId, `${id}.memberIds[]`)
      if (!memberIDs.has(memberId)) invalidTeam(`${id} references a member outside the run`)
      if (uniqueMembers.has(memberId)) invalidTeam(`${id} repeats a member`)
      if (domainMembers.has(memberId)) invalidTeam(`${memberId} belongs to multiple domains`)
      uniqueMembers.add(memberId)
      domainMembers.add(memberId)
    }
  }

  for (const member of value.teamMembers) {
    const assignment = member.assignment
    if (!assignment) continue
    if (assignment.assignedByMemberId === member.id ||
      !canAssignTeamTask(value as unknown as TeamDocument, assignment.assignedByMemberId, member.id)) {
      invalidTeam(`${assignment.id} has an unauthorized assigner`)
    }
  }
}

export function canAssignTeamTask(
  team: TeamDocument,
  assignerMemberID: string,
  assigneeMemberID: string,
) {
  if (assignerMemberID === assigneeMemberID) return false
  if (assignerMemberID === team.teamRun.leadMemberId) return true
  const domain = team.domains.find((item) => item.leadMemberId === assignerMemberID)
  return domain?.memberIds.includes(assigneeMemberID) ?? false
}

export function createTeamAssignment(
  team: TeamDocument,
  assignerMemberID: string,
  assigneeMemberID: string,
  task: string,
  id: string,
  now = new Date().toISOString(),
) {
  if (!canAssignTeamTask(team, assignerMemberID, assigneeMemberID)) {
    throw new Error("This member is not authorized to assign work to that teammate")
  }
  const assignee = team.teamMembers.find((member) => member.id === assigneeMemberID)
  if (!assignee) throw new Error("Assignment target is not in the active team")
  if (assignee.assignment && ["pending_ack", "started"].includes(assignee.assignment.status)) {
    throw new Error(`${assignee.name} already has an active assignment`)
  }
  assignee.assignment = {
    id,
    assignedByMemberId: assignerMemberID,
    task: requiredString(task, "task").trim(),
    status: "pending_ack",
    createdAt: now,
    updatedAt: now,
  }
  validateTeamDocument(team)
  return assignee.assignment
}

export function acknowledgeTeamAssignment(
  team: TeamDocument,
  memberSessionID: string,
  assignmentID: string,
  status: "started" | "blocked",
  summary?: string,
  now = new Date().toISOString(),
) {
  const member = team.teamMembers.find((item) => item.session.id === memberSessionID)
  const assignment = member?.assignment
  if (!member || !assignment || assignment.id !== assignmentID ||
    assignment.status !== "pending_ack") {
    throw new Error("No matching pending assignment for this session")
  }
  if (status === "blocked") assignment.summary = requiredString(summary, "summary").trim()
  assignment.status = status
  assignment.updatedAt = now
  validateTeamDocument(team)
  return assignment
}

export function reportTeamAssignment(
  team: TeamDocument,
  memberSessionID: string,
  assignmentID: string,
  status: "completed" | "blocked",
  summary: string,
  now = new Date().toISOString(),
) {
  const member = team.teamMembers.find((item) => item.session.id === memberSessionID)
  const assignment = member?.assignment
  if (!member || !assignment || assignment.id !== assignmentID ||
    assignment.status !== "started") {
    throw new Error("No matching started assignment for this session")
  }
  assignment.status = status
  assignment.summary = requiredString(summary, "summary").trim()
  assignment.updatedAt = now
  validateTeamDocument(team)
  return { member, assignment }
}

export function applySessionExecutionEvent(
  team: TeamDocument,
  event: { type: string; data?: { sessionID?: string } },
  updatedAt = new Date().toISOString(),
) {
  const statusByEvent: Record<string, TeamSessionStatus> = {
    "session.execution.started": "started",
    "session.execution.succeeded": "concluded",
    "session.execution.failed": "interrupted",
    "session.execution.interrupted": "interrupted",
  }
  const status = statusByEvent[event.type]
  const member = team.teamMembers.find((item) => item.session.id === event.data?.sessionID)
  if (!status || !member) return false
  member.session.status = status
  member.session.updatedAt = updatedAt
  return true
}

export function validateTeamRoster(
  lead: string,
  roster: TeamRosterEntry[],
  domains: TeamDomain[],
  available: TeamAgent[],
) {
  const names = new Set<string>(["team lead"])
  const participantNames = new Set<string>()
  for (const member of roster) {
    const name = teamLabel(member.name, "participant name")
    if (!name || names.has(name.toLowerCase())) {
      throw new Error(`Missing or duplicate participant name: "${member.name}"`)
    }
    names.add(name.toLowerCase())
    participantNames.add(name.toLowerCase())
    if (!available.some((agent) => agent.id === member.agent &&
      (agent.mode === "subagent" || agent.mode === "all") && agent.hidden === false)) {
      throw new Error(`Participant role "${member.agent}" is no longer available`)
    }
  }
  if (!available.some((agent) => agent.id === lead &&
    (agent.mode === "primary" || agent.mode === "all") && agent.hidden === false)) {
    throw new Error(`Team Lead role "${lead}" is no longer available`)
  }
  const domainMembers = new Set<string>()
  for (const domain of domains) {
    const domainName = teamLabel(domain.name, "domain name")
    const lead = domain.lead.trim().toLowerCase()
    const members = domain.members.map((name) => name.trim().toLowerCase())
    if (!domainName || !participantNames.has(lead) || !members.includes(lead) ||
      members.some((name) => !participantNames.has(name)) ||
      new Set(members).size !== members.length ||
      members.some((name) => domainMembers.has(name))) {
      throw new Error(`Invalid domain assignment for "${domain.name}"`)
    }
    for (const name of members) domainMembers.add(name)
  }
}

export function canonicalApprovalPayload(input:
  | {
    operation: "activate_team"
    lead: string
    roster: TeamRosterEntry[]
    domains: TeamDomain[]
    savedTeamId?: string
    teamGuideMode?: "overwrite" | "append"
  }
  | { operation: "complete_team"; teamRunId: string }
  | { operation: "delete_agent"; childSessionId: string },
) {
  if (input.operation === "complete_team") {
    return JSON.stringify({
      operation: input.operation,
      teamRunId: input.teamRunId,
    })
  }
  if (input.operation === "delete_agent") {
    return JSON.stringify({
      operation: input.operation,
      childSessionId: input.childSessionId,
    })
  }
  // Fixed key order and trimmed values: the digest must cover exactly what the
  // plugin will apply, independent of how the model serialized the tool input.
  return JSON.stringify({
    operation: input.operation,
    lead: input.lead.trim(),
    roster: input.roster.map((member) => ({
      name: member.name.trim(),
      agent: member.agent.trim(),
    })),
    domains: input.domains.map((domain) => ({
      name: domain.name.trim(),
      lead: domain.lead.trim(),
      members: domain.members.map((member) => member.trim()),
    })),
    savedTeamId: input.savedTeamId ?? null,
    teamGuideMode: input.teamGuideMode ?? null,
  })
}

export function pageSessions<T>(page: { sessions?: T[]; data?: T[] }): T[] {
  return page.sessions ?? page.data ?? []
}

export function directChildren<T extends AgentSession>(
  sessions: T[],
  parentID: string,
): T[] {
  return sessions.filter((session) => session.parentID === parentID)
}

export function resolveChild<T extends AgentSession>(
  children: T[],
  reference: string,
): T {
  const matches = children.filter(
    (child) => child.id === reference || child.title === reference,
  )
  if (matches.length === 0) throw new Error(`No direct child agent named or keyed "${reference}"`)
  if (matches.length > 1) throw new Error(`More than one child matches "${reference}"; use its session ID`)
  return matches[0]
}

export function trackExecution(
  executions: Map<string, boolean>,
  event: { type: string; data?: { sessionID?: string } },
) {
  const sessionID = event.data?.sessionID
  if (!sessionID) return
  if (event.type === "session.execution.started") executions.set(sessionID, true)
  if ([
    "session.execution.succeeded",
    "session.execution.failed",
    "session.execution.interrupted",
  ].includes(event.type)) executions.set(sessionID, false)
}

export function sessionStatus(
  session: AgentSession,
  executions?: Map<string, boolean>,
): "busy" | "idle" | "new" {
  if (executions?.has(session.id)) return executions.get(session.id) ? "busy" : "idle"
  if (session.time?.busy && (!session.time.idle || session.time.busy > session.time.idle)) {
    return "busy"
  }
  if (session.time?.idle) return "idle"
  return "new"
}

export function summarizeMessages(messages: SessionMessage[]) {
  return messages.slice(-10).map((message) => {
    const content = message.content ?? message.parts ?? []
    return {
      role: message.role ?? message.info?.role ?? message.type ?? "unknown",
      createdAt: message.time?.created ?? message.info?.time?.created,
      text: typeof content === "string"
        ? content
        : content.filter((part) => part.type === "text").map((part) => part.text ?? "").join(""),
    }
  })
}

export function agentLabel(title?: string): string {
  const name = title?.trim() || "Agent"
  switch (name.toLowerCase()) {
    case "developer": return `🛠 **${name}**`
    case "reviewer": return `🔎 **${name}**`
    default: return `🤖 **${name}**`
  }
}
