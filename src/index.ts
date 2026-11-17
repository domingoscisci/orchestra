import { Plugin } from "@opencode/plugin"
import { randomUUID } from "node:crypto"
import { chmod, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  agentLabel,
  applySessionExecutionEvent,
  acknowledgeTeamAssignment,
  canAssignTeamTask,
  createTeamAssignment,
  directChildren,
  pageSessions,
  planTeamStructure,
  reportTeamAssignment,
  resolveChild,
  sessionStatus,
  teamStorageKey,
  trackExecution,
  summarizeMessages,
  validateTeamDocument,
  validateTeamRoster,
  type TeamDocument,
  type TeamDomain,
  type TeamRosterEntry,
  type SessionMessage,
} from "./core"

type SessionInfo = {
  id: string
  parentID?: string
  title?: string
  directory?: string
  agent?: string
  model?: { providerID: string; id: string }
  outcome?: string
  time?: { busy?: number; idle?: number }
}

type TeamStorage = {
  get(key: string): Promise<unknown>
  set(key: string, value: TeamDocument): Promise<void>
  remove(key: string): Promise<void>
}

function teamGuide(
  activity: string,
  team: TeamDocument,
  agents: AgentInfo[],
) {
  const clean = (text?: string) =>
    (text?.trim() || "No description provided.").replace(/\s+/g, " ")
  const roleInfo = (role: string) => agents.find((agent) => agent.id === role)
  const lead = team.teamMembers.find((member) =>
    member.id === team.teamRun.leadMemberId,
  )!
  const childrenOf = (member: TeamDocument["teamMembers"][number]) =>
    team.teamMembers.filter((candidate) =>
      candidate.session.parentSessionId === member.session.id,
    )
  const hierarchy = (member: TeamDocument["teamMembers"][number], depth = 0): string[] => {
    const label = member.id === team.teamRun.leadMemberId ? "Team Lead" : member.role
    const lines = [`${"  ".repeat(depth)}- **${member.acronym} — ${member.name}** (${label})`]
    return lines.concat(...childrenOf(member).map((child) => hierarchy(child, depth + 1)))
  }
  const domains = team.domains.length
    ? team.domains.map((domain) => {
      const domainLead = team.teamMembers.find((member) =>
        member.id === domain.leadMemberId,
      )!
      const members = domain.memberIds.map((id) =>
        team.teamMembers.find((member) => member.id === id)!,
      )
      return `- **${clean(domain.name)}** — lead: ${domainLead.acronym} (${domainLead.name}); members: ${members.map((member) => `${member.acronym} (${member.name})`).join(", ")}`
    }).join("\n")
    : "- No domains defined."

  return `# Team definition: ${clean(activity)}

This team coordinates work for the current activity, **${clean(activity)}**.
Its roster, roles, domains, and reporting hierarchy are fixed for this run.

## Agents

${team.teamMembers.map((member) => {
  const definition = roleInfo(member.role)
  const title = member.id === lead.id ? "Team Lead" : member.role
  return `- **${member.acronym} — ${member.name}** — ${title}: ${clean(definition?.description)}`
}).join("\n")}

## Hierarchy

${hierarchy(lead).join("\n")}

## Domains

${domains}

## Rules

- The Team Lead MUST coordinate directly with any team member when needed.
- The Team Lead MUST report the team's final outcome in the main conversation.
- Delegated subagent work MUST run in the background so the main conversation
  remains available; retain the explicit child session ID and do not wait for
  the whole task in the foreground.
- The Team Lead MUST use assign_task for delegated work and MAY assign to any
  roster member, regardless of hierarchy level. A Domain Lead MUST use
  assign_task only for other members of its domain. Other agents MUST NOT
  assign work. Assignment authority does not change the reporting hierarchy.
  Agents MUST NOT use create_agent or delete_agent to change an active roster.
- A successful message submission confirms only that the prompt was submitted.
  It MUST NOT be treated as proof that the recipient read, accepted, or started
  the work. Assignment and message transport receipts MUST NOT be repeated to
  the user as progress updates.
- A member receiving a task MUST use acknowledge_task with started only after
  understanding the task and beginning a concrete action; otherwise it MUST
  report blocked. The initial acknowledgment MUST NOT trigger a user-facing
  message. The assignment receipt and pending_ack status MUST remain internal.
- Each member MUST have at most one active assignment. There is no automatic
  queue, timeout, retry, or reassignment; a blocked attempt requires a new
  explicit assignment with a new ID.
- An assignment MUST remain pending_ack until the member explicitly
  acknowledges it; pending assignments do not expire automatically.
- The assigned member MUST submit the final outcome and summary with report_task.
  Task reports MUST NOT be duplicated through send_message or another channel.
- The Team Lead MUST report completed work once, and MUST surface a block to the
  user only when it cannot be resolved within the team.
- A non-lead assigner MUST use the report to coordinate follow-up work and MUST
  relay only actionable updates to its parent when needed; it MUST NOT repeat
  transport receipts or duplicate the full report.
- Every other agent MUST send direct messages only to its immediate parent or
  immediate children.
- An agent communicating across hierarchy branches MUST relay the message
  through the hierarchy.
- Agents MUST NOT bypass the hierarchy by messaging members outside their
  allowed direct contacts.
- Agents MUST NOT assume the messaging tool enforces these rules; they are
  required operating rules for the team.
`
}

const agentGuideMarker = "<!-- Orchestra team guidance -->"
const agentGuide = `${agentGuideMarker}
## Orchestra team guidance

When acting as an Orchestra team member, read [TEAM.md](TEAM.md) and follow its
operating rules. Team instructions guide agents; application code separately
validates persisted structural invariants.
`

async function readOptionalText(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return undefined
    throw error
  }
}

async function writeAtomicText(path: string, content: string) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const existing = await stat(path).catch((error: { code?: string }) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    await writeFile(temporary, content, {
      flag: "wx",
      mode: existing ? existing.mode & 0o777 : 0o644,
    })
    if (existing) await chmod(temporary, existing.mode & 0o777)
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

type TeamConfig = {
  lead: { name: string; agent: string }
  roster: TeamRosterEntry[]
  domains: TeamDomain[]
}

function parseTeamConfig(text: string): TeamConfig {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(
      ".team.yml is malformed or uses unsupported YAML syntax. It must be a " +
      "JSON-compatible YAML object; fix or remove it before /team setup.",
    )
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(".team.yml must contain a JSON-compatible YAML object")
  }
  const config = value as Record<string, unknown>
  const lead = typeof config.lead === "string"
    ? { name: config.lead, agent: config.lead }
    : config.lead
  if (Object.keys(config).sort().join(",") !== "domains,lead,roster" ||
    !lead || typeof lead !== "object" || Array.isArray(lead) ||
    Object.keys(lead).sort().join(",") !== "agent,name" ||
    typeof lead.name !== "string" || !lead.name.trim() ||
    typeof lead.agent !== "string" || !lead.agent.trim() ||
    !Array.isArray(config.roster) || !Array.isArray(config.domains)) {
    throw new Error(".team.yml must contain only lead, roster, and domains")
  }
  for (const member of config.roster) {
    if (!member || typeof member !== "object" || Array.isArray(member) ||
      Object.keys(member).sort().join(",") !== "agent,name" ||
      typeof member.name !== "string" || typeof member.agent !== "string") {
      throw new Error(".team.yml contains an invalid roster entry")
    }
  }
  for (const domain of config.domains) {
    if (!domain || typeof domain !== "object" || Array.isArray(domain) ||
      Object.keys(domain).sort().join(",") !== "lead,members,name" ||
      typeof domain.name !== "string" || typeof domain.lead !== "string" ||
      !Array.isArray(domain.members) ||
      domain.members.some((member) => typeof member !== "string")) {
      throw new Error(".team.yml contains an invalid domain")
    }
  }
  return { ...config, lead } as TeamConfig
}

