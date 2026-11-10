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

export function sessionStatus(session: AgentSession): "busy" | "idle" | "new" {
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
