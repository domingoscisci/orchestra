import { connectHost } from "@openchamber/sdk"
import { applyHostReady } from "@openchamber/sdk/ui"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import { nextAcronym } from "../src/core"

type Agent = {
  id: string
  name: string
  description?: string
  mode: "primary" | "subagent" | "all"
  hidden: boolean
}
type Member = { name: string; agent: string }
type Domain = { name: string; lead: string; members: string[] }
type Config = {
  lead?: string
  solo?: boolean
  roster?: Member[]
  domains?: Domain[]
  teamGuideExists?: boolean
  teamGuideMode?: "append" | "overwrite"
}
type Preview = {
  members: Array<{
    name: string
    role: string
    acronym: string
    parent: string | null
  }>
  domains: Domain[]
}
type SavedTeam = {
  id: string
  name: string
  solo?: boolean
  lead: { name: string; agent: string }
  roster: Member[]
  domains: Domain[]
}
type TeamStore = { version: 1; teams: SavedTeam[] }
type ActivationStatus = {
  requestId: string
  teamId: string
  teamName: string
  state: "pending" | "activated" | "failed" | "unknown"
  error?: string
}

const host = connectHost()
const root = document.querySelector<HTMLElement>("#app")!
let activation: ActivationStatus | null = null
let pollGeneration = 0
let projectDirectory: string | null = null
let readyDirectory: string | null = null
let initialized = false
let teamStore: TeamStore = { version: 1, teams: [] }
let selectedTeamId = ""
let activeTeamId = ""
let projectAgents: Agent[] = []

function parse<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function parseAgents(value: string | undefined, stage: string) {
  const parsed = parse<unknown>(value, {})
  if (Array.isArray(parsed)) {
    return stage === "lead"
      ? { lead: parsed as Agent[], roster: [] as Agent[] }
      : { lead: [] as Agent[], roster: parsed as Agent[] }
  }
  if (!parsed || typeof parsed !== "object") {
    return { lead: [] as Agent[], roster: [] as Agent[] }
  }
  const agents = parsed as { lead?: unknown; roster?: unknown }
  return {
    lead: Array.isArray(agents.lead) ? agents.lead as Agent[] : [],
    roster: Array.isArray(agents.roster) ? agents.roster as Agent[] : [],
  }
}

function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!)
}

function showError(message: string) {
  const status = root.querySelector<HTMLElement>("[data-status]")
  if (status) status.textContent = message
}

function drawActivationStatus() {
  const target = root.querySelector<HTMLElement>("[data-activation]")
  if (!target || !activation) return
  const text = activation.state === "pending"
    ? `Attivazione di “${activation.teamName}” in corso…`
    : activation.state === "activated"
      ? `Team “${activation.teamName}” attivato.`
      : activation.state === "failed"
        ? "Attivazione non riuscita. Controlla la configurazione e riprova."
        : `Esito non disponibile per “${activation.teamName}”. ${activation.error ?? "Il servizio potrebbe non essere autorizzato o raggiungibile."}`
  target.innerHTML = `<p role="status">${esc(text)}</p>${
    activation.state === "unknown"
      ? '<button type="button" data-recheck>Controlla di nuovo</button>' : ""
  }`
  target.querySelector<HTMLButtonElement>("[data-recheck]")
    ?.addEventListener("click", () => void pollActivation(true))
}

async function pollActivation(recheck = false) {
  if (!activation || document.hidden) return
  const generation = ++pollGeneration
  const started = Date.now()
  activation.state = "pending"
  drawActivationStatus()
  while (generation === pollGeneration && activation?.state === "pending") {
    if (Date.now() - started > 120_000) {
      activation.state = "unknown"
      drawActivationStatus()
      return
    }
    try {
      const response = await host.serviceRequest({
        method: "GET",
        path: `/v1/activations/${activation.requestId}`,
      })
      if (response.status === 200) {
        const receipt = JSON.parse(response.body) as {
          state?: ActivationStatus["state"]; error?: string
        }
        if (receipt.state === "activated" || receipt.state === "failed") {
          activation.state = receipt.state
          activation.error = receipt.state === "failed" ? "plugin" : undefined
          if (receipt.state === "activated") activeTeamId = activation.teamId
          renderManager()
          drawActivationStatus()
          return
        }
      } else if (response.status !== 404 && response.status !== 503) {
        activation.state = "unknown"
        drawActivationStatus()
        return
      }
    } catch (error) {
      activation.state = "unknown"
      const code = (error as { code?: string })?.code
      activation.error = code === "NOT_GRANTED" || code === "NO_SERVICE"
        ? "Autorizza il servizio Orchestra nelle impostazioni dell’estensione."
        : "Il servizio Orchestra non è raggiungibile."
      drawActivationStatus()
      return
    }
    if (!recheck) await new Promise((resolve) => setTimeout(resolve, 1500))
    else recheck = false
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pollGeneration++
  else if (activation?.state === "pending") void pollActivation()
})
window.addEventListener("pagehide", () => { pollGeneration++ })

async function answer(value: unknown, button: HTMLButtonElement) {
  button.disabled = true
  try {
    await host.answerBlock(JSON.stringify(value))
  } catch {
    button.disabled = false
    showError("Could not submit this step. Please try again.")
  }
}

function button(label: string, primary = false) {
  return `<button type="button"${primary ? ' class="primary"' : ""}>${esc(label)}</button>`
}