async function updateTeamGuides(
  directory: string,
  guide: string,
  teamMode?: "overwrite" | "append",
) {
  const teamPath = join(directory, "TEAM.md")
  const agentsPath = join(directory, "AGENTS.md")
  const [existingTeam, existingAgents] = await Promise.all([
    readOptionalText(teamPath),
    readOptionalText(agentsPath),
  ])

  if (existingTeam !== undefined && !teamMode) {
    throw new Error(
      "TEAM.md already exists. Ask whether to overwrite it (recommended) or append the Orchestra rules, then retry with teamGuideMode set to 'overwrite' or 'append'.",
    )
  }

  const updates: Array<{ path: string; previous?: string; next: string }> = []
  if (existingTeam === undefined || teamMode === "overwrite") {
    updates.push({ path: teamPath, previous: existingTeam, next: guide })
  } else if (teamMode === "append") {
    updates.push({
      path: teamPath,
      previous: existingTeam,
      next: `${existingTeam.trimEnd()}\n\n---\n\n${guide}`,
    })
  }

  if (existingAgents === undefined) {
    updates.push({ path: agentsPath, next: `# Agent Instructions\n\n${agentGuide}` })
  } else if (!existingAgents.includes(agentGuideMarker)) {
    updates.push({
      path: agentsPath,
      previous: existingAgents,
      next: `${existingAgents.trimEnd()}\n\n${agentGuide}`,
    })
  }

  const applied: typeof updates = []
  try {
    for (const update of updates) {
      await writeAtomicText(update.path, update.next)
      applied.push(update)
    }
  } catch (error) {
    const rollbackFailures: string[] = []
    for (const update of applied.reverse()) {
      try {
        if (update.previous === undefined) await unlink(update.path)
        else await writeAtomicText(update.path, update.previous)
      } catch {
        rollbackFailures.push(update.path)
      }
    }
    if (rollbackFailures.length) {
      throw new Error(`${String(error)}; document rollback incomplete: ${rollbackFailures.join(", ")}`)
    }
    throw error
  }

  return async () => {
    const rollbackFailures: string[] = []
    for (const update of applied.reverse()) {
      try {
        if (update.previous === undefined) await unlink(update.path)
        else await writeAtomicText(update.path, update.previous)
      } catch {
        rollbackFailures.push(update.path)
      }
    }
    return rollbackFailures
  }
}

type SessionAPI = {
  create(input: {
    id?: string
    parentID: string
    title: string
    agent: string
    model?: { providerID: string; id: string }
  }): Promise<SessionInfo>
  get(input: { sessionID: string }): Promise<SessionInfo>
  list(input: {
    directory: string
    limit: number
    cursor?: unknown
  }): Promise<{
    sessions?: SessionInfo[]
    data?: SessionInfo[]
    cursor?: { next?: unknown }
  }>
  prompt(input: { sessionID: string; text: string }): Promise<unknown>
  context(input: { sessionID: string }): Promise<SessionMessage[]>
  remove(input: { sessionID: string }): Promise<void>
  switchAgent(input: { sessionID: string; agent: string }): Promise<void>
}

type AgentInfo = {
  id: string
  name: string
  description?: string
  source?: string
  mode: "primary" | "subagent" | "all"
  hidden?: boolean
}

type AgentAPI = {
  list(): Promise<{ data: AgentInfo[] }>
}

async function listChildren(
  session: SessionAPI,
  directory: string,
  parentID: string,
): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = []
  const cursors = new Set<string>()
  let cursor: unknown

  do {
    const page = await session.list({ directory, limit: 100, cursor })
    sessions.push(...directChildren(pageSessions(page), parentID))
    cursor = page.cursor?.next ?? undefined
    const key = cursor === undefined ? undefined : JSON.stringify(cursor)
    if (key && cursors.has(key)) throw new Error("Session pagination repeated a cursor")
    if (key) cursors.add(key)
  } while (cursor)

  return sessions
}

async function readTeamState(
  storage: TeamStorage,
  key: string,
  mainSessionID: string,
): Promise<TeamDocument | undefined> {
  const state = await storage.get(key)
  if (state === undefined) return undefined
  validateTeamDocument(state)
  const lead = state.teamMembers.find((member) =>
    member.id === state.teamRun.leadMemberId,
  )
  if (lead?.session.id !== mainSessionID) {
    throw new Error("Persisted Orchestra team does not match its storage key")
  }
  return state
}

async function findTeamContext(
  storage: TeamStorage,
  session: SessionAPI,
  sessionInfo: SessionInfo,
): Promise<{ root: SessionInfo; team: TeamDocument; member?: TeamDocument["teamMembers"][number] } | undefined> {
  const visited = new Set<string>()
  let current: SessionInfo | undefined = sessionInfo
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (!current.parentID) {
      const team = await readTeamState(storage, teamStorageKey(current.id), current.id)
      if (!team) return undefined
      return {
        root: current,
        team,
        member: team.teamMembers.find((candidate) => candidate.session.id === sessionInfo.id),
      }
    }
    current = await session.get({ sessionID: current.parentID })
  }
  return undefined
}

function resolveTeamMember(team: TeamDocument, reference: string) {
  const normalized = reference.trim().toLowerCase()
  const idMatch = team.teamMembers.find((member) => member.id === reference.trim())
  if (idMatch) return idMatch
  const matches = team.teamMembers.filter((member) =>
    [member.name, member.acronym].some((value) =>
      value.toLowerCase() === normalized,
    ),
  )
  if (!matches.length) throw new Error(`No team member matches "${reference}"`)
  if (matches.length > 1) throw new Error(`More than one team member matches "${reference}"`)
  return matches[0]
}

async function serializeTeam<T>(
  queues: Map<string, Promise<void>>,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => next)
  queues.set(key, queued)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (queues.get(key) === queued) queues.delete(key)
  }
}

function createTeamDocument(
  current: SessionInfo,
  leadRole: string,
  originalAgent: string,
  roster: TeamRosterEntry[],
  domains: TeamDomain[],
  childSessions: SessionInfo[],
  createdAt = new Date().toISOString(),
): TeamDocument {
  const runId = randomUUID()
  const plan = planTeamStructure(leadRole, roster, domains)
  const leadMember = {
    id: randomUUID(),
    runId,
    name: "Team Lead",
    acronym: plan[0].acronym,
    role: leadRole,
    session: {
      id: current.id,
      status: "started" as const,
      updatedAt: createdAt,
    },
  }
  const members = [leadMember, ...roster.map((entry, index) => {
    const child = childSessions[index]
    const name = entry.name.trim()
    return {
      id: randomUUID(),
      runId,
      name,
      acronym: plan[index + 1].acronym,
      role: entry.agent,
      session: {
        id: child.id,
        ...(child.parentID ? { parentSessionId: child.parentID } : {}),
        status: "started" as const,
        updatedAt: createdAt,
      },
    }
  })]
  const memberIds = new Map(members.map((member) => [member.name.toLowerCase(), member.id]))

  const team: TeamDocument = {
    teamRun: {
      id: runId,
      leadMemberId: leadMember.id,
      createdAt,
      originalAgent,
    },
    teamMembers: members,
    domains: domains.map((domain) => ({
      id: randomUUID(),
      runId,
      name: domain.name.trim(),
      leadMemberId: memberIds.get(domain.lead.trim().toLowerCase())!,
      memberIds: domain.members.map((name) => memberIds.get(name.trim().toLowerCase())!),
    })),
  }
  validateTeamDocument(team)
  return team
}

async function updateTeamSessionState(
  storage: TeamStorage,
  session: SessionAPI,
  queues: Map<string, Promise<void>>,
  event: { type: string; data?: { sessionID?: string } },
) {
  if (!event.type.startsWith("session.execution.") || !event.data?.sessionID) return

  const visited = new Set<string>()
  let current: SessionInfo | undefined = await session.get({ sessionID: event.data.sessionID })
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    const key = teamStorageKey(current.id)
    const candidate = await readTeamState(storage, key, current.id)
    if (candidate?.teamMembers.some((member) => member.session.id === event.data!.sessionID)) {
      await serializeTeam(queues, key, async () => {
        const team = await readTeamState(storage, key, current!.id)
        if (team && applySessionExecutionEvent(team, event)) {
          await storage.set(key, team)
        }
      })
    }
    if (!current.parentID) return
    current = await session.get({ sessionID: current.parentID })
  }
}

function result(content: string) {
  return { content }
}

