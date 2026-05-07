import { withDbClient } from "./db";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export type InventoryNodeView = {
  node_id: string;
  health_status: string;
  source_type: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type InventoryRackView = {
  rack_code: string;
  environment_status: string;
  first_seen_at: string;
  last_seen_at: string;
  nodes: InventoryNodeView[];
};

export type InventoryZoneView = {
  zone_code: string;
  first_seen_at: string;
  last_seen_at: string;
  racks: InventoryRackView[];
};

export type NodeListItem = {
  node_id: string;
  zone_code: string;
  rack_code: string;
  source_type: string;
  health_status: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type RackListItem = {
  zone_code: string;
  rack_code: string;
  environment_status: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type NodeTelemetryQuery = {
  nodeId: string | null;
  zoneCode: string | null;
  rackCode: string | null;
  limit: number;
};

export type EnvironmentTelemetryQuery = {
  zoneCode: string | null;
  rackCode: string | null;
  limit: number;
};

export type AuditCommandsQuery = {
  zoneCode: string | null;
  rackCode: string | null;
  nodeId: string | null;
  ackStatus: string | null;
  action: string | null;
  limit: number;
};

export type NodeTelemetryItem = {
  id: number;
  event_time: string;
  zone_code: string;
  rack_code: string;
  node_id: string;
  cpu_usage_pct: number;
  ram_usage_mb: number;
  net_rx_bytes_sec: number;
  net_tx_bytes_sec: number;
  out_of_order: boolean;
  ingested_at: string;
};

export type EnvironmentTelemetryItem = {
  id: number;
  event_time: string;
  zone_code: string;
  rack_code: string;
  temperature_c: number;
  humidity_pct: number;
  out_of_order: boolean;
  ingested_at: string;
};

export type AuditCommandItem = {
  id: number;
  command_id: string;
  zone_code: string;
  rack_code: string;
  node_id: string | null;
  target_type: string;
  action: string;
  reason: string;
  mqtt_topic: string;
  payload: Record<string, unknown>;
  issued_at: string;
  ack_status: string;
  ack_received_at: string | null;
  ack_payload: Record<string, unknown> | null;
};

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function normalizeLimit(rawLimit: string | null): number {
  if (!rawLimit) return DEFAULT_LIMIT;
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  const rounded = Math.trunc(parsed);
  if (rounded > MAX_LIMIT) return MAX_LIMIT;
  return rounded;
}

export async function fetchInventoryHierarchy(): Promise<InventoryZoneView[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      zone_code: string;
      zone_first_seen_at: Date | string;
      zone_last_seen_at: Date | string;
      rack_code: string | null;
      environment_status: string | null;
      rack_first_seen_at: Date | string | null;
      rack_last_seen_at: Date | string | null;
      node_id: string | null;
      health_status: string | null;
      source_type: string | null;
      node_first_seen_at: Date | string | null;
      node_last_seen_at: Date | string | null;
    }>(
      `
        SELECT
          z.zone_code,
          z.first_seen_at AS zone_first_seen_at,
          z.last_seen_at AS zone_last_seen_at,
          r.rack_code,
          r.environment_status,
          r.first_seen_at AS rack_first_seen_at,
          r.last_seen_at AS rack_last_seen_at,
          n.node_id,
          n.health_status,
          n.source_type,
          n.first_seen_at AS node_first_seen_at,
          n.last_seen_at AS node_last_seen_at
        FROM inventory_zone z
        LEFT JOIN inventory_rack r
          ON r.zone_code = z.zone_code
        LEFT JOIN inventory_node n
          ON n.zone_code = r.zone_code
         AND n.rack_code = r.rack_code
        ORDER BY z.zone_code, r.rack_code, n.node_id
      `
    );

    const zoneMap = new Map<
      string,
      InventoryZoneView & { rackMap: Map<string, InventoryRackView> }
    >();

    for (const row of result.rows) {
      const existingZone = zoneMap.get(row.zone_code);
      const zone =
        existingZone ??
        {
          zone_code: row.zone_code,
          first_seen_at: toIso(row.zone_first_seen_at) ?? "",
          last_seen_at: toIso(row.zone_last_seen_at) ?? "",
          racks: [],
          rackMap: new Map<string, InventoryRackView>()
        };

      if (!existingZone) {
        zoneMap.set(zone.zone_code, zone);
      }

      if (!row.rack_code) {
        continue;
      }

      const existingRack = zone.rackMap.get(row.rack_code);
      const rack =
        existingRack ??
        {
          rack_code: row.rack_code,
          environment_status: row.environment_status ?? "Normal",
          first_seen_at: toIso(row.rack_first_seen_at) ?? "",
          last_seen_at: toIso(row.rack_last_seen_at) ?? "",
          nodes: []
        };

      if (!existingRack) {
        zone.rackMap.set(rack.rack_code, rack);
        zone.racks.push(rack);
      }

      if (!row.node_id) {
        continue;
      }

      rack.nodes.push({
        node_id: row.node_id,
        health_status: row.health_status ?? "Normal",
        source_type: row.source_type ?? "unknown",
        first_seen_at: toIso(row.node_first_seen_at) ?? "",
        last_seen_at: toIso(row.node_last_seen_at) ?? ""
      });
    }

    return [...zoneMap.values()].map(({ rackMap: _rackMap, ...zone }) => zone);
  });
}

