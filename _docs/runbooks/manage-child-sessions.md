# OpenCode Plugin Agent and Session Methods

This runbook documents the `ctx.agent` and `ctx.session` methods exercised by
this project's plugin against OpenCode 2.2.6. The signatures below use the
public V2 plugin API types; the examples show the arguments used in runtime
tests.

## Tested method signatures

```ts
interface SessionContext {
  create(
    input?: SessionCreateInput,
    requestOptions?: RequestOptions,
  ): Promise<SessionInfo>

  get(
    input: SessionGetInput,
    requestOptions?: RequestOptions,
  ): Promise<SessionInfo>

  list(
    input: SessionListInput,
    requestOptions?: RequestOptions,
  ): Promise<SessionListResponse>

  prompt(
    input: SessionPromptInput,
    requestOptions?: RequestOptions,
  ): Promise<SessionInboxUser>

  context(
    input: SessionContextInput,
    requestOptions?: RequestOptions,
  ): Promise<readonly SessionMessageInfo[]>

  remove(
    input: SessionRemoveInput,
    requestOptions?: RequestOptions,
  ): Promise<void>

  switchAgent(
    input: SessionSwitchAgentInput,
    requestOptions?: RequestOptions,
  ): Promise<void>
}

interface AgentContext {
  list(
    input?: AgentListInput,
    requestOptions?: RequestOptions,
  ): Promise<AgentListOutput>
}
```

`RequestOptions` is optional on these methods. Input and output types are
provided by `@opencode/plugin` and the OpenCode client; the signatures here are
not a replacement for those types.

## Calls exercised by the plugin

### List agent definitions

```ts
const agents = await ctx.agent.list()
const childAgents = agents.data.filter(
  (agent) =>
    (agent.mode === "subagent" || agent.mode === "all") &&
    agent.hidden === false,
)
const leadAgents = agents.data.filter(
  (agent) =>
    (agent.mode === "primary" || agent.mode === "all") &&
    agent.hidden === false,
)
```

The response's `data` contains agent definitions with fields including `id`,
`name`, `description`, `mode`, and `hidden`. `mode` can be `primary`,
`subagent`, or `all`. Filtering is performed locally after listing. The
Orchestra `list_agent` tool returns visible `subagent` and `all` definitions;
`list_lead` returns visible `primary` and `all` definitions. Runtime testing
returned `general`, `explore`, `developer`, and `reviewer` from `list_agent`,
and `build`, `plan`, and the project-local `coordinator` from `list_lead`.

### Create

```ts
const child = await ctx.session.create({
  id: "ses_worker",
  parentID,
  title: "Worker",
  agent: "build",
  model: { providerID: "openai", id: "gpt-6-luna" },
})
```

The runtime test confirmed that a caller-supplied `id`, `parentID`, `title`,
`agent`, and `model` are accepted and returned on the created session. `id` is
optional; omit it to let OpenCode generate the session ID.

### Get

```ts
const session = await ctx.session.get({ sessionID })
```

Returns the session information, including its ID, parent ID, title, agent,
model, outcome, and timestamps when present.

### List with pagination

```ts
const page = await ctx.session.list({ directory, limit: 100, cursor })
const nextCursor = page.cursor.next
```

`directory`, `limit`, and `cursor` are the fields exercised here. Use
`page.cursor.next` as the next call's `cursor`; the cursor carries the existing
filters. The plugin reads pages and selects sessions whose `parentID` matches
the requested parent. The tested result handling accepts the plugin response's
`sessions` collection and the equivalent `data` collection.

### Prompt

```ts
await ctx.session.prompt({ sessionID, text })
```

`sessionID` and `text` are required. The method was exercised both to start a
new child and to deliver a message to an existing session. Its return value is
the admitted user prompt (`SessionInboxUser`); it does not mean the assistant
has finished processing it.

### Read session context

```ts
const messages = await ctx.session.context({ sessionID })
```

Returns the session's message context. The runtime test verified that assistant
text can be read from the returned message records; the helper also has unit
coverage for the supported message representations.

### Remove

```ts
await ctx.session.remove({ sessionID })
```

Removes the session and its descendants. Runtime testing confirmed deletion of
a child session. Use the child ID, not its parent's ID, when only the child
should be removed.

### Switch agent

```ts
await ctx.session.switchAgent({ sessionID, agent: "plan" })
```

Changes the agent used for subsequent requests in the specified session. The
Orchestra `switch_agent` tool applies this to the calling session; it does not
change requests that have already started. Runtime testing confirmed switching
the current session to the `plan` agent.

## References

- [OpenCode V2 server plugin API](https://opencode.ai/docs/build/plugins/server/)
- [OpenCode plugin SDK source for 2.2.6](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/plugin/src/promise/session.ts)
