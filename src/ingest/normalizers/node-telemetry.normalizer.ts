import { NodeTelemetryValidated } from "../validators/node-telemetry.validator";

export type NodeTelemetryNormalized = {
  timestamp: string;
  metadata: {
    dc_zone: string;
    dc_rack: string;
    node_id: string;
    extra?: Record<string, string | number | boolean>;
  };
  metrics: {
    cpu_usage_pct: number;
    ram_usage_mb: number;
    net_rx_bytes_sec: number;
    net_tx_bytes_sec: number;
  };
  out_of_order: boolean;
};

export function normalizeNodeTelemetry(args: {
  validated: NodeTelemetryValidated;
  previousEventTimeMs?: number;
}): NodeTelemetryNormalized {
  const outOfOrder =
    typeof args.previousEventTimeMs === "number" &&
    args.validated.eventTimeMs < args.previousEventTimeMs;

  return {
    timestamp: args.validated.timestamp,
    metadata: {
      dc_zone: args.validated.metadata.dc_zone,
      dc_rack: args.validated.metadata.dc_rack,
      node_id: args.validated.metadata.node_id,
      extra: args.validated.metadata.extra
    },
    metrics: {
      cpu_usage_pct: args.validated.metrics.cpu_usage_pct,
      ram_usage_mb: args.validated.metrics.ram_usage_mb,
      net_rx_bytes_sec: args.validated.metrics.net_rx_bytes_sec,
      net_tx_bytes_sec: args.validated.metrics.net_tx_bytes_sec
    },
    out_of_order: outOfOrder
  };
}