const teamSetupStyle = `
body{margin:0;padding:1rem;color:var(--foreground);font:16px system-ui,sans-serif}
main{max-width:44rem;margin:auto}.step,.muted,.hint{color:var(--muted-foreground);font-size:.82rem}
h1{font-size:1.3rem;margin:.2rem 0 .4rem}p{margin:.4rem 0 .8rem}
.card{padding:.75rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);margin:.55rem 0}
.row{display:flex;align-items:center;gap:.5rem}.row label{flex:1}
.members,.choices{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.65rem}
.member,.choice{display:flex;align-items:center;gap:.35rem;padding:.35rem .5rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--background)}
input[type=text],select{min-width:0;padding:.5rem .6rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--background);color:var(--foreground);font:inherit}
.member input[type=text]{flex:1}.field{display:grid;gap:.25rem}.icon,.button{padding:.5rem .7rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--card);color:var(--foreground);font:inherit;cursor:pointer}
.icon{width:2rem;height:2rem;padding:0;font-size:1.2rem}.primary{border-color:var(--primary);background:var(--primary);color:var(--primary-foreground);font-weight:600}
.actions{display:flex;justify-content:flex-end;margin-top:.85rem}.status{color:var(--destructive);font-size:.82rem}
.tree{margin:.4rem 0 0 .9rem;padding-left:.8rem;border-left:1px solid var(--border)}.tree .tree{margin-left:.5rem}
.role{display:block;margin-top:.12rem;color:var(--muted-foreground);font-size:.8rem}
`

type TeamSetupPageInput = {
  stage: "lead" | "agents" | "domains" | "approval"
  language: string
  copy: Record<string, string>
  lead?: string
  solo?: boolean
  leadAgents?: Array<Pick<AgentInfo, "id" | "name" | "description">>
  rosterAgents?: Array<Pick<AgentInfo, "id" | "name" | "description">>
  initialConfig?: TeamConfig
  preview?: {
    members: Array<{ name: string; role: string; acronym: string; parent: string | null }>
    domains: Array<{ name: string; lead: string; members: string[] }>
  }
  teamGuideExists?: boolean
  teamGuideMode?: "overwrite" | "append"
}

