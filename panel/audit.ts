export type AuditEvent = {
  at: number
  operation: "activate_team" | "complete_team" | "delete_agent"
  decision: "allowed" | "denied"
  resources: string[]
  sessionID: string
  rootSessionID: string
  requestId?: string
  teamRunId?: string
}

export function parseAuditEvents(body: string): AuditEvent[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error("Invalid audit response from the Orchestra service.")
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid audit response from the Orchestra service.")
  }
  const events = (parsed as { events?: unknown }).events
  if (!Array.isArray(events) || events.length > 100) {
    throw new Error("Invalid audit response from the Orchestra service.")
  }
  for (const value of events) {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid audit response from the Orchestra service.")
    }
    const event = value as Partial<AuditEvent>
    if (!Number.isFinite(event.at) ||
      !["activate_team", "complete_team", "delete_agent"].includes(event.operation ?? "") ||
      (event.decision !== "allowed" && event.decision !== "denied") ||
      !Array.isArray(event.resources) || event.resources.length > 100 ||
      event.resources.join("\n").length > 4096 ||
      event.resources.some((item) =>
        typeof item !== "string" || item.length > 4096,
      ) ||
      typeof event.sessionID !== "string" ||
      typeof event.rootSessionID !== "string" ||
      (event.requestId !== undefined && typeof event.requestId !== "string") ||
      (event.teamRunId !== undefined && typeof event.teamRunId !== "string")) {
      throw new Error("Invalid audit response from the Orchestra service.")
    }
  }
  return events as AuditEvent[]
}
