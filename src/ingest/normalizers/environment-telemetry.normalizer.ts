import { EnvironmentTelemetryValidated } from "../validators/environment-telemetry.validator";

export type EnvironmentTelemetryNormalized = {
  timestamp: string;
  metadata: {
    dc_zone: string;
    dc_rack: string;
    extra?: Record<string, string | number | boolean>;
  };
  environment: {
    temperature_c: number;
    humidity_pct: number;
  };
  out_of_order: boolean;
};

export function normalizeEnvironmentTelemetry(args: {
  validated: EnvironmentTelemetryValidated;
  previousEventTimeMs?: number;
}): EnvironmentTelemetryNormalized {
  const outOfOrder =
    typeof args.previousEventTimeMs === "number" &&
    args.validated.eventTimeMs < args.previousEventTimeMs;

  return {
    timestamp: args.validated.timestamp,
    metadata: {
      dc_zone: args.validated.metadata.dc_zone,
      dc_rack: args.validated.metadata.dc_rack,
      extra: args.validated.metadata.extra
    },
    environment: {
      temperature_c: args.validated.environment.temperature_c,
      humidity_pct: args.validated.environment.humidity_pct
    },
    out_of_order: outOfOrder
  };
}
