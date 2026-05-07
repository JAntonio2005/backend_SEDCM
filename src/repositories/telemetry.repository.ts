import { EnvironmentTelemetryNormalized } from "../ingest/normalizers/environment-telemetry.normalizer";
import { NodeTelemetryNormalized } from "../ingest/normalizers/node-telemetry.normalizer";
import { withDbClient } from "./db";

function asIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function asBigIntCompatible(value: number): number {
  return Math.trunc(value);
}

export async function persistNodeTelemetry(args: {
  normalized: NodeTelemetryNormalized;
}): Promise<void> {
  const eventTime = asIsoTimestamp(args.normalized.timestamp);
  const zoneCode = args.normalized.metadata.dc_zone;
  const rackCode = args.normalized.metadata.dc_rack;
  const nodeId = args.normalized.metadata.node_id;

  await withDbClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `
          INSERT INTO inventory_zone (zone_code, first_seen_at, last_seen_at)
          VALUES ($1, $2, $2)
          ON CONFLICT (zone_code)
          DO UPDATE SET
            last_seen_at = GREATEST(inventory_zone.last_seen_at, EXCLUDED.last_seen_at)
        `,
        [zoneCode, eventTime]
      );

      await client.query(
        `
          INSERT INTO inventory_rack (zone_code, rack_code, first_seen_at, last_seen_at)
          VALUES ($1, $2, $3, $3)
          ON CONFLICT (zone_code, rack_code)
          DO UPDATE SET
            last_seen_at = GREATEST(inventory_rack.last_seen_at, EXCLUDED.last_seen_at)
        `,
        [zoneCode, rackCode, eventTime]
      );

      await client.query(
        `
          INSERT INTO inventory_node (
            node_id, zone_code, rack_code, source_type, first_seen_at, last_seen_at
          )
          VALUES ($1, $2, $3, $4, $5, $5)
          ON CONFLICT (node_id)
          DO UPDATE SET
            zone_code = EXCLUDED.zone_code,
            rack_code = EXCLUDED.rack_code,
            source_type = EXCLUDED.source_type,
            last_seen_at = GREATEST(inventory_node.last_seen_at, EXCLUDED.last_seen_at)
        `,
        [nodeId, zoneCode, rackCode, "edge_collector", eventTime]
      );

      await client.query(
        `
          INSERT INTO telemetry_node (
            event_time,
            zone_code,
            rack_code,
            node_id,
            cpu_usage_pct,
            ram_usage_mb,
            net_rx_bytes_sec,
            net_tx_bytes_sec,
            out_of_order
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          eventTime,
          zoneCode,
          rackCode,
          nodeId,
          args.normalized.metrics.cpu_usage_pct,
          args.normalized.metrics.ram_usage_mb,
          asBigIntCompatible(args.normalized.metrics.net_rx_bytes_sec),
          asBigIntCompatible(args.normalized.metrics.net_tx_bytes_sec),
          args.normalized.out_of_order
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function persistEnvironmentTelemetry(args: {
  normalized: EnvironmentTelemetryNormalized;
}): Promise<void> {
  const eventTime = asIsoTimestamp(args.normalized.timestamp);
  const zoneCode = args.normalized.metadata.dc_zone;
  const rackCode = args.normalized.metadata.dc_rack;

  await withDbClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `
          INSERT INTO inventory_zone (zone_code, first_seen_at, last_seen_at)
          VALUES ($1, $2, $2)
          ON CONFLICT (zone_code)
          DO UPDATE SET
            last_seen_at = GREATEST(inventory_zone.last_seen_at, EXCLUDED.last_seen_at)
        `,
        [zoneCode, eventTime]
      );

      await client.query(
        `
          INSERT INTO inventory_rack (zone_code, rack_code, first_seen_at, last_seen_at)
          VALUES ($1, $2, $3, $3)
          ON CONFLICT (zone_code, rack_code)
          DO UPDATE SET
            last_seen_at = GREATEST(inventory_rack.last_seen_at, EXCLUDED.last_seen_at)
        `,
        [zoneCode, rackCode, eventTime]
      );

      await client.query(
        `
          INSERT INTO telemetry_environment (
            event_time,
            zone_code,
            rack_code,
            temperature_c,
            humidity_pct,
            out_of_order
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          eventTime,
          zoneCode,
          rackCode,
          args.normalized.environment.temperature_c,
          args.normalized.environment.humidity_pct,
          args.normalized.out_of_order
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
