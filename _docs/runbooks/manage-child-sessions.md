# OpenCode Plugin Agent and Session Methods

This runbook documents the `ctx.agent` and `ctx.session` methods exercised by
this project's plugin against OpenCode 2.2.6. The signatures below use the
public V2 plugin API types; the examples show the arguments used in runtime
tests.

## Storage API preflight

Before integrating persistent storage into Orchestra, the OpenCode 2.2.6
plugin source was checked at the pinned release tag. It exposes
`ctx.storage` with these Promise-based methods:

```ts
interface StorageDomain {
  get(key: string): Promise<Schema.Json | undefined>
  set(key: string, value: Schema.Json): Promise<void>
  remove(key: string): Promise<void>
}
```

The same release exposes `ctx.event.subscribe()` as an async iterable. Storage
was tested live on OpenCode 2.2.6 with `openai/gpt-6-luna`:

- CRUD round-trip returned `readMissing`, `writeAndRead`, and `remove` as
  `true`.
- The `save` phase wrote a fixed probe value; a separate `opencode run
  --standalone` process ran `verify`, read the same value, and removed it.
  It returned `survivedRestart` and `remove` as `true`.
- A temporary second plugin (`orchestra-storage-isolation-probe`) used the
  same key with a different value. Orchestra could not see that value, both
  plugins read their own values, and both removed their entries successfully.
  The temporary plugin was removed after the test.

The runtime checks confirm persistence between separate CLI processes and
storage isolation by plugin ID. A temporary plugin subscribed to the event
stream and recorded event types per session in four OpenCode 2.2.6 runs,
including 10- and 60-second `sleep` commands while sessions were active. Each
run emitted `session.execution.started` and `session.execution.succeeded`;
none emitted `session.status`. The `retry` status was not tested because no
`session.status` event was observed. The temporary probe and sessions were
removed after testing. Do not rely on the declared `session.status` schema as
proof that the runtime publishes it.

The v2.2.6 source explains the discrepancy: `session.status` is declared in
the status schema, while the session execution lifecycle publishes
`session.execution.started` and one of `succeeded`, `failed`, or `interrupted`.
The event schema also declares `session.retry.scheduled`; that event was not
observed in this test. Treat the execution events as the currently verified
signals, and test retry handling separately before relying on it.

References:

- [Plugin event subscription](https://github.com/anomalyco/opencode/blob/v2.2.6/services/site/src/docs/content/build/plugins/server.mdx)
- [Session status schema](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/schema/src/session-status-event.ts)
- [Session event schemas](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/schema/src/session-event.ts)
- [Execution event publisher](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/core/src/session/execution.ts)

Orchestra now treats a child session as busy after
`session.execution.started`, until `session.execution.succeeded`,
`session.execution.failed`, or `session.execution.interrupted` arrives. This
is process-local tracking; a plugin restart loses in-flight event history,
so the session API timestamps remain the fallback when no start event was
observed.

### Nested Orchestra session creation

A live test created a top-level `Team Lead` session with OpenCode, then used
only Orchestra's `create_agent` tool for all descendants:

```text
Team Lead
├── Domain Lead
│   ├── Developer
│   └── Reviewer
└── Git Master
```

All four child sessions completed successfully on OpenCode 2.2.6 with
`openai/gpt-6-luna`, without changing `experimental.subagent_depth`. This
confirms Orchestra's `create_agent` path can create this nested session tree
even when the native subagent depth limit is unchanged. It does not establish
that OpenCode's native `subagent` tool permits the same nesting. Pass an
explicit model when testing; the configured default model initially failed
with an insufficient-balance error.

### Team state keying

`ctx.storage` accepts a plugin-scoped key, not a session ID or directory
scope. Sessions using the same Orchestra plugin and key therefore address
the same value; do not store all team state under one shared key. The chosen
convention is to key each team by its main session ID (the Team Lead session):

```ts
const key = `team:${mainSessionID}`
await ctx.storage.set(key, { originalAgent, lead, roster, domains })
const team = await ctx.storage.get(key)
await ctx.storage.remove(key)
```

`Schema.Json` supports JSON-serializable objects and arrays. The keying
recommendation is confirmed by a live cross-session test: one temporary
session wrote the probe under a fixed key, and a second temporary session
successfully read and removed it. Thus storage is not automatically
session-isolated; include the Team Lead session ID in each team-state key.
Both temporary sessions were deleted after the test.

Source references for the pinned release:

- [Plugin context](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/plugin/src/promise/plugin.ts)
- [Storage domain](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/plugin/src/promise/storage.ts)
- [Event domain](https://github.com/anomalyco/opencode/blob/v2.2.6/packages/plugin/src/promise/event.ts)

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
