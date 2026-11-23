import { parse as parseYaml } from "yaml"

export function parseAgentFrontmatter(source: string): Record<string, unknown> {
  const parse = (value: string) => {
    const parsed: unknown = parseYaml(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }

  try {
    return parse(source)
  } catch (error) {
    const description = source.match(/^description:\s*(.*)$/m)
    if (!description) throw error

    let value: unknown
    try {
      value = parseYaml(`description: ${description[1]}`)
    } catch {
      value = description[1]
    }
    if (typeof value !== "string") throw error

    return parse(source.replace(
      description[0],
      `description: ${JSON.stringify(value)}`,
    ))
  }
}
