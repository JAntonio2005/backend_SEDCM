import { ParsedNodeTopic } from "../../mqtt/topic-parser";

const TIMESTAMP_WINDOW_MS = 120_000;

type Primitive = string | number | boolean;

export type NodeTelemetryValidated = {
  timestamp: string;
  eventTimeMs: number;
  metadata: {
    dc_zone: string;
    dc_rack: string;
    node_id: string;
    extra?: Record<string, Primitive>;
  };
  metrics: {
    cpu_usage_pct: number;
    ram_usage_mb: number;
    net_rx_bytes_sec: number;
    net_tx_bytes_sec: number;
  };
};

export type ValidationSuccess<T> = {
  ok: true;
  value: T;
};

export type ValidationFailure = {
  ok: false;
  cause: string;
  detail?: string;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assertAllowedKeys(args: {
  obj: Record<string, unknown>;
  allowed: string[];
  cause: string;
}): ValidationFailure | null {
  const allowedSet = new Set(args.allowed);
  const unknownKeys = Object.keys(args.obj).filter((key) => !allowedSet.has(key));
  if (unknownKeys.length === 0) return null;
  return {
    ok: false,
    cause: args.cause,
    detail: `unknown keys: ${unknownKeys.join(",")}`
  };
}

function validateExtra(value: unknown): ValidationResult<Record<string, Primitive> | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const extra = asObject(value);
  if (!extra) {
    return {
      ok: false,
      cause: "invalid_metadata_extra_type",
      detail: "metadata.extra must be an object"
    };
  }

  const keys = Object.keys(extra);
  if (keys.length > 10) {
    return {
      ok: false,
      cause: "metadata_extra_too_many_keys",
      detail: `received ${keys.length}, max is 10`
    };
  }

  for (const key of keys) {
    const current = extra[key];
    const primitiveType = typeof current;
    const isPrimitive =
      primitiveType === "string" ||
      primitiveType === "number" ||
      primitiveType === "boolean";
    if (!isPrimitive) {
      return {
        ok: false,
        cause: "invalid_metadata_extra_value",
        detail: `key ${key} must be string/number/boolean`
      };
    }
  }

  return { ok: true, value: extra as Record<string, Primitive> };
}

function getNonEmptyString(args: {
  obj: Record<string, unknown>;
  key: string;
  cause: string;
}): ValidationResult<string> {
  const value = args.obj[args.key];
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      cause: args.cause,
      detail: `${args.key} is required and must be a non-empty string`
    };
  }
  return { ok: true, value: value.trim() };
}

function getNumber(args: {
  obj: Record<string, unknown>;
  key: string;
  cause: string;
}): ValidationResult<number> {
  const value = args.obj[args.key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    return {
      ok: false,
      cause: args.cause,
      detail: `${args.key} must be numeric`
    };
  }
  return { ok: true, value };
}