function teamSetupPage(input: TeamSetupPageInput) {
  const leadAgents = input.leadAgents ?? []
  const rosterAgents = input.rosterAgents ?? []
  if (input.stage === "lead" && !leadAgents.length) {
    throw new Error("Lead stage requires live lead agent definitions")
  }
  if (input.stage === "agents" && (!input.lead || !rosterAgents.length)) {
    throw new Error("Agents stage requires a selected lead and live roster roles")
  }
  if (input.stage === "domains" && !input.initialConfig?.roster.length) {
    throw new Error("Domains stage requires the selected non-empty roster")
  }
  if (input.stage === "approval" && input.teamGuideExists && !input.teamGuideMode) {
    throw new Error("Approval stage requires the existing TEAM.md choice")
  }
  const required = [
    "title", "step",
    ...(input.stage === "lead" ? [
      "leadLabel", "leadPlaceholder", "soloLabel", "continue",
      "selectLeadError", "leadSelected",
    ] : input.stage === "agents" ? [
      "continue", "addMember", "nameLabel", "removeMember",
      "rosterError", "rosterSelected",
    ] : input.stage === "domains" ? [
      "addDomain", "continue", "domainPlaceholder", "removeDomain",
      "domainLead", "leadPlaceholder", "leadHint", "domainError",
      "domainsSelected",
    ] : [
      "domainLead", "members", "noDomains", "guideAppend",
      "guideOverwrite", "hierarchy", "domains", "approve", "approved",
    ]),
  ]
  for (const key of required) {
    if (!input.copy[key]) throw new Error(`Missing localized setup text: ${key}`)
  }
  const text = (key: string) => {
    const value = input.copy[key]
    if (!value) throw new Error(`Missing localized setup text: ${key}`)
    return value
  }
  const esc = (value: unknown) => String(value).replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  )
  const page = (
    step: number,
    body: string,
    script: string,
    data: unknown = input,
  ) => {
    const safeJson = JSON.stringify({
      ...data as object,
      language: input.language,
      copy: input.copy,
    }).replace(/[<>&\u2028\u2029]/g, (char) =>
      `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
    )
    const description = input.copy.description
      ? `<p>${esc(input.copy.description)}</p>`
      : ""
    return `<!doctype html><html lang="${esc(input.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(text("title"))}</title><style>${teamSetupStyle}</style></head><body><main><p class="step">${esc(text("step").replace("{step}", String(step)))}</p><h1>${esc(text("title"))}</h1>${description}${body}<p class="status" id="status" aria-live="polite"></p></main><script id="data" type="application/json">${safeJson}</script><script>const d=JSON.parse(document.querySelector("#data").textContent);const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));${script}</script></body></html>`
  }

  if (input.stage === "lead") {
    const chosenLead = input.lead ?? input.initialConfig?.lead.agent ?? ""
    const selectedSolo = input.solo ?? (input.initialConfig?.roster.length === 0)
    const options = leadAgents.map((agent) =>
      `<option value="${esc(agent.id)}" ${agent.id === chosenLead ? "selected" : ""}>${esc(agent.name)}${agent.description ? ` — ${esc(agent.description)}` : ""}</option>`,
    ).join("")
    return page(1,
      `<label class="field">${esc(text("leadLabel"))}<select id="lead"><option value="">${esc(text("leadPlaceholder"))}</option>${options}</select></label><label class="choice"><input id="solo" type="checkbox" ${selectedSolo ? "checked" : ""}> ${esc(text("soloLabel"))}</label><div class="actions"><button class="button primary" id="continue">${esc(text("continue"))}</button></div>`,
      `document.querySelector("#continue").onclick=async()=>{const lead=document.querySelector("#lead").value;if(!lead){document.querySelector("#status").textContent=d.copy.selectLeadError;return}const button=document.querySelector("#continue");button.disabled=true;try{await openchamber.submit({lead,solo:document.querySelector("#solo").checked},d.copy.leadSelected)}catch{button.disabled=false}};`,
      { leadAgents, lead: chosenLead, solo: selectedSolo },
    )
  }

  if (input.stage === "agents") {
    return page(2,
      `<div id="roles"></div><div class="actions"><button class="button primary" id="continue">${esc(text("continue"))}</button></div>`,
      `const title=id=>id.replace(/([a-z\\d])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").toLocaleLowerCase().replace(/(^|\\s)(\\p{L})/gu,(_,a,b)=>a+b.toLocaleUpperCase());const state=Object.fromEntries(d.rosterAgents.map(r=>[r.id,{role:r,members:(d.initialConfig?.roster||[]).filter(m=>m.agent===r.id).map(m=>({name:m.name,custom:true}))}]));function sync(id){const a=state[id].members,n=title(id);a.forEach((m,i)=>{if(!m.custom)m.name=a.length===1?n:n+" "+(i+1)})}function draw(){const root=document.querySelector("#roles");root.innerHTML=d.rosterAgents.map(r=>{const a=state[r.id].members;return '<section class="card"><div class="row"><input type="checkbox" data-role="'+esc(r.id)+'" '+(a.length?"checked":"")+'><label><strong>'+esc(title(r.id))+'</strong><span class="role">'+esc(r.description||"")+'</span></label><button class="icon" aria-label="'+esc(d.copy.addMember)+' '+esc(title(r.id))+'" data-add="'+esc(r.id)+'" '+(a.length?"":"disabled")+'>+</button></div>'+a.map((m,i)=>'<div class="row members"><input type="text" maxlength="80" aria-label="'+esc(d.copy.nameLabel)+'" data-name="'+esc(r.id)+'" data-index="'+i+'" value="'+esc(m.name)+'"><button class="icon" aria-label="'+esc(d.copy.removeMember)+' '+esc(m.name)+'" data-remove="'+esc(r.id)+'" data-index="'+i+'">−</button></div>').join("")+'</section>'}).join("");root.querySelectorAll("[data-role]").forEach(e=>e.onchange=()=>{const a=state[e.dataset.role].members;if(e.checked){a.push({name:"",custom:false});sync(e.dataset.role)}else state[e.dataset.role].members=[];draw()});root.querySelectorAll("[data-add]").forEach(e=>e.onclick=()=>{state[e.dataset.add].members.push({name:"",custom:false});sync(e.dataset.add);draw()});root.querySelectorAll("[data-remove]").forEach(e=>e.onclick=()=>{const a=state[e.dataset.remove].members;a.splice(+e.dataset.index,1);sync(e.dataset.remove);draw()});root.querySelectorAll("[data-name]").forEach(e=>e.oninput=()=>{const m=state[e.dataset.name].members[+e.dataset.index];m.name=e.value;m.custom=true})}draw();document.querySelector("#continue").onclick=async()=>{const roster=Object.values(state).flatMap(x=>x.members.map(m=>({name:m.name.trim(),agent:x.role.id})));const names=roster.map(m=>m.name.toLowerCase());if(!roster.length||roster.some(m=>!m.name)||new Set(names).size!==names.length){document.querySelector("#status").textContent=d.copy.rosterError;return}const button=document.querySelector("#continue");button.disabled=true;try{await openchamber.submit({lead:d.lead,solo:false,roster},d.copy.rosterSelected)}catch{button.disabled=false}};`,
      { lead: input.lead, rosterAgents, initialConfig: input.initialConfig },
    )
  }

  if (input.stage === "domains") {
    return page(3,
      `<div id="domains"></div><button class="button" id="add">${esc(text("addDomain"))}</button><div class="actions"><button class="button primary" id="continue">${esc(text("continue"))}</button></div>`,
      `const people=d.initialConfig?.roster||[];let seq=0;const domains=(d.initialConfig?.domains||[]).map(x=>({id:"d"+seq++,name:x.name,members:x.members.map(n=>people.findIndex(p=>p.name.toLowerCase()===n.toLowerCase())).filter(i=>i>=0),lead:people.findIndex(p=>p.name.toLowerCase()===x.lead.toLowerCase())}));const used=()=>new Set(domains.flatMap(x=>x.members));function draw(){const root=document.querySelector("#domains");root.innerHTML=domains.map(x=>{const taken=used(),members=people.map((p,j)=>({p,j})).filter(({j})=>!taken.has(j)||x.members.includes(j));return '<section class="card"><div class="row"><input type="text" data-name="'+x.id+'" value="'+esc(x.name)+'" placeholder="'+esc(d.copy.domainPlaceholder)+'"><button class="button" data-remove="'+x.id+'">'+esc(d.copy.removeDomain)+'</button></div><div class="members">'+members.map(({p,j})=>'<label class="member"><input type="checkbox" data-member="'+x.id+'" data-id="'+j+'" '+(x.members.includes(j)?"checked":"")+'> '+esc(p.name)+'</label>').join("")+'</div><label class="field">'+esc(d.copy.domainLead)+'<select data-lead="'+x.id+'" '+(x.members.length?"":"disabled")+'><option value="">'+esc(d.copy.leadPlaceholder)+'</option>'+x.members.map(j=>'<option value="'+j+'" '+(x.lead===j?"selected":"")+'>'+esc(people[j].name)+'</option>').join("")+'</select><span class="hint">'+esc(d.copy.leadHint)+'</span></label></section>'}).join("");root.querySelectorAll("[data-name]").forEach(e=>e.oninput=()=>{domains.find(x=>x.id===e.dataset.name).name=e.value;validate()});root.querySelectorAll("[data-member]").forEach(e=>e.onchange=()=>{const x=domains.find(x=>x.id===e.dataset.member),id=+e.dataset.id;if(e.checked)x.members.push(id);else{x.members=x.members.filter(i=>i!==id);if(x.lead===id)x.lead=-1}draw();validate()});root.querySelectorAll("[data-lead]").forEach(e=>e.onchange=()=>{domains.find(x=>x.id===e.dataset.lead).lead=e.value===""?-1:+e.value;validate()});root.querySelectorAll("[data-remove]").forEach(e=>e.onclick=()=>{domains.splice(domains.findIndex(x=>x.id===e.dataset.remove),1);draw();validate()});validate()}function validate(){const bad=domains.some(x=>!x.name.trim()||!x.members.length||!x.members.includes(x.lead));document.querySelector("#continue").disabled=bad;document.querySelector("#status").textContent=bad?d.copy.domainError:""}document.querySelector("#add").onclick=()=>{domains.push({id:"d"+seq++,name:"",members:[],lead:-1});draw();document.querySelector("#domains .card:last-child [data-name]")?.focus()};document.querySelector("#continue").onclick=async()=>{if(document.querySelector("#continue").disabled)return;const value=domains.map(x=>({name:x.name.trim(),lead:people[x.lead].name,members:x.members.map(i=>people[i].name)}));const button=document.querySelector("#continue");button.disabled=true;try{await openchamber.submit({domains:value},d.copy.domainsSelected)}catch{button.disabled=false}};draw();`,
      { initialConfig: input.initialConfig },
    )
  }

  if (!input.preview) throw new Error("Approval stage requires a validated team preview")
  const preview = input.preview
  const agentName = (id: string) => {
    return id.replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .toLocaleLowerCase(input.language)
      .replace(/(^|\s)(\p{L})/gu, (_, space, letter) =>
        space + letter.toLocaleUpperCase(input.language))
  }
  type PreviewNode = typeof preview.members[number] & { children: PreviewNode[] }
  const byName = new Map<string, PreviewNode>(preview.members.map((member) =>
    [member.name.toLowerCase(), { ...member, children: [] }] as const,
  ))
  const roots: PreviewNode[] = []
  for (const member of byName.values()) {
    const parent = member.parent ? byName.get(member.parent.toLowerCase()) : undefined
    if (parent) parent.children.push(member)
    else roots.push(member)
  }
  const renderTree = (members: PreviewNode[]): string => members.map((member) =>
    `<li><strong>${esc(member.acronym)} · ${esc(member.name)}</strong><span class="role">${esc(agentName(member.role))}</span>${member.children.length ? `<ul class="tree">${renderTree(member.children)}</ul>` : ""}</li>`,
  ).join("")
  const domains = preview.domains.length
    ? `<ul>${preview.domains.map((domain) => `<li><strong>${esc(domain.name)}</strong><span class="role">${esc(text("domainLead"))}: ${esc(domain.lead)} · ${esc(text("members"))}: ${domain.members.map(esc).join(", ")}</span></li>`).join("")}</ul>`
    : `<p class="muted">${esc(text("noDomains"))}</p>`
  const guide = input.teamGuideExists
    ? `<p class="hint">TEAM.md: ${esc(text(input.teamGuideMode === "append" ? "guideAppend" : "guideOverwrite"))}.</p>`
    : ""
  return page(4,
    `<section class="card"><strong>${esc(text("hierarchy"))}</strong><ul class="tree">${renderTree(roots)}</ul></section><section class="card"><strong>${esc(text("domains"))}</strong>${domains}</section>${guide}<div class="actions"><button class="button primary" id="approve">${esc(text("approve"))}</button></div>`,
    `document.querySelector("#approve").onclick=async()=>{const button=document.querySelector("#approve");button.disabled=true;try{await openchamber.submit({approved:true,preview:d.preview},d.copy.approved)}catch{button.disabled=false}};`,
    {
      lead: input.lead,
      leadAgents: leadAgents.map(({ id, name }) => ({ id, name })),
      rosterAgents: rosterAgents.map(({ id, name }) => ({ id, name })),
      preview: input.preview,
      teamGuideExists: input.teamGuideExists ?? false,
      teamGuideMode: input.teamGuideMode,
    },
  )
}