const TEAM_FILE = ".team.yml"

function slug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

async function readTeamStore() {
  if (!projectDirectory) {
    teamStore = { version: 1, teams: [] }
    return
  }
  try {
    const { content } = await host.readFile(TEAM_FILE)
    const parsed = parseYaml(content) as Partial<TeamStore>
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.teams)) {
      throw new Error("Formato .team.yml non valido: atteso version: 1 e teams.")
    }
    const ids = new Set<string>()
    for (const team of parsed.teams) {
      if (!team || typeof team !== "object" || typeof team.id !== "string" ||
        !team.id || ids.has(team.id) || typeof team.name !== "string" ||
        !team.lead || typeof team.lead.name !== "string" ||
        typeof team.lead.agent !== "string" || !Array.isArray(team.roster) ||
        !Array.isArray(team.domains) ||
        team.roster.some((member) => !member ||
          typeof member.name !== "string" || typeof member.agent !== "string") ||
        team.domains.some((domain) => !domain ||
          typeof domain.name !== "string" || typeof domain.lead !== "string" ||
          !Array.isArray(domain.members) ||
          domain.members.some((member) => typeof member !== "string"))) {
        throw new Error("Formato .team.yml non valido: controlla ID, lead, roster e domini.")
      }
      ids.add(team.id)
    }
    teamStore = parsed as TeamStore
  } catch (error) {
    if ((error as { code?: string }).code === "NOT_FOUND") {
      teamStore = { version: 1, teams: [] }
    } else {
      throw error
    }
  }
}

async function writeTeamStore() {
  if (!projectDirectory) throw new Error("Apri prima un progetto.")
  teamStore.teams.sort((a, b) => a.name.localeCompare(b.name))
  await host.writeFile(TEAM_FILE, stringifyYaml(teamStore, { lineWidth: 100 }))
}

async function readProjectAgents() {
  const builtIns: Agent[] = [
    { id: "build", name: "Build", mode: "primary", hidden: false },
    { id: "plan", name: "Plan", mode: "primary", hidden: false },
    { id: "general", name: "General", mode: "subagent", hidden: false },
    { id: "explore", name: "Explore", mode: "subagent", hidden: false },
  ]
  projectAgents = builtIns
  if (!projectDirectory) return
  const files: string[] = []
  const walk = async (path: string): Promise<void> => {
    let entries: Array<{ name: string; kind: string }>
    try {
      ;({ entries } = await host.listDir(path))
    } catch (error) {
      if ((error as { code?: string }).code === "NOT_FOUND") return
      throw error
    }
    for (const entry of entries) {
      const child = `${path}/${entry.name}`
      if (entry.kind === "directory") await walk(child)
      else if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".md")) {
        files.push(child)
      }
    }
  }
  await walk(".opencode/agents")
  const localAgents = await Promise.all(files.map(async (path) => {
    const id = path.slice(".opencode/agents/".length).replace(/\.md$/i, "")
    const { content } = await host.readFile(path)
    const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/)
    const raw = frontmatter ? parseYaml(frontmatter[1]) : {}
    const metadata = raw && typeof raw === "object"
      ? raw as Record<string, unknown> : {}
    const mode = metadata.mode === "subagent" || metadata.mode === "all" ||
      metadata.mode === "primary" ? metadata.mode : "primary"
    return {
      id,
      name: typeof metadata.name === "string" ? metadata.name : id,
      description: typeof metadata.description === "string"
        ? metadata.description : undefined,
      mode,
      hidden: metadata.hidden === true || metadata.disabled === true,
    } satisfies Agent
  }))
  const merged = new Map(builtIns.map((agent) => [agent.id, agent]))
  for (const agent of localAgents) merged.set(agent.id, agent)
  projectAgents = [...merged.values()].filter((agent) => !agent.hidden)
}

function agentOptions(
  mode: "lead" | "roster",
  selected = "",
) {
  const agents = projectAgents.filter((agent) =>
    mode === "lead"
      ? agent.mode === "primary" || agent.mode === "all"
      : agent.mode === "subagent" || agent.mode === "all",
  )
  return `${selected && !agents.some((agent) => agent.id === selected)
    ? `<option value="${esc(selected)}" selected>${esc(selected)} (non disponibile)</option>`
    : ""}${agents.map((agent) =>
    `<option value="${esc(agent.id)}"${agent.id === selected ? " selected" : ""}>${esc(agent.name)}</option>`,
  ).join("")}`
}

function suggestedMemberNames(roster: Member[]) {
  const counts = new Map<string, number>()
  const positions = new Map<string, number>()
  roster.forEach(({ agent }) => counts.set(agent, (counts.get(agent) ?? 0) + 1))
  return roster.map(({ agent }) => {
    const label = projectAgents.find((item) => item.id === agent)?.name ?? agent
    const position = (positions.get(agent) ?? 0) + 1
    positions.set(agent, position)
    return counts.get(agent)! > 1 ? `${label} ${position}` : label
  })
}

