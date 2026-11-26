export type AuditFinding = {
  package: string
  severity: string
  url: string
}

export type AuditReport = {
  blocking: AuditFinding[]
  warnings: AuditFinding[]
}

/**
 * Blocking severities, lower-case. The release gate allows no unresolved
 * medium finding: `moderate` is the npm/`bun audit` spelling of the CVSS
 * medium band, so both labels block.
 */
const BLOCKING_SEVERITIES = new Set(["critical", "high", "medium", "moderate"])
const WARNING_SEVERITIES = new Set(["low", "info"])

export class AuditReportError extends Error {}

function malformed(reason: string): never {
  throw new AuditReportError(reason)
}

/**
 * Parse `bun audit --json` output. The command prints a version banner before
 * the JSON object, so parsing starts at the first `{`.
 */
export function parseAuditReport(raw: string): AuditReport {
  const start = raw.indexOf("{")
  if (start === -1) malformed("no JSON object in the input")

  let data: unknown
  try {
    data = JSON.parse(raw.slice(start))
  } catch (error) {
    malformed(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    malformed("audit output is not an object keyed by package name")
  }

  const blocking: AuditFinding[] = []
  const warnings: AuditFinding[] = []

  for (const [name, list] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(list)) malformed(`entry for ${name} is not an array`)

    for (const item of list) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        malformed(`entry for ${name} is not an advisory object`)
      }

      const record = item as { severity?: unknown; url?: unknown }
      if (typeof record.severity !== "string" || record.severity.trim() === "") {
        malformed(`entry for ${name} has no severity`)
      }

      const severity = record.severity.trim().toLowerCase()
      const finding: AuditFinding = {
        package: name,
        severity,
        url: typeof record.url === "string" ? record.url : "",
      }

      if (BLOCKING_SEVERITIES.has(severity)) blocking.push(finding)
      else if (WARNING_SEVERITIES.has(severity)) warnings.push(finding)
      else malformed(`unknown severity "${record.severity}" for ${name}`)
    }
  }

  return { blocking, warnings }
}

function format(finding: AuditFinding): string {
  return `${finding.package} ${finding.severity} ${finding.url}`.trim()
}

/** Report a parsed audit and exit non-zero when a blocking severity is found. */
export function reportAudit(report: AuditReport, log = console.log): number {
  for (const finding of report.warnings) log(`::warning::${format(finding)}`)
  if (report.blocking.length === 0) {
    log("No blocking advisories")
    return 0
  }
  for (const finding of report.blocking) log(`::error::${format(finding)}`)
  return 1
}

if (import.meta.main) {
  const path = Bun.argv[2] ?? "audit.json"
  let raw: string
  try {
    raw = await Bun.file(path).text()
  } catch (error) {
    console.log(`::error::Cannot read audit report ${path}: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }

  try {
    process.exit(reportAudit(parseAuditReport(raw)))
  } catch (error) {
    if (error instanceof AuditReportError) {
      console.log(`::error::Cannot parse audit report ${path}: ${error.message}`)
      process.exit(1)
    }
    throw error
  }
}
