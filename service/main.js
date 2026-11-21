// service/main.ts
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
var port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
var serviceToken = process.env.OPENCHAMBER_SERVICE_TOKEN;
if (!Number.isInteger(port) || !serviceToken) {
  throw new Error("Missing OpenChamber service credentials");
}
function orchestraDataDirectory() {
  if (platform() === "darwin")
    return join(homedir(), "Library", "Application Support", "Orchestra");
  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Orchestra");
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "orchestra");
}
var discoveryPath = join(orchestraDataDirectory(), "activation-service.json");
var server = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${serviceToken}`) {
    response.writeHead(401).end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" }).end('{"ready":true}');
    return;
  }
  const match = request.method === "GET" && request.url?.match(/^\/v1\/activations\/([0-9a-f-]{36})$/i);
  const sessionMatch = request.method === "GET" && request.url?.match(/^\/v1\/sessions\/([^/]+)\/team$/);
  const path = match ? `/v1/activations/${match[1]}` : sessionMatch ? request.url : undefined;
  if (!path) {
    response.writeHead(404).end();
    return;
  }
  try {
    const discovery = JSON.parse(await readFile(discoveryPath, "utf8"));
    const endpoint = discovery.url && new URL(discovery.url);
    if (!endpoint || endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !endpoint.port || endpoint.pathname !== "/" || !discovery.token) {
      response.writeHead(503).end();
      return;
    }
    const upstream = await fetch(`${endpoint.origin}${path}`, {
      headers: { authorization: `Bearer ${discovery.token}` },
      signal: AbortSignal.timeout(2500)
    });
    response.writeHead(upstream.status, {
      "content-type": "application/json",
      "cache-control": "no-store"
    }).end(await upstream.text());
  } catch {
    response.writeHead(503, { "content-type": "application/json" }).end('{"error":"service_unavailable"}');
  }
});
server.listen(port, "127.0.0.1");
