import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createServer as createHttpServer, type Server } from "node:http"
import { createServer as createNetServer } from "node:net"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const root = await mkdtemp(join(tmpdir(), "orchestra-service-config-"))
const dataDirectory = join(root, "data")
// On every platform the service's fallback directory resolves inside this
// fake home, so a pre-fix build cannot find the discovery file by accident.
const fakeHome = join(root, "home")
const serviceToken = "service-token"
const discoveryToken = "upstream-token"

type Recorded = {
  method?: string
  path?: string
  authorization?: string
  body?: string
}

let upstream: Server
let upstreamPort = 0
let recorded: Recorded[] = []
let child: ReturnType<typeof Bun.spawn> | undefined
let servicePort = 0

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

async function writeDiscovery(value: unknown) {
  await writeFile(
    join(dataDirectory, "activation-service.json"),
    JSON.stringify(value),
    { mode: 0o600 },
  )
}

function request(path: string, init: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${servicePort}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${serviceToken}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}

async function waitForService() {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const ready = await request("/health")
      .then((response) => response.ok)
      .catch(() => false)
    if (ready) return
    await Bun.sleep(50)
  }
  const stderr = child
    ? (child.kill(), await new Response(child.stderr).text())
    : ""
  throw new Error(`Service did not start: ${stderr}`)
}

beforeAll(async () => {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 })
  await mkdir(join(fakeHome, "Library", "Application Support", "Orchestra"), {
    recursive: true,
  })

  // Mirrors the plugin route (src/index.ts:100-107): it decodes the ID and
  // looks it up through the host session API, so an ID that changes when
  // decoded is not a host-issued ID and resolves to 503.
  const revalidatesToUnknown = (path?: string) => {
    const segment = path?.match(/^\/v1\/sessions\/([^/]+)\/team$/)?.[1]
    if (segment === undefined) return false
    try {
      return decodeURIComponent(segment) !== segment
    } catch {
      return true
    }
  }

  upstream = createHttpServer(async (request_, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request_) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString("utf8")
    recorded.push({
      path: request_.url,
      authorization: request_.headers.authorization,
      ...(request_.method === "GET"
        ? {}
        : { method: request_.method, ...(body ? { body } : {}) }),
    })
    if (revalidatesToUnknown(request_.url)) {
      response.writeHead(503, { "content-type": "application/json" })
        .end('{"error":"session_status_unavailable"}')
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ active: false, path: request_.url }))
  })
  await new Promise<void>((resolve) => {
    upstream.listen(0, "127.0.0.1", resolve)
  })
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === "string") {
    throw new Error("Upstream stub did not bind")
  }
  upstreamPort = upstreamAddress.port
  await writeDiscovery({
    url: `http://127.0.0.1:${upstreamPort}`,
    token: discoveryToken,
  })

  servicePort = await freePort()
  child = Bun.spawn(["bun", "service/main.ts"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: fakeHome,
      XDG_DATA_HOME: join(fakeHome, "xdg"),
      APPDATA: join(fakeHome, "appdata"),
      ORCHESTRA_DATA_DIRECTORY: dataDirectory,
      OPENCHAMBER_SERVICE_PORT: String(servicePort),
      OPENCHAMBER_SERVICE_TOKEN: serviceToken,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  await waitForService()
})

