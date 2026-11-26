import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { AuditReportError, parseAuditReport, reportAudit } from "../scripts/audit-report"

const banner = "bun audit v1.2.15 (df017990)\n"

function audit(input: unknown): string {
  return banner + JSON.stringify(input)
}

function capture() {
  const lines: string[] = []
  return { lines, log: (line: string) => lines.push(line) }
}

describe("parseAuditReport", () => {
  test("blocks high and critical advisories, including mixed case", () => {
    const report = parseAuditReport(
      audit({
        left: [{ severity: "HIGH", url: "https://example.test/high" }],
        right: [{ severity: "Critical", url: "https://example.test/critical" }],
      }),
    )

    expect(report.blocking.map((finding) => finding.package)).toEqual(["left", "right"])
    expect(report.blocking.map((finding) => finding.severity)).toEqual(["high", "critical"])
    expect(report.warnings).toEqual([])
  })

  test("blocks medium and moderate advisories", () => {
    const report = parseAuditReport(
      audit({
        a: [{ severity: "Medium", url: "https://example.test/medium" }],
        b: [{ severity: "moderate", url: "https://example.test/moderate" }],
      }),
    )

    expect(report.blocking.map((finding) => finding.severity)).toEqual([
      "medium",
      "moderate",
    ])
    expect(report.warnings).toEqual([])
  })

  test("treats low and info as warnings", () => {
    const report = parseAuditReport(
      audit({
        b: [{ severity: "LOW", url: "u2" }],
        c: [{ severity: " Info ", url: "u3" }],
      }),
    )

    expect(report.blocking).toEqual([])
    expect(report.warnings.map((finding) => finding.severity)).toEqual(["low", "info"])
  })

  test("fails on empty input", () => {
    expect(() => parseAuditReport("")).toThrow(AuditReportError)
    expect(() => parseAuditReport(banner)).toThrow(/no JSON object/)
  })

  test("fails on invalid JSON", () => {
    expect(() => parseAuditReport(`${banner}{"broken": `)).toThrow(/invalid JSON/)
  })

  test("fails when the payload is not a JSON object", () => {
    // Parsing starts at the first `{`, so a top-level array or null is
    // rejected as missing a JSON object rather than as an object.
    expect(() => parseAuditReport(`${banner}[]`)).toThrow(/no JSON object/)
    expect(() => parseAuditReport(`${banner}null`)).toThrow(/no JSON object/)
  })

  test("fails on non-array and non-object entries", () => {
    expect(() => parseAuditReport(audit({ pkg: 42 }))).toThrow(/not an array/)
    expect(() => parseAuditReport(audit({ pkg: ["nope"] }))).toThrow(
      /not an advisory object/,
    )
  })

  test("fails on missing or unknown severity", () => {
    expect(() => parseAuditReport(audit({ pkg: [{ url: "u" }] }))).toThrow(
      /has no severity/,
    )
    expect(() =>
      parseAuditReport(audit({ pkg: [{ severity: "banana", url: "u" }] })),
    ).toThrow(/unknown severity "banana"/)
  })
})

describe("reportAudit", () => {
  test("returns zero and warns when nothing blocks", () => {
    const { lines, log } = capture()
    const code = reportAudit(
      parseAuditReport(audit({ pkg: [{ severity: "Low", url: "u" }] })),
      log,
    )

    expect(code).toBe(0)
    expect(lines).toEqual(["::warning::pkg low u", "No blocking advisories"])
  })

  test("returns zero for a clean empty report", () => {
    const { lines, log } = capture()
    const code = reportAudit(parseAuditReport(audit({})), log)

    expect(code).toBe(0)
    expect(lines).toEqual(["No blocking advisories"])
  })

  test("returns non-zero and errors on a blocking severity", () => {
    const { lines, log } = capture()
    const code = reportAudit(
      parseAuditReport(audit({ pkg: [{ severity: "high", url: "u" }] })),
      log,
    )

    expect(code).toBe(1)
    expect(lines).toEqual(["::error::pkg high u"])
  })

  test("keeps parse errors distinct from findings", () => {
    const { lines, log } = capture()
    let message = ""
    try {
      reportAudit(parseAuditReport(""), log)
    } catch (error) {
      message = error instanceof AuditReportError ? error.message : "unexpected"
    }

    expect(lines).toEqual([])
    expect(message).toContain("no JSON object in the input")
  })
})

describe("CLI", () => {
  const script = fileURLToPath(new URL("../scripts/audit-report.ts", import.meta.url))
  let root = ""

  beforeAll(async () => {
    // A space in the parent directory catches quoting and URL-path mistakes.
    root = await mkdtemp(join(tmpdir(), "orchestra audit cli-"))
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test("exits zero for a clean report", async () => {
    const path = join(root, "clean.json")
    await writeFile(path, audit({}))

    const result = Bun.spawnSync(["bun", script, path], { stdout: "pipe", stderr: "pipe" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("No blocking advisories")
  })

  test("exits one for an unreadable report", () => {
    const result = Bun.spawnSync(["bun", script, join(root, "missing.json")], {
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout.toString()).toContain("Cannot read audit report")
  })

  test("exits one when a blocking severity is reported", async () => {
    const path = join(root, "blocking.json")
    await writeFile(path, audit({ pkg: [{ severity: "Medium", url: "u" }] }))

    const result = Bun.spawnSync(["bun", script, path], { stdout: "pipe", stderr: "pipe" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout.toString()).toContain("::error::pkg medium u")
  })
})
