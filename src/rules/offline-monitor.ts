import { broadcastRealtimeEvent } from "../realtime/ws-server";
import { withDbClient } from "../repositories/db";
import { InventoryStatus } from "./rules-engine";

type OfflineNodeRow = {
  node_id: string;
  zone_code: string;
  rack_code: string;
  previous_status: InventoryStatus | null;
  new_status: "OFFLINE";
};

type OfflineRackRow = {
  zone_code: string;
  rack_code: string;
  previous_status: InventoryStatus | null;
  new_status: "OFFLINE";
};

export type OfflineMonitorHandle = {
  stop: () => void;
};

async function markNodesOffline(cutoffIso: string): Promise<OfflineNodeRow[]> {
  return withDbClient(async (client) => {
    const result = await client.query<OfflineNodeRow>(
      `
        WITH stale_nodes AS (
          SELECT node_id, zone_code, rack_code, health_status
          FROM inventory_node
          WHERE last_seen_at < $1
            AND health_status <> 'OFFLINE'
        )
        UPDATE inventory_node AS n
        SET health_status = 'OFFLINE'
        FROM stale_nodes
        WHERE n.node_id = stale_nodes.node_id
        RETURNING
          n.node_id,
          n.zone_code,
          n.rack_code,
          stale_nodes.health_status AS previous_status,
          n.health_status AS new_status
      `,
      [cutoffIso]
    );

    return result.rows;
  });
}

async function markRacksOffline(cutoffIso: string): Promise<OfflineRackRow[]> {
  return withDbClient(async (client) => {
    const result = await client.query<OfflineRackRow>(
      `
        WITH stale_racks AS (
          SELECT zone_code, rack_code, environment_status
          FROM inventory_rack
          WHERE last_seen_at < $1
            AND environment_status <> 'OFFLINE'
        )
        UPDATE inventory_rack AS r
        SET environment_status = 'OFFLINE'
        FROM stale_racks
        WHERE r.zone_code = stale_racks.zone_code
          AND r.rack_code = stale_racks.rack_code
        RETURNING
          r.zone_code,
          r.rack_code,
          stale_racks.environment_status AS previous_status,
          r.environment_status AS new_status
      `,
      [cutoffIso]
    );

    return result.rows;
  });
}

export function startOfflineMonitor(args: {
  offlineTimeoutMs: number;
  sweepIntervalMs: number;
}): OfflineMonitorHandle {
  console.log(
    JSON.stringify({
      level: "info",
      event: "offline_monitor_started",
      offline_timeout_ms: args.offlineTimeoutMs,
      offline_sweep_interval_ms: args.sweepIntervalMs
    })
  );

  let stopped = false;
  let running = false;

  const runSweep = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;

    try {
      const cutoffIso = new Date(Date.now() - args.offlineTimeoutMs).toISOString();
      const nodeRows = await markNodesOffline(cutoffIso);
      const rackRows = await markRacksOffline(cutoffIso);

      nodeRows.forEach((row) => {
        console.log(
          JSON.stringify({
            level: "info",
            event: "node_marked_offline",
            node_id: row.node_id,
            zone_code: row.zone_code,
            rack_code: row.rack_code,
            previous_status: row.previous_status,
            new_status: row.new_status
          })
        );

        broadcastRealtimeEvent({
          type: "node_status_changed",
          data: {
            node_id: row.node_id,
            zone_code: row.zone_code,
            rack_code: row.rack_code,
            previous_status: row.previous_status,
            new_status: row.new_status
          }
        });
      });

      rackRows.forEach((row) => {
        console.log(
          JSON.stringify({
            level: "info",
            event: "rack_marked_offline",
            zone_code: row.zone_code,
            rack_code: row.rack_code,
            previous_status: row.previous_status,
            new_status: row.new_status
          })
        );

        broadcastRealtimeEvent({
          type: "rack_status_changed",
          data: {
            zone_code: row.zone_code,
            rack_code: row.rack_code,
            previous_status: row.previous_status,
            new_status: row.new_status
          }
        });
      });

      console.log(
        JSON.stringify({
          level: "info",
          event: "offline_sweep_completed",
          cutoff_iso: cutoffIso,
          nodes_marked_offline: nodeRows.length,
          racks_marked_offline: rackRows.length
        })
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          level: "error",
          event: "offline_monitor_failed",
          message
        })
      );
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void runSweep();
  }, args.sweepIntervalMs);

  void runSweep();

  return {
    stop: () => {
      stopped = true;
      clearInterval(interval);
    }
  };
}