afterAll(async () => {
  child?.kill()
  await new Promise<void>((resolve) => upstream.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

describe("Orchestra service configuration", () => {
  test("resolves the discovery file from ORCHESTRA_DATA_DIRECTORY", async () => {
    // The platform fallback under the fake home is empty on purpose.
    recorded = []
    const response = await request("/v1/sessions/session-1/team")

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      active: false,
      path: "/v1/sessions/session-1/team",
    })
    expect(recorded).toEqual([{
      path: "/v1/sessions/session-1/team",
      authorization: `Bearer ${discoveryToken}`,
    }])
  })

  test("serves health only to a caller holding the service token", async () => {
    const authorized = await request("/health")
    expect(authorized.status).toBe(200)
    expect(await authorized.json()).toEqual({ ready: true })

    for (const headers of [
      {},
      { authorization: "Bearer wrong-token" },
      { authorization: "Bearer service-tokeX" },
      { authorization: `Bearer ${serviceToken}x` },
      { authorization: "Bearer " },
      { authorization: serviceToken },
    ]) {
      const denied = await fetch(`http://127.0.0.1:${servicePort}/health`, {
        headers,
      })
      expect(denied.status).toBe(401)
    }
  })

  test("rejects unauthenticated proxy requests before contacting upstream", async () => {
    recorded = []
    const response = await fetch(
      `http://127.0.0.1:${servicePort}/v1/sessions/session-1/team`,
      { headers: { authorization: "Bearer wrong-token" } },
    )

    expect(response.status).toBe(401)
    expect(recorded).toEqual([])
  })

  test("rejects unauthenticated requests before upstream", async () => {
    recorded = []
    const response = await fetch(
      `http://127.0.0.1:${servicePort}/v1/sessions/session-1/audit`,
      {
        headers: { authorization: "Bearer wrong-token" },
      },
    )

    expect(response.status).toBe(401)
    expect(recorded).toEqual([])
  })

  test("forwards an opaque valid session ID unchanged on the session route", async () => {
    // The only verified contract is "session ID is a string"
    // (node_modules/@openchamber/sdk/dist/protocol.d.ts declares sessionID as
    // z.ZodString), so the service must not impose a format of its own.
    const sessionIDs = ["session-2", "0b6f6c2e-5a1f-4b0e-9a3d-6f3f6d2b7c11"]
    for (const sessionID of sessionIDs) {
      recorded = []
      const response = await request(`/v1/sessions/${sessionID}/team`)

      expect(response.status).toBe(200)
      expect(recorded.map((item) => item.path)).toEqual([
        `/v1/sessions/${sessionID}/team`,
      ])
    }
  })

  test("forwards encoded IDs undecoded and leaves revalidation to the plugin", async () => {
    // Cross-layer dependency: the service treats the path segment as opaque
    // and neither decodes nor normalizes it. Decoding and validation belong to
    // the plugin, which rejects IDs that do not resolve through the host
    // session API (src/index.ts:100-107). The stub above mirrors that rule, so
    // these inputs are forwarded byte-for-byte and are not accepted sessions.
    for (const segment of ["a%2Fb", "..%2F..%2Fetc"]) {
      recorded = []
      const response = await request(`/v1/sessions/${segment}/team`)

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: "session_status_unavailable",
      })
      expect(recorded.map((item) => item.path)).toEqual([
        `/v1/sessions/${segment}/team`,
      ])
    }
  })

  test("collapses encoded dot segments before routing and fails closed", async () => {
    // WHATWG URL parsing removes %2E%2E as a dot segment before the service
    // sees the request, so this never reaches the session route and is never
    // forwarded: the request resolves to an unknown path and returns 404.
    recorded = []
    const response = await request("/v1/sessions/%2E%2E/team")

    expect(response.status).toBe(404)
    expect(recorded).toEqual([])
  })

  test("rejects malformed session and activation routes without upstream calls", async () => {
    recorded = []
    const requests: Array<[string, string]> = [
      ["GET", "/v1/sessions//team"],
      ["GET", "/v1/sessions/a/b/team"],
      ["GET", "/v1/sessions/session-1/team?"],
      ["GET", "/v1/sessions/session-1/team/extra"],
      ["GET", "/v1/activations/not-a-uuid"],
      ["GET", "/v1/activations/8a4c3f3d-61d2-4b9b-9d27-1c5c64a03c5e/"],
      ["POST", "/v1/sessions/session-1/team"],
      ["POST", "/v1/sessions/session-1/audit"],
      ["POST", "/health"],
      ["GET", "/v1/unknown"],
    ]

    for (const [method, path] of requests) {
      const response = await request(path, { method })
      expect({ method, path, status: response.status })
        .toEqual({ method, path, status: 404 })
    }
    expect(recorded).toEqual([])
  })

  test("forwards the audit GET unchanged", async () => {
    recorded = []
    const response = await request("/v1/sessions/session-1/audit")

    expect(response.status).toBe(200)
    expect(recorded).toEqual([{
      path: "/v1/sessions/session-1/audit",
      authorization: `Bearer ${discoveryToken}`,
    }])
  })

  test("fails closed on a discovery endpoint that fails validation", async () => {
    const unusable = [
      // Live upstream, but an endpoint pathname the service must not accept.
      `http://127.0.0.1:${upstreamPort}/extra`,
      `http://127.0.0.1:${upstreamPort}/v1/sessions`,
      `http://localhost:${upstreamPort}`,
      `https://127.0.0.1:${upstreamPort}`,
    ]
    recorded = []
    try {
      for (const url of unusable) {
        await writeDiscovery({ url, token: discoveryToken })
        const response = await request("/v1/sessions/session-1/team")
        expect({ url, status: response.status }).toEqual({ url, status: 503 })
        expect(recorded).toEqual([])
      }
    } finally {
      await writeDiscovery({
        url: `http://127.0.0.1:${upstreamPort}`,
        token: discoveryToken,
      })
    }
  })
})