function renderManager(message = "") {
  const cards = teamStore.teams.map((team) => `
    <article class="card team-card${team.id === selectedTeamId ? " selected" : ""}" data-team="${esc(team.id)}">
      <div class="team-top"><strong>${esc(team.name)}</strong>${team.id === activeTeamId ? '<span class="badge">Attivato</span>' : ""}</div>
      <p class="muted">Lead: ${esc(team.lead.name)} · ${team.roster.length} membri · ${team.domains.length} domini</p>
      <div class="actions">
        <button class="primary" data-activate="${esc(team.id)}">Attiva team</button>
        <button data-edit="${esc(team.id)}">Modifica</button>
        <button class="danger" data-delete="${esc(team.id)}">Elimina</button>
      </div>
    </article>`).join("")
  root.innerHTML = `
    <header class="brand"><span class="brand-icon">O</span><div><h1>Orchestra</h1><small>Gestione team</small></div><span class="project">⌂ ${esc(projectDirectory?.split(/[\\/]/).filter(Boolean).pop() ?? "Nessun progetto")}</span></header>
    <p class="intro">${projectDirectory ? "Scegli una configurazione da attivare nel progetto corrente." : "Apri un progetto per gestire le configurazioni."}</p>
    <div class="actions"><button class="primary" data-new>＋ Nuovo team</button><button data-refresh>Ricarica</button></div>
    <h2>Team salvati <span class="muted">(${teamStore.teams.length})</span></h2>
    ${cards || '<p class="muted">Nessun team salvato. Creane uno per iniziare.</p>'}
    <p class="muted" role="status" data-status>${esc(message)}</p>
    <section data-activation aria-live="polite"></section>
    <p class="footnote">Il team selezionato viene inviato all’agente nella chat; il plugin convalida la configurazione e avvia le sessioni.</p>`
  drawActivationStatus()
  root.querySelector("[data-new]")?.addEventListener("click", () => renderEditor())
  root.querySelector("[data-refresh]")?.addEventListener("click", async () => {
    try {
      await Promise.all([readTeamStore(), readProjectAgents()])
      renderManager("Configurazioni e ruoli ricaricati.")
    }
    catch (error) { renderManager(error instanceof Error ? error.message : String(error)) }
  })
  root.querySelectorAll<HTMLElement>(".team-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("button")) return
      selectedTeamId = card.dataset.team ?? ""
      renderManager()
    })
  })
  root.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((item) =>
    item.addEventListener("click", () => renderEditor(item.dataset.edit)))
  root.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((item) =>
    item.addEventListener("click", async () => {
      const team = teamStore.teams.find((entry) => entry.id === item.dataset.delete)
      if (!team || !confirm(`Eliminare “${team.name}” da .team.yml?`)) return
      teamStore.teams = teamStore.teams.filter((entry) => entry.id !== team.id)
      if (selectedTeamId === team.id) selectedTeamId = ""
      if (activeTeamId === team.id) activeTeamId = ""
      try { await writeTeamStore(); renderManager("Team eliminato.") }
      catch (error) { renderManager(error instanceof Error ? error.message : String(error)) }
    }))
  root.querySelectorAll<HTMLButtonElement>("[data-activate]").forEach((item) =>
    item.addEventListener("click", async () => {
      const team = teamStore.teams.find((entry) => entry.id === item.dataset.activate)
      if (!team) return
      selectedTeamId = team.id
      item.disabled = true
      try {
        const requestId = crypto.randomUUID()
        const request = `Attiva questo team Orchestra nel progetto corrente usando orchestra.activate_team. Usa esattamente requestId "${requestId}". Configurazione approvata dall'utente: ${JSON.stringify({
          lead: team.lead.agent, roster: team.roster, domains: team.domains,
          approved: true, requestId,
        })}. Non modificare la configurazione. Se esiste TEAM.md e serve una scelta di aggiornamento, chiedi prima all'utente.`
        await host.prompt({ text: request, send: true })
        activation = { requestId, teamId: team.id, teamName: team.name, state: "pending" }
        renderManager("Richiesta inviata alla chat.")
        void pollActivation()
      } catch (error) {
        item.disabled = false
        renderManager(error instanceof Error ? error.message : String(error))
      }
    }))
}

