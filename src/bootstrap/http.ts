import http, { IncomingMessage, Server, ServerResponse } from "node:http";
import {
  fetchAuditCommands,
  fetchEnvironmentTelemetry,
  fetchInventoryHierarchy,
  fetchNodeTelemetry,
  fetchNodes,
  fetchRacks,
  normalizeLimit
} from "../repositories/query.repository";

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, statusCode: number, error: string, detail?: string): void {
  sendJson(res, statusCode, {
    error,
    ...(detail ? { detail } : {})
  });
}

function asOptionalQueryParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function healthcheck(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { status: "ok", service: "backend-sedcm-ingesta" });
}

async function handleApiV1Request(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (req.method !== "GET") {
    sendError(res, 405, "method_not_allowed");
    return;
  }

  if (url.pathname === "/api/v1/inventory") {
    const zones = await fetchInventoryHierarchy();
    sendJson(res, 200, { zones });
    return;
  }

  if (url.pathname === "/api/v1/nodes") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchNodes(limit);
    sendJson(res, 200, { items, limit });
    return;
  }

  if (url.pathname === "/api/v1/racks") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchRacks(limit);
    sendJson(res, 200, { items, limit });
    return;
  }

  if (url.pathname === "/api/v1/telemetry/node") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchNodeTelemetry({
      nodeId: asOptionalQueryParam(url, "node_id"),
      zoneCode: asOptionalQueryParam(url, "zone_code"),
      rackCode: asOptionalQueryParam(url, "rack_code"),
      limit
    });

    sendJson(res, 200, { items, limit });
    return;
  }

  if (url.pathname === "/api/v1/telemetry/environment") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchEnvironmentTelemetry({
      zoneCode: asOptionalQueryParam(url, "zone_code"),
      rackCode: asOptionalQueryParam(url, "rack_code"),
      limit
    });

    sendJson(res, 200, { items, limit });
    return;
  }

  if (url.pathname === "/api/v1/audit/commands") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchAuditCommands({
      zoneCode: asOptionalQueryParam(url, "zone_code"),
      rackCode: asOptionalQueryParam(url, "rack_code"),
      nodeId: asOptionalQueryParam(url, "node_id"),
      ackStatus: asOptionalQueryParam(url, "ack_status"),
      action: asOptionalQueryParam(url, "action"),
      limit
    });

    sendJson(res, 200, { items, limit });
    return;
  }

  sendError(res, 404, "not_found");
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/health") {
      healthcheck(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/v1/")) {
      await handleApiV1Request(req, res, url);
      return;
    }

    sendError(res, 404, "not_found");
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    sendError(res, 500, "internal_server_error", detail);
  }
}

export async function startHttpServer(port: number): Promise<Server> {
  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });

  return server;
}
