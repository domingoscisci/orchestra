import { Plugin } from "@opencode/plugin"
import {
  agentLabel,
  directChildren,
  pageSessions,
  resolveChild,
  sessionStatus,
  summarizeMessages,
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

function result(content: string) {
  return { content }
}

export default Plugin.define({
  id: "orchestra",
  async setup(ctx) {
    // shortcut: plugin types omit API fields; remove this cast when they expose them.
    const session = ctx.session as unknown as SessionAPI
    const directory = ctx.location.directory

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "orchestra",
        description: "Create and manage child-agent sessions",
      })

      editor.add({
        name: "create_agent",
        description: "Create a child agent and give it a task.",
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
              text: `${input.prompt}\n\nWhen finished, report your result to the parent by calling tools.orchestra.send_message({to: "parent", message: "<your result>"}) through execute. Do not report before finishing.`,
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
            text: `${agentLabel(sender.title)}:\n${input.message}`,
          })
          return result(`Message sent to ${input.to}.`)
        },
      })

      editor.add({
        name: "inspect_agent",
        description: "List your child agents or inspect one child's status and recent messages.",
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
            return result(JSON.stringify(children.map((child) => ({
              id: child.id,
              title: child.title,
              agent: child.agent,
              model: child.model,
              status: sessionStatus(child),
              outcome: child.outcome,
            }))))
          }

          const child = resolveChild(children, input.agent)
          const [details, messages] = await Promise.all([
            session.get({ sessionID: child.id }),
            session.context({ sessionID: child.id }),
          ])
          return result(JSON.stringify({
            id: details.id,
            title: details.title,
            agent: details.agent,
            model: details.model,
            status: sessionStatus(details),
            outcome: details.outcome,
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
  },
})