function renderEditor(id?: string) {
  const current = teamStore.teams.find((team) => team.id === id)
  const draft: SavedTeam = current ? structuredClone(current) : {
    id: "", name: "", solo: false, lead: { name: "Team Lead", agent: "" }, roster: [], domains: [],
  }
  let stage = 0
  const draw = () => {
    const stageNames = ["Team Lead", "Membri", "Domini", "Riepilogo"]
    root.innerHTML = `
      <header class="brand"><span class="brand-icon">O</span><div><h1>Orchestra</h1><small>Gestione team</small></div><span class="project">⌂ ${esc(projectDirectory?.split(/[\\/]/).filter(Boolean).pop() ?? "Nessun progetto")}</span></header>
      <section class="editor">
      <div class="back"><button data-back>‹ Team salvati</button></div>
      <h1>${current ? "Modifica team" : "Crea un team"}</h1>
      <p class="muted">Configuralo in pochi passaggi. Potrai salvarlo e attivarlo quando vuoi.</p>
      <nav class="wizard">${stageNames.map((name, index) => `<span class="${index === stage ? "current" : index < stage ? "done" : ""}">${index < stage ? "✓" : index + 1} ${name}</span>`).join("<i>›</i>")}</nav>
      <section data-form></section><p class="error" data-status role="status"></p>
      <div class="actions"><button data-cancel>Annulla</button>${stage > 0 ? '<button data-prev>← Indietro</button>' : ""}<button class="primary" data-next>${stage === 3 ? "Salva team" : "Continua →"}</button></div></section>
      <p class="step-note">Passaggio ${stage + 1} di 4 · Nessuna sessione verrà avviata fino a “Attiva team”.</p>`
    root.querySelector("[data-back]")!.addEventListener("click", () => renderManager())
    root.querySelector("[data-cancel]")!.addEventListener("click", () => renderManager())
    root.querySelector("[data-prev]")?.addEventListener("click", () => {
      stage = draft.solo && stage === 3 ? 0 : stage - 1
      draw()
    })
    const form = root.querySelector<HTMLElement>("[data-form]")!
    if (stage === 0) {
      const leadRoles = projectAgents.some((agent) =>
        (agent.mode === "primary" || agent.mode === "all") &&
        agent.id === draft.lead.agent,
      )
      if (!leadRoles && !current) {
        const lead = projectAgents.find((agent) =>
          agent.mode === "primary" || agent.mode === "all",
        )
        draft.lead.agent = lead?.id ?? ""
        draft.lead.name = lead?.name ?? ""
      }
      const leadAgent = projectAgents.find((agent) => agent.id === draft.lead.agent)
      if (!current && leadAgent && !draft.lead.name) draft.lead.name = leadAgent.name
      form.innerHTML = `<h2>Impostazioni iniziali</h2><p class="muted">Scegli chi coordinerà il team.</p>
        <label class="field">Ruolo del Team Lead<select data-lead-role><option value="">Scegli un ruolo…</option>${projectAgents.filter((agent) => agent.mode === "primary" || agent.mode === "all").map((agent) => `<option value="${esc(agent.id)}"${agent.id === draft.lead.agent ? " selected" : ""}>${esc(agent.name)}</option>`).join("")}</select></label>
        <label class="field">Nome del Team Lead<input data-lead-name value="${esc(draft.lead.name)}"></label>
        ${leadRoles || projectAgents.some((agent) => agent.mode === "primary" || agent.mode === "all")
          ? "" : '<p class="error">Nessun agente Team Lead trovato. Aggiungi un file agente principale in .opencode/agents/ e ricarica.</p>'}
        <label class="row"><input type="checkbox" data-solo${draft.solo ? " checked" : ""}> Team singolo</label>`
      form.querySelector<HTMLSelectElement>("[data-lead-role]")!.addEventListener("change", (event) => {
        const agent = projectAgents.find((item) => item.id === (event.currentTarget as HTMLSelectElement).value)
        if (agent) form.querySelector<HTMLInputElement>("[data-lead-name]")!.value = agent.name
      })
    } else if (stage === 1) {
      const rosterRoles = projectAgents.filter((agent) =>
        agent.mode === "subagent" || agent.mode === "all",
      )
      const suggested = suggestedMemberNames(draft.roster)
      form.innerHTML = `<h2>Costruisci il roster</h2><p class="muted">Aggiungi membri e assegna a ciascuno un ruolo agente.</p><div data-members>${draft.roster.map((member, i) => `<div class="member-row"><label class="field">Nome<input data-member-name="${i}" data-auto-name="${member.name === suggested[i]}" maxlength="80" value="${esc(member.name)}" placeholder="Es. API Engineer"></label><label class="field">Ruolo<select data-member-agent="${i}" data-previous-agent="${esc(member.agent)}"><option value="">Scegli un ruolo…</option>${agentOptions("roster", member.agent)}</select></label><button class="member-remove" data-remove="${i}" aria-label="Rimuovi membro">−</button></div>`).join("")}</div>${rosterRoles.length ? "" : '<p class="error">Nessun agente membro trovato. Aggiungi un file agente subagent in .opencode/agents/ e ricarica.</p>'}<button data-add${rosterRoles.length ? "" : " disabled"}>＋ Aggiungi membro</button>`
      form.querySelectorAll<HTMLInputElement>("[data-member-name]").forEach((input) =>
        input.addEventListener("input", () => { input.dataset.autoName = "false" }))
      form.querySelectorAll<HTMLSelectElement>("[data-member-agent]").forEach((select) =>
        select.addEventListener("change", () => {
          const oldRoster = [...form.querySelectorAll<HTMLSelectElement>("[data-member-agent]")].map((item, i) => ({
            name: form.querySelector<HTMLInputElement>(`[data-member-name="${i}"]`)!.value,
            agent: item.dataset.previousAgent ?? item.value,
          }))
          const nextRoster = [...form.querySelectorAll<HTMLSelectElement>("[data-member-agent]")].map((item, i) => ({
            name: form.querySelector<HTMLInputElement>(`[data-member-name="${i}"]`)!.value,
            agent: item.value,
          }))
          const oldSuggestions = suggestedMemberNames(oldRoster)
          const nextSuggestions = suggestedMemberNames(nextRoster)
          const changedIndex = Number(select.dataset.memberAgent)
          nextRoster.forEach((_, i) => {
            const input = form.querySelector<HTMLInputElement>(`[data-member-name="${i}"]`)!
            if (i === changedIndex || input.dataset.autoName === "true" ||
              input.value === oldSuggestions[i]) {
              input.value = nextSuggestions[i]
              input.dataset.autoName = "true"
            }
          })
          select.dataset.previousAgent = select.value
        }))
      form.querySelector("[data-add]")!.addEventListener("click", () => {
        const previous = [...form.querySelectorAll<HTMLInputElement>("[data-member-name]")].map((name) => ({
          name: name.value,
          agent: form.querySelector<HTMLSelectElement>(`[data-member-agent="${name.dataset.memberName}"]`)?.value ?? "",
        }))
        const autoNames = [...form.querySelectorAll<HTMLInputElement>("[data-member-name]")]
          .map((name) => name.dataset.autoName === "true")
        draft.roster = [...previous, { name: "", agent: rosterRoles[0]?.id ?? "" }]
        const names = suggestedMemberNames(draft.roster)
        draft.roster.forEach((member, i) => {
          if (i === draft.roster.length - 1 || autoNames[i]) member.name = names[i]
        })
        draw()
      })
      form.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((remove) =>
        remove.addEventListener("click", () => {
          const entries = [...form.querySelectorAll<HTMLInputElement>("[data-member-name]")].map((name) => ({
            member: {
              name: name.value,
              agent: form.querySelector<HTMLSelectElement>(`[data-member-agent="${name.dataset.memberName}"]`)!.value,
            },
            autoName: name.dataset.autoName === "true",
          })).filter((_, i) => i !== Number(remove.dataset.remove))
          const suggestions = suggestedMemberNames(entries.map(({ member }) => member))
          draft.roster = entries.map(({ member, autoName }, i) => ({
            ...member,
            name: autoName ? suggestions[i] : member.name,
          }))
          draw()
        }))
    } else if (stage === 2) {
      const members = draft.roster.map((member) => member.name)
      form.innerHTML = `<h2>Definisci i domini</h2><p class="muted">I domini sono facoltativi. Ogni membro può appartenere a un solo dominio.</p><div data-domains>${draft.domains.map((domain, i) => `<div class="card"><div class="row domain-heading"><label class="field">Nome dominio<input data-domain-name="${i}" value="${esc(domain.name)}" placeholder="Es. API"></label><button class="domain-remove" data-domain-remove="${i}" aria-label="Rimuovi dominio">−</button></div><div class="choices">${members.map((member) => `<label class="row"><input type="checkbox" data-domain-member="${i}" value="${esc(member)}"${domain.members.includes(member) ? " checked" : ""}>${esc(member)}</label>`).join("")}</div><label class="field">Domain Lead<select data-domain-lead="${i}"><option value="">Scegli un membro…</option>${domain.members.map((member) => `<option value="${esc(member)}"${domain.lead === member ? " selected" : ""}>${esc(member)}</option>`).join("")}</select></label></div>`).join("")}</div><button data-domain-add>＋ Aggiungi dominio</button>`
      form.querySelectorAll<HTMLInputElement>("[data-domain-name]").forEach((input) =>
        input.addEventListener("input", () => {
          draft.domains[Number(input.dataset.domainName)].name = input.value
        }))
      form.querySelectorAll<HTMLInputElement>("[data-domain-member]").forEach((checkbox) =>
        checkbox.addEventListener("change", () => {
          const index = Number(checkbox.dataset.domainMember)
          const name = checkbox.value
          if (checkbox.checked && draft.domains.some((domain, i) =>
            i !== index && domain.members.includes(name),
          )) {
            checkbox.checked = false
            showError("Ogni membro può appartenere a un solo dominio.")
            return
          }
          const domain = draft.domains[index]
          domain.members = checkbox.checked
            ? [...domain.members, name]
            : domain.members.filter((member) => member !== name)
          if (!domain.members.includes(domain.lead)) domain.lead = ""
          draw()
        }))
      form.querySelectorAll<HTMLSelectElement>("[data-domain-lead]").forEach((select) =>
        select.addEventListener("change", () => {
          draft.domains[Number(select.dataset.domainLead)].lead = select.value
        }))
      form.querySelector("[data-domain-add]")!.addEventListener("click", () => { draft.domains.push({ name: "", lead: "", members: [] }); draw() })
      form.querySelectorAll<HTMLButtonElement>("[data-domain-remove]").forEach((remove) => remove.addEventListener("click", () => { draft.domains.splice(Number(remove.dataset.domainRemove), 1); draw() }))
    } else {
      if (!draft.name) draft.name = `${draft.lead.name || "Orchestra"} Team`
      const assigned = new Set(draft.domains.flatMap((domain) => domain.members))
      const usedAcronyms = new Set<string>()
      const leadAcronym = nextAcronym("Team Lead", usedAcronyms)
      const memberAcronyms = new Map<string, string>()
      draft.roster.forEach((member) =>
        memberAcronyms.set(member.name, nextAcronym(member.name, usedAcronyms)))
      form.innerHTML = `<h2>Rivedi il team</h2><label class="field">Nome del team<input data-name maxlength="80" value="${esc(draft.name)}" placeholder="Es. Product Platform"></label><div class="card"><strong>${esc(draft.name)}</strong><p>Gerarchia del team</p><ul><li>${esc(leadAcronym)} · ${esc(draft.lead.name)} <span class="muted">(${esc(draft.lead.agent)})</span><ul>${draft.domains.map((domain) => `<li>${esc(domain.name)} — Lead: ${esc(memberAcronyms.get(domain.lead) ?? "")} · ${esc(domain.lead)}<ul>${domain.members.filter((member) => member !== domain.lead).map((member) => `<li>${esc(memberAcronyms.get(member) ?? "")} · ${esc(member)}</li>`).join("")}</ul></li>`).join("")}${draft.roster.filter((member) => !assigned.has(member.name)).map((member) => `<li>${esc(memberAcronyms.get(member.name) ?? "")} · ${esc(member.name)} <span class="muted">(${esc(member.agent)})</span></li>`).join("")}</ul></li></ul></div><p class="muted">La configurazione verrà salvata in .team.yml. Nessuna sessione parte finché non premi “Attiva team”.</p>`
      form.querySelector<HTMLInputElement>("[data-name]")!.addEventListener("input", (event) => {
        draft.name = (event.currentTarget as HTMLInputElement).value
        const heading = form.querySelector("strong")
        if (heading) heading.textContent = draft.name || "Nuovo team"
      })
    }
    root.querySelector("[data-next]")!.addEventListener("click", async () => {
      const status = root.querySelector<HTMLElement>("[data-status]")!
      if (stage === 0) {
        draft.lead.name = root.querySelector<HTMLInputElement>("[data-lead-name]")!.value.trim()
        draft.lead.agent = root.querySelector<HTMLSelectElement>("[data-lead-role]")!.value
        draft.solo = root.querySelector<HTMLInputElement>("[data-solo]")!.checked
        if (draft.solo) { draft.roster = []; draft.domains = [] }
        if (!draft.lead.name || !draft.lead.agent) { status.textContent = "Inserisci il nome e seleziona un ruolo valido per il Team Lead."; return }
        if (draft.solo) { stage = 3; draw(); return }
      }
      if (stage === 1) {
        if (draft.solo) { stage++; draw(); return }
        draft.roster = [...form.querySelectorAll<HTMLElement>("[data-member-name]")].map((name) => ({
          name: (name as HTMLInputElement).value.trim(),
          agent: (form.querySelector<HTMLSelectElement>(`[data-member-agent="${name.dataset.memberName}"]`)?.value ?? "").trim(),
        }))
        if (draft.roster.some((member) => !member.name || !member.agent)) { status.textContent = "Completa nome e ruolo di ogni membro."; return }
        if (!draft.roster.length) { status.textContent = "Aggiungi almeno un membro oppure seleziona Team singolo."; return }
        if (new Set(draft.roster.map((member) => member.name.toLocaleLowerCase())).size !== draft.roster.length) {
          status.textContent = "I nomi dei membri devono essere univoci."
          return
        }
      }
      if (stage === 2) {
        draft.domains = draft.domains.map((domain) => ({
          ...domain, name: domain.name.trim(), lead: domain.lead.trim(),
        }))
        if (draft.domains.some((domain) => !domain.name || !domain.lead || !domain.members.length)) { status.textContent = "Completa i campi dei domini o rimuovi quelli vuoti."; return }
        const rosterNames = new Set(draft.roster.map((member) => member.name.toLocaleLowerCase()))
        const assigned = new Set<string>()
        for (const domain of draft.domains) {
          const normalizedMembers = domain.members.map((member) => member.toLocaleLowerCase())
          if (!rosterNames.has(domain.lead.toLocaleLowerCase()) ||
            !normalizedMembers.includes(domain.lead.toLocaleLowerCase()) ||
            normalizedMembers.some((member) => !rosterNames.has(member)) ||
            new Set(normalizedMembers).size !== normalizedMembers.length ||
            normalizedMembers.some((member) => assigned.has(member))) {
            status.textContent = `Controlla membri e responsabile del dominio “${domain.name}”.`
            return
          }
          normalizedMembers.forEach((member) => assigned.add(member))
        }
      }
      if (stage === 3) {
        draft.name = root.querySelector<HTMLInputElement>("[data-name]")!.value.trim()
        if (!draft.name) { status.textContent = "Inserisci il nome del team."; return }
      }
      if (stage < 3) { stage++; draw(); return }
      draft.id = current?.id ?? slug(draft.name)
      if (!draft.id) { status.textContent = "Il nome del team deve contenere almeno una lettera o un numero."; return }
      if (teamStore.teams.some((team) => team.id === draft.id && team.id !== current?.id)) { status.textContent = "Esiste già un team con questo nome."; return }
      const wasEditing = !!current
      if (current) teamStore.teams = teamStore.teams.map((team) => team.id === current.id ? draft : team)
      else teamStore.teams.push(draft)
      try {
        await writeTeamStore()
        selectedTeamId = draft.id
        if (wasEditing && activeTeamId === draft.id) activeTeamId = ""
        renderManager(wasEditing ? "Modifiche salvate." : "Team creato e salvato.")
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      }
    })
  }
  draw()
}