export default Plugin.define({
  id: "orchestra",
  async setup(ctx) {
    // shortcut: plugin types omit API fields; remove this cast when they expose them.
    const session = ctx.session as unknown as SessionAPI
    const agents = (ctx as unknown as { agent: AgentAPI }).agent
    const storage = (ctx as unknown as { storage: TeamStorage }).storage
    const directory = ctx.location.directory
    const executions = new Map<string, boolean>()
    const teamQueues = new Map<string, Promise<void>>()
    const eventController = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: eventController.signal })) {
        trackExecution(executions, event)
        try {
          await updateTeamSessionState(storage, session, teamQueues, event)
        } catch (error) {
          console.error("Orchestra could not persist a session execution event", error)
        }
      }
    })().catch((error) => {
      if (!eventController.signal.aborted) {
        console.error("Orchestra session event listener stopped", error)
      }
    })

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "orchestra",
        description: "Manage team assignments and child-agent sessions",
      })

      editor.add({
        name: "storage_probe",
        description: "Verify plugin storage read, write, and delete operations.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            phase: {
              type: "string",
              enum: ["roundtrip", "save", "verify", "concurrent"],
            },
          },
          additionalProperties: false,
        },
        execute: async (raw) => {
          const { phase = "roundtrip" } = raw as {
            phase?: "roundtrip" | "save" | "verify" | "concurrent"
          }
          const key = "storage-probe:restart:v1"
          const value = { probe: "persist-across-process-restart" }
          if (phase === "save") {
            if (await ctx.storage.get(key) !== undefined) {
              throw new Error("Storage probe restart key already exists")
            }
            await ctx.storage.set(key, value)
            return result(JSON.stringify({ saved: true }))
          }

          if (phase === "verify") {
            try {
              const persisted = await ctx.storage.get(key)
              if (JSON.stringify(persisted) !== JSON.stringify(value)) {
                throw new Error("Storage probe value did not survive process restart")
              }
              await ctx.storage.remove(key)
              if (await ctx.storage.get(key) !== undefined) {
                throw new Error("Storage probe key still exists after removal")
              }
              return result(JSON.stringify({
                survivedRestart: true,
                remove: true,
              }))
            } finally {
              await ctx.storage.remove(key)
            }
          }

          if (phase === "concurrent") {
            const concurrentKey = `storage-probe:concurrent:${randomUUID()}`
            const values = Array.from({ length: 16 }, (_, writer) => ({
              writer,
              payload: String(writer).repeat(4096),
            }))
            try {
              await Promise.all(values.map((value) => ctx.storage.set(concurrentKey, value)))
              const saved = await ctx.storage.get(concurrentKey)
              if (!values.some((value) => JSON.stringify(value) === JSON.stringify(saved))) {
                throw new Error("Concurrent storage writes produced an unknown or partial value")
              }
              await ctx.storage.remove(concurrentKey)
              if (await ctx.storage.get(concurrentKey) !== undefined) {
                throw new Error("Concurrent storage probe key still exists after removal")
              }
              return result(JSON.stringify({
                writers: values.length,
                finalValueIntact: true,
                remove: true,
              }))
            } finally {
              await ctx.storage.remove(concurrentKey)
            }
          }

          const roundtripKey = `storage-probe:${randomUUID()}`
          const before = await ctx.storage.get(roundtripKey)
          if (before !== undefined) throw new Error("Storage probe key already exists")

          try {
            await ctx.storage.set(roundtripKey, value)
            const saved = await ctx.storage.get(roundtripKey)
            if (JSON.stringify(saved) !== JSON.stringify(value)) {
              throw new Error("Storage probe read-after-write mismatch")
            }
            await ctx.storage.remove(roundtripKey)
            if (await ctx.storage.get(roundtripKey) !== undefined) {
              throw new Error("Storage probe key still exists after removal")
            }
            return result(JSON.stringify({
              readMissing: true,
              writeAndRead: true,
              remove: true,
            }))
          } finally {
            await ctx.storage.remove(roundtripKey)
          }
        },
      })

      editor.add({
        name: "switch_agent",
        description: "Switch the agent used by this session for subsequent requests.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: { agent: { type: "string", minLength: 1 } },
          required: ["agent"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as { agent: string }
          await session.switchAgent({
            sessionID: toolContext.sessionID,
            agent: input.agent,
          })
          return result(`Switched this session to the ${input.agent} agent.`)
        },
      })

      editor.add({
        name: "list_agent",
        description: "List visible agent definitions usable in child sessions.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          const listed = await agents.list()
          const available = listed.data.filter(
            (agent) =>
              (agent.mode === "subagent" || agent.mode === "all") &&
              agent.hidden === false,
          )
          return result(JSON.stringify(available.map((agent) => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            ...(agent.source ? { source: agent.source } : {}),
            mode: agent.mode,
            hidden: agent.hidden,
          }))))
        },
      })

      editor.add({
        name: "list_lead",
        description: "List visible agent definitions usable in the main session.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          const listed = await agents.list()
          const available = listed.data.filter(
            (agent) =>
              (agent.mode === "primary" || agent.mode === "all") &&
              agent.hidden === false,
          )
          return result(JSON.stringify(available.map((agent) => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            ...(agent.source ? { source: agent.source } : {}),
            mode: agent.mode,
            hidden: agent.hidden,
          }))))
        },
      })

      editor.add({
        name: "save_team",
        description: "Save the active Orchestra team configuration to .team.yml.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: { overwrite: { type: "boolean" } },
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as { overwrite?: boolean }
          const current = await session.get({ sessionID: toolContext.sessionID })
          const context = await findTeamContext(storage, session, current)
          if (!context) throw new Error("There is no active Orchestra team to save")
          const { team } = context
          const lead = team.teamMembers.find((member) =>
            member.id === team.teamRun.leadMemberId,
          )!
          const listed = await agents.list()
          const byID = new Map(team.teamMembers.map((member) => [member.id, member]))
          const config: TeamConfig = {
            lead: {
              name: listed.data.find((agent) => agent.id === lead.role)?.name ?? lead.role,
              agent: lead.role,
            },
            roster: team.teamMembers.filter((member) => member.id !== lead.id)
              .map(({ name, role }) => ({ name, agent: role })),
            domains: team.domains.map((domain) => ({
              name: domain.name,
              lead: byID.get(domain.leadMemberId)!.name,
              members: domain.memberIds.map((id) => byID.get(id)!.name),
            })),
          }
          const projectDirectory = context.root.directory ?? directory
          const path = join(projectDirectory, ".team.yml")
          if (await readOptionalText(path) !== undefined && !input.overwrite) {
            throw new Error(".team.yml already exists. Confirm overwrite and retry with overwrite: true.")
          }
          await writeAtomicText(path, `${JSON.stringify(config, null, 2)}\n`)
          return result("Saved active Orchestra team configuration to .team.yml.")
        },
      })

      editor.add({
        name: "load_team",
        description: "Read and validate the project .team.yml configuration.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: { forSetup: { type: "boolean" } },
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as { forSetup?: boolean }
          const current = await session.get({ sessionID: toolContext.sessionID })
          if (await findTeamContext(storage, session, current)) {
            throw new Error("Close the active Orchestra team with /team done before loading")
          }
          const path = join(current.directory ?? directory, ".team.yml")
          const teamGuideExists =
            await readOptionalText(join(current.directory ?? directory, "TEAM.md")) !== undefined
          const text = await readOptionalText(path)
          if (text === undefined) {
            return result(JSON.stringify({ exists: false, teamGuideExists }))
          }
          const config = parseTeamConfig(text)
          const listed = await agents.list()
          config.lead.name = listed.data.find((agent) =>
            agent.id === config.lead.agent,
          )?.name ?? config.lead.name
          try {
            validateTeamRoster(config.lead.agent, config.roster, config.domains, listed.data)
          } catch (error) {
            if (!input.forSetup) throw error
            return result(JSON.stringify({
              exists: true,
              teamGuideExists,
              ...config,
              resumeError: error instanceof Error ? error.message : String(error),
            }))
          }
          return result(JSON.stringify({ exists: true, teamGuideExists, ...config }))
        },
      })

      editor.add({
        name: "team_setup_ui",
        description: "Generate one self-contained setup page. Pass language and every stage-specific copy key required by src/commands/team.md.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            stage: { type: "string", enum: ["lead", "agents", "domains", "approval"] },
            language: { type: "string", minLength: 2 },
            copy: {
              type: "object",
              description: "Localized UI strings. Required keys depend on stage; see the team_setup_ui instructions.",
              properties: {
                title: { type: "string", description: "Page title, required for every stage." },
                step: { type: "string", description: "Progress text with {step}, required for every stage." },
                description: { type: "string", description: "Optional explanatory text." },
                leadLabel: { type: "string" },
                leadPlaceholder: { type: "string" },
                soloLabel: { type: "string" },
                continue: { type: "string" },
                selectLeadError: { type: "string" },
                leadSelected: { type: "string" },
                addMember: { type: "string" },
                nameLabel: { type: "string" },
                removeMember: { type: "string" },
                rosterError: { type: "string" },
                rosterSelected: { type: "string" },
                addDomain: { type: "string" },
                domainPlaceholder: { type: "string" },
                removeDomain: { type: "string" },
                domainLead: { type: "string" },
                leadHint: { type: "string" },
                domainError: { type: "string" },
                domainsSelected: { type: "string" },
                members: { type: "string" },
                noDomains: { type: "string" },
                guideAppend: { type: "string" },
                guideOverwrite: { type: "string" },
                hierarchy: { type: "string" },
                domains: { type: "string" },
                approve: { type: "string" },
                approved: { type: "string" },
              },
              additionalProperties: { type: "string" },
            },
            lead: { type: "string", minLength: 1 },
            solo: { type: "boolean" },
            teamGuideMode: { type: "string", enum: ["overwrite", "append"] },
            leadAgents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", minLength: 1 },
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                },
                required: ["id", "name"],
                additionalProperties: false,
              },
            },
            rosterAgents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", minLength: 1 },
                  name: { type: "string", minLength: 1 },
                  description: { type: "string" },
                },
                required: ["id", "name"],
                additionalProperties: false,
              },
            },
            preview: {
              type: "object",
              properties: {
                members: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      role: { type: "string" },
                      acronym: { type: "string" },
                      parent: { anyOf: [{ type: "string" }, { type: "null" }] },
                    },
                    required: ["name", "role", "acronym", "parent"],
                    additionalProperties: true,
                  },
                },
                domains: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      lead: { type: "string" },
                      members: { type: "array", items: { type: "string" } },
                    },
                    required: ["name", "lead", "members"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["members", "domains"],
              additionalProperties: false,
            },
            initialConfig: {
              type: "object",
              properties: {
                lead: { type: "string", minLength: 1 },
                roster: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", minLength: 1, maxLength: 80 },
                      agent: { type: "string", minLength: 1 },
                    },
                    required: ["name", "agent"],
                    additionalProperties: false,
                  },
                },
                domains: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", minLength: 1 },
                      lead: { type: "string", minLength: 1 },
                      members: { type: "array", items: { type: "string", minLength: 1 } },
                    },
                    required: ["name", "lead", "members"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["lead", "roster", "domains"],
              additionalProperties: false,
            },
            teamGuideExists: { type: "boolean" },
          },
          required: ["stage", "language", "copy"],
          additionalProperties: false,
        },
        execute: async (raw) => result(teamSetupPage(raw as TeamSetupPageInput)),
      })

      editor.add({
        name: "preview_team",
        description: "Validate a proposed roster and return its exact acronyms and hierarchy before approval.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            lead: { type: "string", minLength: 1 },
            roster: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 80 },
                  agent: { type: "string", minLength: 1 },
                },
                required: ["name", "agent"],
                additionalProperties: false,
              },
            },
            domains: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  lead: { type: "string", minLength: 1 },
                  members: { type: "array", items: { type: "string", minLength: 1 } },
                },
                required: ["name", "lead", "members"],
                additionalProperties: false,
              },
            },
          },
          required: ["lead", "roster", "domains"],
          additionalProperties: false,
        },
        execute: async (raw) => {
          const input = raw as {
            lead: string
            roster: TeamRosterEntry[]
            domains: TeamDomain[]
          }
          const listed = await agents.list()
          validateTeamRoster(input.lead, input.roster, input.domains, listed.data)
          const descriptions = new Map(listed.data.map((agent) =>
            [agent.id, agent.description] as const,
          ))
          return result(JSON.stringify({
            members: planTeamStructure(input.lead, input.roster, input.domains).map((member) => ({
              ...member,
              description: descriptions.get(member.role),
            })),
            domains: input.domains,
          }))
        },
      })

      editor.add({
        name: "activate_team",
        description: "Create the explicitly approved Orchestra team; optionally save its configuration.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            lead: { type: "string", minLength: 1 },
            roster: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 80 },
                  agent: { type: "string", minLength: 1 },
                },
                required: ["name", "agent"],
                additionalProperties: false,
              },
            },
            domains: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  lead: { type: "string", minLength: 1 },
                  members: { type: "array", items: { type: "string", minLength: 1 } },
                },
                required: ["name", "lead", "members"],
                additionalProperties: false,
              },
            },
            approved: { type: "boolean" },
            teamGuideMode: { type: "string", enum: ["overwrite", "append"] },
            saveConfig: { type: "boolean" },
          },
          required: ["lead", "roster", "domains", "approved"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as {
            lead: string
            roster: TeamRosterEntry[]
            domains: TeamDomain[]
            approved: boolean
            teamGuideMode?: "overwrite" | "append"
            saveConfig?: boolean
          }
          if (!input.approved) throw new Error("Team activation requires explicit user approval")

          const mainSessionID = toolContext.sessionID
          const key = teamStorageKey(mainSessionID)
          return serializeTeam(teamQueues, key, async () => {
            const current = await session.get({ sessionID: mainSessionID })
            if (current.id !== mainSessionID) {
              throw new Error("OpenCode returned a different main session ID")
            }
            if (await readTeamState(storage, key, mainSessionID)) {
              throw new Error("An Orchestra team is already active for this session")
            }
            const listed = await agents.list()
            validateTeamRoster(input.lead, input.roster, input.domains, listed.data)

            const originalAgent = current.agent
            if (!originalAgent) throw new Error("Cannot save the current main-session agent")
            const projectDirectory = current.directory ?? directory
            const created: SessionInfo[] = []
            let stateWriteStarted = false
            let switchStarted = false
            let rollbackGuides: (() => Promise<string[]>) | undefined
            try {
              const teamPath = join(projectDirectory, "TEAM.md")
              if (await readOptionalText(teamPath) !== undefined &&
                !input.teamGuideMode) {
                throw new Error(
                  "TEAM.md already exists. Ask whether to overwrite it (recommended) or append the Orchestra rules, then retry with teamGuideMode set to 'overwrite' or 'append'.",
                )
              }

              const structure = new Map(planTeamStructure(
                input.lead,
                input.roster,
                input.domains,
              ).slice(1).map((member) => [
                member.name.toLowerCase(), member,
              ] as const))
              const createdByName = new Map<string, SessionInfo>()
              const orderedRoster = [
                ...input.roster.filter((member) => input.domains.some((domain) =>
                  domain.lead.trim().toLowerCase() === member.name.trim().toLowerCase(),
                )),
                ...input.roster.filter((member) => !input.domains.some((domain) =>
                  domain.lead.trim().toLowerCase() === member.name.trim().toLowerCase(),
                )),
              ]
              const domainByLead = new Map(input.domains.map((domain) => [
                domain.lead.trim().toLowerCase(), domain.name.trim(),
              ]))
              for (const member of orderedRoster) {
                const parentName = structure.get(member.name.trim().toLowerCase())!.parent
                const parent = parentName && parentName !== "Team Lead"
                  ? createdByName.get(parentName.toLowerCase())
                  : undefined
                const child = await session.create({
                  parentID: parent?.id ?? current.id,
                  title: domainByLead.has(member.name.trim().toLowerCase())
                    ? `${member.name.trim()} (${domainByLead.get(member.name.trim().toLowerCase())})`
                    : member.name.trim(),
                  agent: member.agent,
                })
                created.push(child)
                createdByName.set(member.name.trim().toLowerCase(), child)
              }
              const sessionsByRoster = input.roster.map((member) =>
                createdByName.get(member.name.trim().toLowerCase())!,
              )

              const team = createTeamDocument(
                current,
                input.lead,
                originalAgent,
                input.roster,
                input.domains,
                sessionsByRoster,
              )
              stateWriteStarted = true
              await storage.set(key, team)

              for (let index = 0; index < input.roster.length; index++) {
                const member = team.teamMembers[index + 1]
                const parent = team.teamMembers.find((candidate) =>
                  candidate.session.id === member.session.parentSessionId,
                )
                const children = team.teamMembers.filter((candidate) =>
                  candidate.session.parentSessionId === member.session.id,
                )
                const contacts = [...(parent ? [parent] : []), ...children]
                const rosterSummary = team.teamMembers.map((candidate) =>
                  `${candidate.acronym}: ${candidate.name} (${candidate.role})`,
                ).join(", ")
                const contactSummary = contacts.map((candidate) =>
                  `${candidate.acronym}: ${candidate.name}`,
                ).join(", ") || "none"
                const domains = input.domains.filter((domain) =>
                  domain.members.some((name) =>
                    name.trim().toLowerCase() === member.name.toLowerCase(),
                  ),
                )
                const domainLead = domains.find((domain) =>
                  domain.lead.trim().toLowerCase() !== member.name.trim().toLowerCase(),
                )?.lead
                const assignmentSources = domainLead
                  ? `the Team Lead or Domain Lead ${domainLead}`
                  : "the Team Lead"
                await session.prompt({
                  sessionID: sessionsByRoster[index].id,
                  text: `You are ${member.name} (${member.acronym}), using the ` +
                    `${member.role} role, in an Orchestra team. ` +
                    `The Team Lead may message any member; other agents MUST ` +
                    `message only their immediate parent or children and MUST ` +
                    `relay across branches through the hierarchy. Do not bypass ` +
                    `these messaging rules even if the tool allows it. The Team ` +
                    `Lead may assign to any member regardless of hierarchy; ` +
                    `Domain Leads may assign only within their domain; other ` +
                    `agents MUST NOT assign work. Wait for assignments from ` +
                    `${assignmentSources}. ` +
                    `Team roster: ${rosterSummary}. ` +
                    `Your direct communication contacts are: ${contactSummary}. ` +
                    `Your domains: ${JSON.stringify(domains)}. ` +
                    `Read TEAM.md and follow its Rules. Work only on assignments ` +
                    `sent through tools.orchestra.assign_task; acknowledge with ` +
                    `tools.orchestra.acknowledge_task and submit the final result ` +
                    `with tools.orchestra.report_task. Do not echo tool receipts ` +
                    `or acknowledgments to the user.`,
                })
              }

              rollbackGuides = await updateTeamGuides(
                projectDirectory,
                teamGuide(current.title ?? "Current activity", team, listed.data),
                input.teamGuideMode,
              )
              switchStarted = true
              await session.switchAgent({ sessionID: current.id, agent: input.lead })
              if (input.saveConfig) {
                const config: TeamConfig = {
                  lead: {
                    name: listed.data.find((agent) => agent.id === input.lead)?.name ??
                      input.lead,
                    agent: input.lead,
                  },
                  roster: input.roster.map(({ name, agent }) => ({
                    name: name.trim(), agent,
                  })),
                  domains: input.domains.map((domain) => ({
                    name: domain.name.trim(),
                    lead: domain.lead.trim(),
                    members: domain.members.map((name) => name.trim()),
                  })),
                }
                await writeAtomicText(
                  join(projectDirectory, ".team.yml"),
                  `${JSON.stringify(config, null, 2)}\n`,
                )
              }
              return result(JSON.stringify({ active: true, team }))
            } catch (error) {
              const cleanupFailures: string[] = []
              if (rollbackGuides) {
                cleanupFailures.push(...await rollbackGuides())
              }
              if (stateWriteStarted) {
                await storage.remove(key).catch(() => cleanupFailures.push("team state"))
              }
              if (switchStarted && current.agent) {
                await session.switchAgent({ sessionID: current.id, agent: current.agent })
                  .catch(() => cleanupFailures.push("original agent"))
              }
              for (const child of created.reverse()) {
                await session.remove({ sessionID: child.id })
                  .catch(() => cleanupFailures.push(child.id))
              }
              if (cleanupFailures.length) {
                throw new Error(`${String(error)}; rollback incomplete: ${cleanupFailures.join(", ")}`)
              }
              throw error
            }
          })
        },
      })

      editor.add({
        name: "complete_team",
        description: "Restore the original agent and close the active Orchestra team.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: { confirmed: { type: "boolean" } },
          required: ["confirmed"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const { confirmed } = raw as { confirmed: boolean }
          if (!confirmed) throw new Error("Team completion requires user confirmation")
          const mainSessionID = toolContext.sessionID
          const key = teamStorageKey(mainSessionID)
          return serializeTeam(teamQueues, key, async () => {
            const current = await session.get({ sessionID: mainSessionID })
            const team = await readTeamState(storage, key, mainSessionID)
            if (!team) throw new Error("There is no active Orchestra team")
            await session.switchAgent({
              sessionID: current.id,
              agent: team.teamRun.originalAgent,
            })
            await storage.remove(key)
            return result("Team closed and original agent restored.")
          })
        },
      })

      editor.add({
        name: "assign_task",
        description: "Assign work to an existing team member in the background; returns before acknowledgment or completion.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            agent: { type: "string", minLength: 1 },
            task: { type: "string", minLength: 1 },
          },
          required: ["agent", "task"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as { agent: string; task: string }
          const caller = await session.get({ sessionID: toolContext.sessionID })
          const context = await findTeamContext(storage, session, caller)
          if (!context) throw new Error("There is no active Orchestra team")
          if (!context.member) throw new Error("Only active team members can assign work")

          const key = teamStorageKey(context.root.id)
          const assignmentID = randomUUID()
          let assignee: TeamDocument["teamMembers"][number] | undefined
          let previousAssignment: TeamDocument["teamMembers"][number]["assignment"]

          await serializeTeam(teamQueues, key, async () => {
            const team = await readTeamState(storage, key, context.root.id)
            if (!team) throw new Error("There is no active Orchestra team")
            const assigner = team.teamMembers.find((member) =>
              member.session.id === caller.id,
            )
            if (!assigner) throw new Error("Only active team members can assign work")
            assignee = resolveTeamMember(team, input.agent)
            if (!canAssignTeamTask(team, assigner.id, assignee.id)) {
              throw new Error("This member is not authorized to assign work to that teammate")
            }
            const targetSession = await session.get({ sessionID: assignee.session.id })
            if (sessionStatus(targetSession, executions) === "busy") {
              throw new Error(`${assignee.name} is already working and cannot receive another assignment`)
            }

            const updated = structuredClone(team)
            const updatedAssignee = updated.teamMembers.find((member) =>
              member.id === assignee!.id,
            )!
            previousAssignment = updatedAssignee.assignment
              ? structuredClone(updatedAssignee.assignment)
              : undefined
            createTeamAssignment(updated, assigner.id, updatedAssignee.id, input.task, assignmentID)
            await storage.set(key, updated)
            assignee = updatedAssignee
          })

          try {
            await session.prompt({
              sessionID: assignee!.session.id,
              text: `New Orchestra assignment ${assignmentID}:\n${input.task}\n\n` +
                `Work in this existing session in the background. As soon as you ` +
                `understand the task and begin a concrete action, call ` +
                `tools.orchestra.acknowledge_task({assignmentId: "${assignmentID}", ` +
                `status: "started"}) through execute. If you cannot begin, use ` +
                `status: "blocked" with a concise summary. Do not send an ACK via ` +
                `send_message. When finished or blocked later, call ` +
                `tools.orchestra.report_task({assignmentId: "${assignmentID}", ` +
                `outcome: "completed" | "blocked", summary: "<result>"}) through ` +
                `execute. Do not duplicate these updates with send_message.`,
            })
          } catch (error) {
            try {
              await serializeTeam(teamQueues, key, async () => {
                const team = await readTeamState(storage, key, context.root.id)
                const target = team?.teamMembers.find((member) =>
                  member.session.id === assignee!.session.id,
                )
                if (!team || !target?.assignment || target.assignment.id !== assignmentID ||
                  target.assignment.status !== "pending_ack") return
                if (previousAssignment) target.assignment = previousAssignment
                else delete target.assignment
                await storage.set(key, team)
              })
            } catch (rollbackError) {
              throw new Error(
                `Assignment prompt failed: ${String(error)}; state rollback failed: ${String(rollbackError)}`,
              )
            }
            throw error
          }

          return result(JSON.stringify({
            assignmentId: assignmentID,
            assignee: assignee!.acronym,
            status: "pending_ack",
            note: "Prompt submitted; this is not acknowledgment or task start.",
          }))
        },
      })

      editor.add({
        name: "acknowledge_task",
        description: "Record that the assigned member has started work or is blocked; does not message the parent.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            assignmentId: { type: "string", minLength: 1 },
            status: { type: "string", enum: ["started", "blocked"] },
            summary: { type: "string", minLength: 1 },
          },
          required: ["assignmentId", "status"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as {
            assignmentId: string
            status: "started" | "blocked"
            summary?: string
          }
          const caller = await session.get({ sessionID: toolContext.sessionID })
          const context = await findTeamContext(storage, session, caller)
          if (!context?.member) throw new Error("This session is not an active team member")
          const key = teamStorageKey(context.root.id)
          let notifySessionID: string | undefined
          let assignment: TeamDocument["teamMembers"][number]["assignment"]

          await serializeTeam(teamQueues, key, async () => {
            const current = await readTeamState(storage, key, context.root.id)
            if (!current) throw new Error("There is no active Orchestra team")
            const team = structuredClone(current)
            const updated = acknowledgeTeamAssignment(
              team,
              caller.id,
              input.assignmentId,
              input.status,
              input.summary,
            )
            assignment = { ...updated }
            if (input.status === "blocked") {
              const assigner = team.teamMembers.find((member) =>
                member.id === updated.assignedByMemberId,
              )
              notifySessionID = assigner?.session.id
            }
            await storage.set(key, team)
          })

          if (notifySessionID) {
            await session.prompt({
              sessionID: notifySessionID,
              text: `Orchestra assignment ${input.assignmentId} is blocked: ` +
                `${assignment!.summary}. Resolve within the team if possible; ` +
                `surface it to the user only if it remains unresolved.`,
            })
          }
          return result(`Assignment ${input.assignmentId} recorded as ${input.status}.`)
        },
      })

      editor.add({
        name: "report_task",
        description: "Record the final outcome of a started assignment and notify its assigner once.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            assignmentId: { type: "string", minLength: 1 },
            outcome: { type: "string", enum: ["completed", "blocked"] },
            summary: { type: "string", minLength: 1 },
          },
          required: ["assignmentId", "outcome", "summary"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as {
            assignmentId: string
            outcome: "completed" | "blocked"
            summary: string
          }
          const caller = await session.get({ sessionID: toolContext.sessionID })
          const context = await findTeamContext(storage, session, caller)
          if (!context?.member) throw new Error("This session is not an active team member")
          const key = teamStorageKey(context.root.id)
          let notifySessionID: string | undefined
          let assigneeName = context.member.name

          await serializeTeam(teamQueues, key, async () => {
            const current = await readTeamState(storage, key, context.root.id)
            if (!current) throw new Error("There is no active Orchestra team")
            const team = structuredClone(current)
            const { member, assignment } = reportTeamAssignment(
              team,
              caller.id,
              input.assignmentId,
              input.outcome,
              input.summary,
            )
            assigneeName = member.name
            const assigner = team.teamMembers.find((item) =>
              item.id === assignment.assignedByMemberId,
            )
            notifySessionID = assigner?.session.id
            await storage.set(key, team)
          })

          if (!notifySessionID) throw new Error("Assignment was recorded but its assigner session is missing")
          await session.prompt({
            sessionID: notifySessionID,
            text: `Final Orchestra task report ${input.assignmentId} from ${assigneeName} ` +
              `(${input.outcome}):\n${input.summary}\n\nThis is the authoritative ` +
              `assignment report; do not request a duplicate report through send_message.`,
          })
          return result(`Assignment ${input.assignmentId} report recorded.`)
        },
      })

      editor.add({
        name: "create_agent",
        description: "Create a child session and submit a task in the background; returns without waiting for completion.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            id: { type: "string", minLength: 1 },
            agent: { type: "string", minLength: 1 },
            model: {
              type: "object",
              properties: {
                providerID: { type: "string", minLength: 1 },
                id: { type: "string", minLength: 1 },
              },
              required: ["providerID", "id"],
              additionalProperties: false,
            },
            prompt: { type: "string", minLength: 1 },
          },
          required: ["name", "prompt"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as {
            name: string
            id?: string
            agent?: string
            model?: { providerID: string; id: string }
            prompt: string
          }
          const parent = await session.get({ sessionID: toolContext.sessionID })
          if (await findTeamContext(storage, session, parent)) {
            throw new Error("The active team roster is fixed; use assign_task instead")
          }
          const children = await listChildren(
            session,
            parent.directory ?? directory,
            parent.id,
          )
          if (children.some((child) => child.title === input.name)) {
            throw new Error(`An agent named "${input.name}" already exists here`)
          }

          const created = await session.create({
            ...(input.id ? { id: input.id } : {}),
            parentID: parent.id,
            title: input.name,
            agent: input.agent ?? "build",
            ...(input.model ? { model: input.model } : {}),
          })

          try {
            await session.prompt({
              sessionID: created.id,
              text: `${input.prompt}\n\nWhen finished, report your result to the parent by calling tools.orchestra.send_message({to: "parent", message: "<your result>"}) through execute. Do not report before finishing or repeat transport receipts to the user.`,
            })
          } catch (error) {
            await session.remove({ sessionID: created.id }).catch(() => undefined)
            throw error
          }

          return result(JSON.stringify({
            name: input.name,
            sessionID: created.id,
            parentID: parent.id,
            agent: input.agent ?? "build",
          }))
        },
      })

      editor.add({
        name: "send_message",
        description: "Message your parent or a direct child; the sender label is inferred and session IDs are omitted.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: {
            to: { type: "string", minLength: 1 },
            message: { type: "string", minLength: 1 },
          },
          required: ["to", "message"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as { to: string; message: string }
          const sender = await session.get({ sessionID: toolContext.sessionID })
          const teamContext = await findTeamContext(storage, session, sender)
          const teamMember = teamContext?.team.teamMembers.find((member) =>
            member.session.id === sender.id,
          )
          let recipientID: string

          if (input.to === "parent") {
            if (!sender.parentID) throw new Error("This session has no parent")
            recipientID = sender.parentID
          } else {
            const children = await listChildren(
              session,
              sender.directory ?? directory,
              sender.id,
            )
            recipientID = resolveChild(children, input.to).id
          }

          await session.prompt({
            sessionID: recipientID,
            text: `${agentLabel(teamMember
              ? `${teamMember.acronym} — ${teamMember.name}`
              : sender.title)}:\n${input.message}`,
          })
          return result(
            `Prompt submitted to ${input.to}; this is a transport receipt only, ` +
            `not confirmation that the recipient read or accepted it.`,
          )
        },
      })

      editor.add({
        name: "inspect_agent",
        description: "List child sessions and assignment states, or inspect one child's status and messages.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: { agent: { type: "string", minLength: 1 } },
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as { agent?: string }
          const parent = await session.get({ sessionID: toolContext.sessionID })
          const children = await listChildren(
            session,
            parent.directory ?? directory,
            parent.id,
          )
          if (!input.agent) {
            const context = await findTeamContext(storage, session, parent)
            const assignmentBySession = new Map(
              context?.team.teamMembers.map((member) => [member.session.id, member.assignment]) ?? [],
            )
            return result(JSON.stringify(children.map((child) => ({
              id: child.id,
              title: child.title,
              agent: child.agent,
              model: child.model,
              status: sessionStatus(child, executions),
              outcome: child.outcome,
              assignment: assignmentBySession.get(child.id) ?? null,
            }))))
          }

          const child = resolveChild(children, input.agent)
          const [details, messages] = await Promise.all([
            session.get({ sessionID: child.id }),
            session.context({ sessionID: child.id }),
          ])
          const context = await findTeamContext(storage, session, parent)
          const assignment = context?.team.teamMembers.find((member) =>
            member.session.id === child.id,
          )?.assignment
          return result(JSON.stringify({
            id: details.id,
            title: details.title,
            agent: details.agent,
            model: details.model,
            status: sessionStatus(details, executions),
            outcome: details.outcome,
            assignment: assignment ?? null,
            messages: summarizeMessages(messages),
          }))
        },
      })

      editor.add({
        name: "delete_agent",
        description: "Delete one of your direct child agents and its descendants.",
        options: { namespace: "orchestra", codemode: true },
        input: {
          type: "object",
          properties: { agent: { type: "string", minLength: 1 } },
          required: ["agent"],
          additionalProperties: false,
        },
        execute: async (raw, toolContext) => {
          const input = raw as { agent: string }
          const parent = await session.get({ sessionID: toolContext.sessionID })
          if (await findTeamContext(storage, session, parent)) {
            throw new Error("The active team roster is fixed; close the team before deleting members")
          }
          const children = await listChildren(
            session,
            parent.directory ?? directory,
            parent.id,
          )
          const child = resolveChild(children, input.agent)
          await session.remove({ sessionID: child.id })
          return result(`Deleted ${child.title ?? child.id} (${child.id}).`)
        },
      })
    })
    return () => eventController.abort()
  },
})