export async function fetchNodes(limit: number): Promise<NodeListItem[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      node_id: string;
      zone_code: string;
      rack_code: string;
      source_type: string;
      health_status: string;
      first_seen_at: Date | string;
      last_seen_at: Date | string;
    }>(
      `
        SELECT
          node_id,
          zone_code,
          rack_code,
          source_type,
          health_status,
          first_seen_at,
          last_seen_at
        FROM inventory_node
        ORDER BY zone_code, rack_code, node_id
        LIMIT $1
      `
      ,
      [limit]
    );

    return result.rows.map((row) => ({
      node_id: row.node_id,
      zone_code: row.zone_code,
      rack_code: row.rack_code,
      source_type: row.source_type,
      health_status: row.health_status,
      first_seen_at: toIso(row.first_seen_at) ?? "",
      last_seen_at: toIso(row.last_seen_at) ?? ""
    }));
  });
}

export async function fetchRacks(limit: number): Promise<RackListItem[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      zone_code: string;
      rack_code: string;
      environment_status: string;
      first_seen_at: Date | string;
      last_seen_at: Date | string;
    }>(
      `
        SELECT
          zone_code,
          rack_code,
          environment_status,
          first_seen_at,
          last_seen_at
        FROM inventory_rack
        ORDER BY zone_code, rack_code
        LIMIT $1
      `
      ,
      [limit]
    );

    return result.rows.map((row) => ({
      zone_code: row.zone_code,
      rack_code: row.rack_code,
      environment_status: row.environment_status,
      first_seen_at: toIso(row.first_seen_at) ?? "",
      last_seen_at: toIso(row.last_seen_at) ?? ""
    }));
  });
}

