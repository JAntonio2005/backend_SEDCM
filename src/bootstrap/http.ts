import http, { IncomingMessage, Server, ServerResponse } from "node:http";
import { MqttClient } from "mqtt";
import {
  CommandDescriptor,
  dispatchManualCommand
} from "../commands/command-dispatcher";
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

type ManualCommandAction = "soft_reboot" | "hard_shutdown" | "set_hvac_mode";
type ManualCommandTargetType = "nodo" | "rack";

type ManualCommandBody = {
  zone_code: string;
  rack_code: string;
  target_type: ManualCommandTargetType;
  target_id: string;
  action: ManualCommandAction;
  reason: string;
  mode?: string;
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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new Error("empty_json_body");
  }

  return JSON.parse(raw);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRequiredString(
  obj: Record<string, unknown>,
  key: string
): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid_${key}`);
  }
  return value.trim();
}

function validateManualCommandBody(payload: unknown): ManualCommandBody {
  const body = asObject(payload);
  if (!body) {
    throw new Error("invalid_json_payload");
  }

  const zoneCode = asRequiredString(body, "zone_code");
  const rackCode = asRequiredString(body, "rack_code");
  const targetType = asRequiredString(body, "target_type") as ManualCommandTargetType;
  const targetId = asRequiredString(body, "target_id");
  const action = asRequiredString(body, "action") as ManualCommandAction;
  const reason = asRequiredString(body, "reason");
  const mode =
    typeof body.mode === "string" && body.mode.trim() !== "" ? body.mode.trim() : undefined;

  if (targetType !== "nodo" && targetType !== "rack") {
    throw new Error("invalid_target_type");
  }

  if (
    action !== "soft_reboot" &&
    action !== "hard_shutdown" &&
    action !== "set_hvac_mode"
  ) {
    throw new Error("invalid_action");
  }

  if (action === "soft_reboot" && targetType !== "nodo") {
    throw new Error("soft_reboot_requires_nodo");
  }

  if (action === "set_hvac_mode") {
    if (targetType !== "rack") {
      throw new Error("set_hvac_mode_requires_rack");
    }

    if (!mode) {
      throw new Error("missing_or_invalid_mode");
    }
  }

  return {
    zone_code: zoneCode,
    rack_code: rackCode,
    target_type: targetType,
    target_id: targetId,
    action,
    reason,
    ...(mode ? { mode } : {})
  };
}

function toCommandDescriptor(body: ManualCommandBody): CommandDescriptor {
  return {
    zoneCode: body.zone_code,
    rackCode: body.rack_code,
    nodeId: body.target_type === "nodo" ? body.target_id : null,
    targetType: body.target_type,
    targetId: body.target_id,
    action: body.action,
    mode: body.mode ?? null,
    reason: body.reason
  };
}

async function handleManualCommandRequest(args: {
  req: IncomingMessage;
  res: ServerResponse;
  cors: CorsConfig;
  getMqttClient: () => MqttClient | undefined;
}): Promise<void> {
  console.log(JSON.stringify({ level: "info", event: "manual_command_requested" }));

  let payload: unknown;

  try {
    payload = await readJsonBody(args.req);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      JSON.stringify({ level: "warn", event: "manual_command_rejected", cause: detail })
    );
    sendError(args.req, args.res, args.cors, 400, "invalid_request_body", detail);
    return;
  }

  let validatedBody: ManualCommandBody;

  try {
    validatedBody = validateManualCommandBody(payload);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      JSON.stringify({ level: "warn", event: "manual_command_rejected", cause: detail })
    );
    sendError(args.req, args.res, args.cors, 400, "invalid_command_payload", detail);
    return;
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "manual_command_validated",
      zone_code: validatedBody.zone_code,
      rack_code: validatedBody.rack_code,
      target_type: validatedBody.target_type,
      target_id: validatedBody.target_id,
      action: validatedBody.action
    })
  );

  const mqttClient = args.getMqttClient();
  if (!mqttClient) {
    console.error(
      JSON.stringify({ level: "error", event: "manual_command_failed", cause: "mqtt_unavailable" })
    );
    sendError(args.req, args.res, args.cors, 503, "mqtt_unavailable");
    return;
  }

  try {
    const result = await dispatchManualCommand({
      client: mqttClient,
      descriptor: toCommandDescriptor(validatedBody)
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "manual_command_published",
        command_id: result.commandId,
        action: result.action,
        mqtt_topic: result.mqttTopic
      })
    );

    sendJson(args.req, args.res, args.cors, 202, {
      command_id: result.commandId,
      action: result.action,
      mqtt_topic: result.mqttTopic,
      ack_status: result.ackStatus
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ level: "error", event: "manual_command_failed", message: detail })
    );
    sendError(args.req, args.res, args.cors, 500, "manual_command_failed", detail);
  }
}

async function handleApiV1Request(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  cors: CorsConfig,
  getMqttClient: () => MqttClient | undefined
): Promise<void> {
  if (url.pathname === "/api/v1/commands") {
    if (req.method !== "POST") {
      sendError(req, res, cors, 405, "method_not_allowed");
      return;
    }

    await handleManualCommandRequest({ req, res, cors, getMqttClient });
    return;
  }

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
  cors: CorsConfig,
  getMqttClient: () => MqttClient | undefined
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
      await handleApiV1Request(req, res, url, cors, getMqttClient);
      return;
    }

    sendError(req, res, cors, 404, "not_found");
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    sendError(req, res, cors, 500, "internal_server_error", detail);
  }
}

export async function startHttpServer(args: {
  port: number;
  corsOrigin: string;
  getMqttClient: () => MqttClient | undefined;
}): Promise<Server> {
  const cors = parseCorsConfig(args.corsOrigin);

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, cors, args.getMqttClient);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.port, () => resolve());
  });

  startWebSocketServer(server);

  return server;
}