function renderLead(config: Config, agents: { lead: Agent[] }) {
  if (!agents.lead.length) throw new Error("No eligible Team Lead roles were provided.")
  const options = agents.lead.map((agent) =>
    `<option value="${esc(agent.id)}"${agent.id === config.lead ? " selected" : ""}>${esc(agent.name)}</option>`,
  ).join("")
  root.innerHTML = `
    <h1>Set up an Orchestra team</h1>
    <p>Choose the Team Lead and whether this is a solo team.</p>
    <label class="field">Team Lead
      <select data-lead><option value="">Choose a role</option>${options}</select>
    </label>
    <label class="row"><input type="checkbox" data-solo${config.solo ? " checked" : ""}> Solo team</label>
    <p class="error" data-status role="status"></p>
    <div class="actions">${button("Continue", true)}</div>`
  root.querySelector("button")!.addEventListener("click", (event) => {
    const submit = event.currentTarget as HTMLButtonElement
    const lead = root.querySelector<HTMLSelectElement>("[data-lead]")!.value
    if (!lead) return showError("Choose a Team Lead role.")
    void answer({
      action: "team-setup",
      config: { ...config, lead, solo: root.querySelector<HTMLInputElement>("[data-solo]")!.checked },
    }, submit)
  })
}

function renderRoster(config: Config, agents: { roster: Agent[] }) {
  if (!agents.roster.length) {
    throw new Error("No eligible roster roles were provided. Retry with agents.roster.")
  }
  const roster = config.roster ?? []
  root.innerHTML = `
    <h1>Build the roster</h1>
    <p>Add one or more agents and choose a role for each.</p>
    <div data-rows></div>
    <p class="error" data-status role="status"></p>
    <div class="actions">${button("Add agent")}${button("Continue", true)}</div>`
  const rows = root.querySelector<HTMLElement>("[data-rows]")!
  const draw = () => {
    rows.innerHTML = roster.map((member, index) => `
      <section class="card row">
        <label class="field">Name
          <input data-name="${index}" maxlength="80" value="${esc(member.name)}">
        </label>
        <label class="field">Role
          <select data-role="${index}">${agents.roster.map((agent) =>
            `<option value="${esc(agent.id)}"${member.agent === agent.id ? " selected" : ""}>${esc(agent.name)}</option>`,
          ).join("")}</select>
        </label>
        <button type="button" data-remove="${index}" aria-label="Remove agent">−</button>
      </section>`).join("")
    rows.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((remove) =>
      remove.addEventListener("click", () => {
        roster.splice(Number(remove.dataset.remove), 1)
        draw()
      }),
    )
  }
  draw()
  root.querySelector(".actions button")!.addEventListener("click", () => {
    roster.push({ name: "", agent: agents.roster[0].id })
    draw()
  })
  root.querySelector<HTMLButtonElement>(".actions button.primary")!.addEventListener("click", (event) => {
    const submit = event.currentTarget as HTMLButtonElement
    const next = roster.map((member, index) => ({
      name: root.querySelector<HTMLInputElement>(`[data-name="${index}"]`)!.value.trim(),
      agent: root.querySelector<HTMLSelectElement>(`[data-role="${index}"]`)!.value,
    }))
    if (next.some((member) => !member.name || !member.agent)) {
      return showError("Give every agent a name and role.")
    }
    if (new Set(next.map((member) => member.name.toLocaleLowerCase())).size !== next.length) {
      return showError("Agent names must be unique.")
    }
    void answer({ action: "team-setup", config: { ...config, roster: next } }, submit)
  })
}