export async function fetchNodeTelemetry(query: NodeTelemetryQuery): Promise<NodeTelemetryItem[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      id: number;
      event_time: Date | string;
      zone_code: string;
      rack_code: string;
      node_id: string;
      cpu_usage_pct: string | number;
      ram_usage_mb: string | number;
      net_rx_bytes_sec: string | number;
      net_tx_bytes_sec: string | number;
      out_of_order: boolean;
      ingested_at: Date | string;
    }>(
      `
        SELECT
          id,
          event_time,
          zone_code,
          rack_code,
          node_id,
          cpu_usage_pct,
          ram_usage_mb,
          net_rx_bytes_sec,
          net_tx_bytes_sec,
          out_of_order,
          ingested_at
        FROM telemetry_node
        WHERE ($1::text IS NULL OR node_id = $1)
          AND ($2::text IS NULL OR zone_code = $2)
          AND ($3::text IS NULL OR rack_code = $3)
        ORDER BY event_time DESC
        LIMIT $4
      `,
      [query.nodeId, query.zoneCode, query.rackCode, query.limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      event_time: toIso(row.event_time) ?? "",
      zone_code: row.zone_code,
      rack_code: row.rack_code,
      node_id: row.node_id,
      cpu_usage_pct: toNumber(row.cpu_usage_pct),
      ram_usage_mb: toNumber(row.ram_usage_mb),
      net_rx_bytes_sec: toNumber(row.net_rx_bytes_sec),
      net_tx_bytes_sec: toNumber(row.net_tx_bytes_sec),
      out_of_order: row.out_of_order,
      ingested_at: toIso(row.ingested_at) ?? ""
    }));
  });
}

export async function fetchEnvironmentTelemetry(
  query: EnvironmentTelemetryQuery
): Promise<EnvironmentTelemetryItem[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      id: number;
      event_time: Date | string;
      zone_code: string;
      rack_code: string;
      temperature_c: string | number;
      humidity_pct: string | number;
      out_of_order: boolean;
      ingested_at: Date | string;
    }>(
      `
        SELECT
          id,
          event_time,
          zone_code,
          rack_code,
          temperature_c,
          humidity_pct,
          out_of_order,
          ingested_at
        FROM telemetry_environment
        WHERE ($1::text IS NULL OR zone_code = $1)
          AND ($2::text IS NULL OR rack_code = $2)
        ORDER BY event_time DESC
        LIMIT $3
      `,
      [query.zoneCode, query.rackCode, query.limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      event_time: toIso(row.event_time) ?? "",
      zone_code: row.zone_code,
      rack_code: row.rack_code,
      temperature_c: toNumber(row.temperature_c),
      humidity_pct: toNumber(row.humidity_pct),
      out_of_order: row.out_of_order,
      ingested_at: toIso(row.ingested_at) ?? ""
    }));
  });
}

export async function fetchAuditCommands(query: AuditCommandsQuery): Promise<AuditCommandItem[]> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      id: number;
      command_id: string;
      zone_code: string;
      rack_code: string;
      node_id: string | null;
      target_type: string;
      action: string;
      reason: string;
      mqtt_topic: string;
      payload: Record<string, unknown>;
      issued_at: Date | string;
      ack_status: string;
      ack_received_at: Date | string | null;
      ack_payload: Record<string, unknown> | null;
    }>(
      `
        SELECT
          id,
          command_id,
          zone_code,
          rack_code,
          node_id,
          target_type,
          action,
          reason,
          mqtt_topic,
          payload,
          issued_at,
          ack_status,
          ack_received_at,
          ack_payload
        FROM audit_command_log
        WHERE ($1::text IS NULL OR zone_code = $1)
          AND ($2::text IS NULL OR rack_code = $2)
          AND ($3::text IS NULL OR node_id = $3)
          AND ($4::text IS NULL OR ack_status = $4)
          AND ($5::text IS NULL OR action = $5)
        ORDER BY issued_at DESC
        LIMIT $6
      `,
      [
        query.zoneCode,
        query.rackCode,
        query.nodeId,
        query.ackStatus,
        query.action,
        query.limit
      ]
    );

    return result.rows.map((row) => ({
      id: row.id,
      command_id: row.command_id,
      zone_code: row.zone_code,
      rack_code: row.rack_code,
      node_id: row.node_id,
      target_type: row.target_type,
      action: row.action,
      reason: row.reason,
      mqtt_topic: row.mqtt_topic,
      payload: row.payload,
      issued_at: toIso(row.issued_at) ?? "",
      ack_status: row.ack_status,
      ack_received_at: toIso(row.ack_received_at),
      ack_payload: row.ack_payload
    }));
  });
}
