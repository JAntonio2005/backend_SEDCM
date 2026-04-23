import { ParsedEnvironmentTopic } from "../../mqtt/topic-parser";

const TIMESTAMP_WINDOW_MS = 120_000;

type Primitive = string | number | boolean;

export type EnvironmentTelemetryValidated = {
  timestamp: string;
  eventTimeMs: number;
  metadata: {
    dc_zone: string;
    dc_rack: string;
    extra?: Record<string, Primitive>;
  };
  environment: {
    temperature_c: number;
    humidity_pct: number;
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
  if (value === undefined) return { ok: true, value: undefined };

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

export function validateEnvironmentTelemetryPayload(args: {
  payload: unknown;
  topic: ParsedEnvironmentTopic;
  now?: Date;
}): ValidationResult<EnvironmentTelemetryValidated> {
  const root = asObject(args.payload);
  if (!root) {
    return { ok: false, cause: "invalid_payload_type", detail: "payload must be an object" };
  }

  const rootKeys = assertAllowedKeys({
    obj: root,
    allowed: ["timestamp", "metadata", "environment"],
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
    allowed: ["dc_zone", "dc_rack", "extra"],
    cause: "metadata_unknown_fields"
  });
  if (metadataKeys) return metadataKeys;

  const dcZone = getNonEmptyString({ obj: metadata, key: "dc_zone", cause: "invalid_dc_zone" });
  if (!dcZone.ok) return dcZone;

  const dcRack = getNonEmptyString({ obj: metadata, key: "dc_rack", cause: "invalid_dc_rack" });
  if (!dcRack.ok) return dcRack;

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

  const environment = asObject(root.environment);
  if (!environment) {
    return { ok: false, cause: "missing_environment", detail: "environment is required" };
  }

  const environmentKeys = assertAllowedKeys({
    obj: environment,
    allowed: ["temperature_c", "humidity_pct"],
    cause: "environment_unknown_fields"
  });
  if (environmentKeys) return environmentKeys;

  const temperature = getNumber({
    obj: environment,
    key: "temperature_c",
    cause: "invalid_temperature_c"
  });
  if (!temperature.ok) return temperature;
  if (temperature.value < -10 || temperature.value > 85) {
    return { ok: false, cause: "temperature_c_out_of_range", detail: "allowed -10..85" };
  }

  const humidity = getNumber({
    obj: environment,
    key: "humidity_pct",
    cause: "invalid_humidity_pct"
  });
  if (!humidity.ok) return humidity;
  if (humidity.value < 0 || humidity.value > 100) {
    return { ok: false, cause: "humidity_pct_out_of_range", detail: "allowed 0..100" };
  }

  return {
    ok: true,
    value: {
      timestamp: new Date(eventTimeMs).toISOString(),
      eventTimeMs,
      metadata: {
        dc_zone: dcZone.value,
        dc_rack: dcRack.value,
        extra: extra.value
      },
      environment: {
        temperature_c: temperature.value,
        humidity_pct: humidity.value
      }
    }
  };
}