function renderDomains(config: Config) {
  const roster = config.roster ?? []
  if (!roster.length) throw new Error("A non-empty roster is required for domains.")
  const domains = structuredClone(config.domains ?? [])
  root.innerHTML = `
    <h1>Define domains</h1>
    <p>Domains are optional. Each roster member can belong to at most one domain.</p>
    <div data-rows></div>
    <p class="error" data-status role="status"></p>
    <div class="actions">${button("Add domain")}${button("Continue", true)}</div>`
  const rows = root.querySelector<HTMLElement>("[data-rows]")!
  const draw = () => {
    rows.innerHTML = domains.map((domain, index) => `
      <section class="card">
        <div class="row">
          <label class="field">Domain name
            <input data-name="${index}" value="${esc(domain.name)}">
          </label>
          <button type="button" data-remove="${index}" aria-label="Remove domain">−</button>
        </div>
        <div class="choices">${roster.map((member) => `
          <label class="row">
            <input type="checkbox" data-member="${index}" value="${esc(member.name)}"${domain.members.includes(member.name) ? " checked" : ""}>
            ${esc(member.name)}
          </label>`).join("")}</div>
        <label class="field">Domain Lead
          <select data-lead="${index}">
            <option value="">Choose a member</option>
            ${domain.members.map((name) => `<option${domain.lead === name ? " selected" : ""}>${esc(name)}</option>`).join("")}
          </select>
        </label>
      </section>`).join("")
    rows.querySelectorAll<HTMLButtonElement>("[data-remove]").forEach((remove) =>
      remove.addEventListener("click", () => {
        domains.splice(Number(remove.dataset.remove), 1)
        draw()
      }),
    )
    rows.querySelectorAll<HTMLInputElement>("[data-name]").forEach((input) =>
      input.addEventListener("input", () => {
        roster[Number(input.dataset.name)].name = input.value
      }),
    )
    rows.querySelectorAll<HTMLSelectElement>("[data-role]").forEach((select) =>
      select.addEventListener("change", () => {
        roster[Number(select.dataset.role)].agent = select.value
      }),
    )
    rows.querySelectorAll<HTMLInputElement>("[data-member]").forEach((checkbox) =>
      checkbox.addEventListener("change", () => {
        const index = Number(checkbox.dataset.member)
        const selected = [...rows.querySelectorAll<HTMLInputElement>(`[data-member="${index}"]:checked`)]
          .map((item) => item.value)
        const otherMembers = new Set(domains.flatMap((domain, i) => i === index ? [] : domain.members))
        if (selected.some((name) => otherMembers.has(name))) {
          checkbox.checked = false
          showError("A member can belong to only one domain.")
          return
        }
        domains[index].members = selected
        if (!selected.includes(domains[index].lead)) domains[index].lead = ""
        draw()
      }),
    )
    rows.querySelectorAll<HTMLInputElement>("[data-name]").forEach((input) =>
      input.addEventListener("input", () => {
        domains[Number(input.dataset.name)].name = input.value
      }),
    )
    rows.querySelectorAll<HTMLSelectElement>("[data-lead]").forEach((select) =>
      select.addEventListener("change", () => {
        domains[Number(select.dataset.lead)].lead = select.value
      }),
    )
  }
  draw()
  root.querySelector(".actions button")!.addEventListener("click", () => {
    domains.push({ name: "", lead: "", members: [] })
    draw()
  })
  root.querySelector<HTMLButtonElement>(".actions button.primary")!.addEventListener("click", (event) => {
    const submit = event.currentTarget as HTMLButtonElement
    const next = domains.map((domain, index) => ({
      name: root.querySelector<HTMLInputElement>(`[data-name="${index}"]`)!.value.trim(),
      lead: root.querySelector<HTMLSelectElement>(`[data-lead="${index}"]`)!.value,
      members: [...root.querySelectorAll<HTMLInputElement>(`[data-member="${index}"]:checked`)]
        .map((item) => item.value),
    }))
    if (next.some((domain) => !domain.name || !domain.members.length || !domain.lead)) {
      return showError("Each domain needs a name, members, and a lead.")
    }
    void answer({ action: "team-setup", config: { ...config, domains: next } }, submit)
  })
}