export function validateNodeTelemetryPayload(args: {
  payload: unknown;
  topic: ParsedNodeTopic;
  now?: Date;
}): ValidationResult<NodeTelemetryValidated> {
  const root = asObject(args.payload);
  if (!root) {
    return { ok: false, cause: "invalid_payload_type", detail: "payload must be an object" };
  }

  const rootKeys = assertAllowedKeys({
    obj: root,
    allowed: ["timestamp", "metadata", "metrics"],
    cause: "payload_unknown_fields"
  });
  if (rootKeys) return rootKeys;

  if (typeof root.timestamp !== "string" || root.timestamp.trim() === "") {
    return { ok: false, cause: "missing_timestamp", detail: "timestamp is required" };
  }

  const eventTimeMs = Date.parse(root.timestamp);
  if (Number.isNaN(eventTimeMs)) {
    return { ok: false, cause: "invalid_timestamp", detail: "timestamp is not parseable" };
  }

  const nowMs = (args.now ?? new Date()).getTime();
  if (Math.abs(nowMs - eventTimeMs) > TIMESTAMP_WINDOW_MS) {
    return {
      ok: false,
      cause: "timestamp_out_of_window",
      detail: `allowed window is +/- ${TIMESTAMP_WINDOW_MS / 1000}s`
    };
  }

  const metadata = asObject(root.metadata);
  if (!metadata) {
    return { ok: false, cause: "missing_metadata", detail: "metadata is required" };
  }

  const metadataKeys = assertAllowedKeys({
    obj: metadata,
    allowed: ["dc_zone", "dc_rack", "node_id", "extra"],
    cause: "metadata_unknown_fields"
  });
  if (metadataKeys) return metadataKeys;

  const dcZone = getNonEmptyString({ obj: metadata, key: "dc_zone", cause: "invalid_dc_zone" });
  if (!dcZone.ok) return dcZone;

  const dcRack = getNonEmptyString({ obj: metadata, key: "dc_rack", cause: "invalid_dc_rack" });
  if (!dcRack.ok) return dcRack;

  const nodeId = getNonEmptyString({ obj: metadata, key: "node_id", cause: "invalid_node_id" });
  if (!nodeId.ok) return nodeId;

  const extra = validateExtra(metadata.extra);
  if (!extra.ok) return extra;

  if (dcZone.value !== args.topic.zoneCode) {
    return {
      ok: false,
      cause: "topic_payload_zone_mismatch",
      detail: `topic=${args.topic.zoneCode} payload=${dcZone.value}`
    };
  }

  if (dcRack.value !== args.topic.rackCode) {
    return {
      ok: false,
      cause: "topic_payload_rack_mismatch",
      detail: `topic=${args.topic.rackCode} payload=${dcRack.value}`
    };
  }

  if (nodeId.value !== args.topic.nodeId) {
    return {
      ok: false,
      cause: "topic_payload_node_mismatch",
      detail: `topic=${args.topic.nodeId} payload=${nodeId.value}`
    };
  }

  const metrics = asObject(root.metrics);
  if (!metrics) {
    return { ok: false, cause: "missing_metrics", detail: "metrics is required" };
  }

  const metricsKeys = assertAllowedKeys({
    obj: metrics,
    allowed: ["cpu_usage_pct", "ram_usage_mb", "net_rx_bytes_sec", "net_tx_bytes_sec"],
    cause: "metrics_unknown_fields"
  });
  if (metricsKeys) return metricsKeys;

  const cpu = getNumber({ obj: metrics, key: "cpu_usage_pct", cause: "invalid_cpu_usage_pct" });
  if (!cpu.ok) return cpu;
  if (cpu.value < 0 || cpu.value > 100) {
    return { ok: false, cause: "cpu_usage_pct_out_of_range", detail: "allowed 0..100" };
  }

  const ram = getNumber({ obj: metrics, key: "ram_usage_mb", cause: "invalid_ram_usage_mb" });
  if (!ram.ok) return ram;
  if (ram.value < 0) {
    return { ok: false, cause: "ram_usage_mb_out_of_range", detail: "must be >= 0" };
  }

  const netRx = getNumber({ obj: metrics, key: "net_rx_bytes_sec", cause: "invalid_net_rx_bytes_sec" });
  if (!netRx.ok) return netRx;
  if (netRx.value < 0) {
    return { ok: false, cause: "net_rx_bytes_sec_out_of_range", detail: "must be >= 0" };
  }

  const netTx = getNumber({ obj: metrics, key: "net_tx_bytes_sec", cause: "invalid_net_tx_bytes_sec" });
  if (!netTx.ok) return netTx;
  if (netTx.value < 0) {
    return { ok: false, cause: "net_tx_bytes_sec_out_of_range", detail: "must be >= 0" };
  }

  return {
    ok: true,
    value: {
      timestamp: new Date(eventTimeMs).toISOString(),
      eventTimeMs,
      metadata: {
        dc_zone: dcZone.value,
        dc_rack: dcRack.value,
        node_id: nodeId.value,
        extra: extra.value
      },
      metrics: {
        cpu_usage_pct: cpu.value,
        ram_usage_mb: ram.value,
        net_rx_bytes_sec: netRx.value,
        net_tx_bytes_sec: netTx.value
      }
    }
  };
}
