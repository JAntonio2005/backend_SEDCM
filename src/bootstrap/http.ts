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
import { startWebSocketServer } from "../realtime/ws-server";

type CorsConfig = {
  allowAny: boolean;
  allowedOrigins: string[];
  allowedOriginsSet: Set<string>;
};

function parseCorsConfig(raw: string): CorsConfig {
  const trimmed = raw.trim();

  if (trimmed === "*") {
    return {
      allowAny: true,
      allowedOrigins: [],
      allowedOriginsSet: new Set<string>()
    };
  }

  const allowedOrigins = trimmed
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");

  return {
    allowAny: false,
    allowedOrigins,
    allowedOriginsSet: new Set(allowedOrigins)
  };
}

function resolveAllowOrigin(req: IncomingMessage, cors: CorsConfig): string {
  if (cors.allowAny) return "*";

  const requestOrigin = req.headers.origin;
  if (typeof requestOrigin === "string" && cors.allowedOriginsSet.has(requestOrigin)) {
    return requestOrigin;
  }

  return cors.allowedOrigins[0] ?? "http://127.0.0.1:5173";
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse, cors: CorsConfig): void {
  const allowOrigin = resolveAllowOrigin(req, cors);

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Vary", "Origin");
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  cors: CorsConfig,
  statusCode: number,
  payload: unknown
): void {
  applyCorsHeaders(req, res, cors);
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(
  req: IncomingMessage,
  res: ServerResponse,
  cors: CorsConfig,
  statusCode: number,
  error: string,
  detail?: string
): void {
  sendJson(req, res, cors, statusCode, {
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

async function handleApiV1Request(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  cors: CorsConfig
): Promise<void> {
  if (req.method !== "GET") {
    sendError(req, res, cors, 405, "method_not_allowed");
    return;
  }

  if (url.pathname === "/api/v1/inventory") {
    const zones = await fetchInventoryHierarchy();
    sendJson(req, res, cors, 200, { zones });
    return;
  }

  if (url.pathname === "/api/v1/nodes") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchNodes(limit);
    sendJson(req, res, cors, 200, { items, limit });
    return;
  }

  if (url.pathname === "/api/v1/racks") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchRacks(limit);
    sendJson(req, res, cors, 200, { items, limit });
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

    sendJson(req, res, cors, 200, { items, limit });
    return;
  }

  if (url.pathname === "/api/v1/telemetry/environment") {
    const limit = normalizeLimit(asOptionalQueryParam(url, "limit"));
    const items = await fetchEnvironmentTelemetry({
      zoneCode: asOptionalQueryParam(url, "zone_code"),
      rackCode: asOptionalQueryParam(url, "rack_code"),
      limit
    });

    sendJson(req, res, cors, 200, { items, limit });
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

    sendJson(req, res, cors, 200, { items, limit });
    return;
  }

  sendError(req, res, cors, 404, "not_found");
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cors: CorsConfig
): Promise<void> {
  try {
    if (req.method === "OPTIONS") {
      applyCorsHeaders(req, res, cors);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(req, res, cors, 200, { status: "ok", service: "backend-sedcm-ingesta" });
      return;
    }

    if (url.pathname.startsWith("/api/v1/")) {
      await handleApiV1Request(req, res, url, cors);
      return;
    }

    sendError(req, res, cors, 404, "not_found");
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    sendError(req, res, cors, 500, "internal_server_error", detail);
  }
}

export async function startHttpServer(args: { port: number; corsOrigin: string }): Promise<Server> {
  const cors = parseCorsConfig(args.corsOrigin);

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, cors);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.port, () => resolve());
  });

  startWebSocketServer(server);

  return server;
}