function renderReview(config: Config, preview: Preview) {
  if (!preview.members?.length) throw new Error("A validated Team preview is required.")
  const guide = config.teamGuideExists
    ? `<label class="field">TEAM.md
        <select data-guide>
          <option value="">Choose how to update the file</option>
          <option value="append"${config.teamGuideMode === "append" ? " selected" : ""}>Append Orchestra rules</option>
          <option value="overwrite"${config.teamGuideMode === "overwrite" ? " selected" : ""}>Overwrite</option>
        </select>
      </label>`
    : ""
  root.innerHTML = `
    <h1>Review and approve</h1>
    <p>Check the exact roster and hierarchy before the plugin creates sessions.</p>
    <section class="card"><strong>Team</strong><ul>${preview.members.map((member) =>
      `<li><strong>${esc(member.acronym)} · ${esc(member.name)}</strong> — ${esc(member.role)}; parent: ${esc(member.parent ?? "none")}</li>`,
    ).join("")}</ul></section>
    <section class="card"><strong>Domains</strong>${preview.domains.length
      ? `<ul>${preview.domains.map((domain) =>
        `<li>${esc(domain.name)} — lead: ${esc(domain.lead)}; members: ${domain.members.map(esc).join(", ")}</li>`,
      ).join("")}</ul>`
      : '<p class="muted">No domains</p>'}</section>
    ${guide}
    <p class="error" data-status role="status"></p>
    <div class="actions">${button("Cancel")}${button("Approve team", true)}</div>`
  const buttons = root.querySelectorAll<HTMLButtonElement>("button")
  buttons[0].addEventListener("click", (event) => {
    void answer({ action: "team-setup", approved: false }, event.currentTarget as HTMLButtonElement)
  })
  buttons[1].addEventListener("click", (event) => {
    const submit = event.currentTarget as HTMLButtonElement
    const teamGuideMode = config.teamGuideExists
      ? root.querySelector<HTMLSelectElement>("[data-guide]")!.value
      : undefined
    if (config.teamGuideExists && !teamGuideMode) {
      return showError("Choose how to update TEAM.md.")
    }
    void answer({
      action: "team-setup",
      config: { ...config, teamGuideMode },
      preview,
      approved: true,
    }, submit)
  })
}

host.onReady(async (context) => {
  applyHostReady(context, document.documentElement)
  if (initialized && context.directory === readyDirectory) return
  if (initialized) { activeTeamId = ""; selectedTeamId = "" }
  initialized = true
  readyDirectory = context.directory
  projectDirectory = context.directory
  try {
    await Promise.all([readTeamStore(), readProjectAgents()])
    renderManager()
  } catch (error) {
    renderManager(error instanceof Error ? error.message : String(error))
  }
})

host.onBlock((block) => {
  if (block.name !== "TeamSetup" || block.answered) return
  try {
    const config = parse<Config>(block.args.config, {})
    const agents = parseAgents(block.args.agents, block.args.stage)
    const preview = parse<Preview>(block.args.preview, { members: [], domains: [] })
    switch (block.args.stage) {
      case "lead":
        renderLead(config, agents)
        break
      case "roster":
        renderRoster(config, agents)
        break
      case "domains":
        renderDomains(config)
        break
      case "review":
        renderReview(config, preview)
        break
      default:
        throw new Error("Unknown Team setup stage.")
    }
  } catch (error) {
    root.innerHTML = `<h1>Team setup unavailable</h1><p class="error">${esc(error instanceof Error ? error.message : error)}</p>`
  }
})
