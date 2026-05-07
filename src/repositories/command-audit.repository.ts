import { withDbClient } from "./db";

export type CommandAuditRecord = {
  commandId: string;
  zoneCode: string;
  rackCode: string;
  nodeId: string | null;
  targetType: "nodo" | "rack";
  action: "soft_reboot" | "hard_shutdown" | "set_hvac_mode";
  reason: string;
  mqttTopic: string;
  payload: Record<string, unknown>;
  issuedAt: string;
};

export type CommandAckStatus = "ACKED" | "FAILED";
export type AuditCommandStatus = "PENDING" | "ACKED" | "FAILED";
export type NodeAction = "soft_reboot" | "hard_shutdown";

export type RecentNodeCommand = {
  commandId: string;
  ackStatus: AuditCommandStatus;
  issuedAt: string;
  ageMs: number;
};

export async function hasRecentPendingCommand(args: {
  zoneCode: string;
  rackCode: string;
  nodeId: string | null;
  targetType: "nodo" | "rack";
  action: "soft_reboot" | "hard_shutdown" | "set_hvac_mode";
  reason: string;
  windowSeconds: number;
}): Promise<boolean> {
  return withDbClient(async (client) => {
    const result = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM audit_command_log
          WHERE zone_code = $1
            AND rack_code = $2
            AND node_id IS NOT DISTINCT FROM $3
            AND target_type = $4
            AND action = $5
            AND reason = $6
            AND ack_status = 'PENDING'
            AND issued_at >= now() - make_interval(secs => $7)
        ) AS exists
      `,
      [
        args.zoneCode,
        args.rackCode,
        args.nodeId,
        args.targetType,
        args.action,
        args.reason,
        args.windowSeconds
      ]
    );

    return Boolean(result.rows[0]?.exists);
  });
}

export async function insertCommandAuditRecord(record: CommandAuditRecord): Promise<void> {
  await withDbClient(async (client) => {
    await client.query(
      `
        INSERT INTO audit_command_log (
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
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'PENDING', NULL, NULL
        )
      `,
      [
        record.commandId,
        record.zoneCode,
        record.rackCode,
        record.nodeId,
        record.targetType,
        record.action,
        record.reason,
        record.mqttTopic,
        JSON.stringify(record.payload),
        record.issuedAt
      ]
    );
  });
}

export async function updateCommandAckRecord(args: {
  commandId: string;
  ackStatus: CommandAckStatus;
  timestampAck: string | null;
  ackPayload: Record<string, unknown>;
}): Promise<boolean> {
  return withDbClient(async (client) => {
    const result = await client.query(
      `
        UPDATE audit_command_log
        SET
          ack_status = $2,
          ack_received_at = COALESCE($3::timestamptz, now()),
          ack_payload = $4::jsonb
        WHERE command_id = $1
      `,
      [args.commandId, args.ackStatus, args.timestampAck, JSON.stringify(args.ackPayload)]
    );

    return (result.rowCount ?? 0) > 0;
  });
}

export async function getLatestNodeCommandWithinWindow(args: {
  nodeId: string;
  action: NodeAction;
  windowSeconds: number;
}): Promise<RecentNodeCommand | null> {
  return withDbClient(async (client) => {
    const result = await client.query<{
      command_id: string;
      ack_status: AuditCommandStatus;
      issued_at: string;
      age_ms: number;
    }>(
      `
        SELECT
          command_id,
          ack_status,
          issued_at,
          EXTRACT(EPOCH FROM (now() - issued_at)) * 1000 AS age_ms
        FROM audit_command_log
        WHERE node_id = $1
          AND target_type = 'nodo'
          AND action = $2
          AND issued_at >= now() - make_interval(secs => $3)
        ORDER BY issued_at DESC
        LIMIT 1
      `,
      [args.nodeId, args.action, args.windowSeconds]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      commandId: row.command_id,
      ackStatus: row.ack_status,
      issuedAt: row.issued_at,
      ageMs: Number(row.age_ms)
    };
  });
}

export async function hasRecentNodeCommandByStatuses(args: {
  nodeId: string;
  action: NodeAction;
  statuses: AuditCommandStatus[];
  windowSeconds: number;
}): Promise<boolean> {
  if (args.statuses.length === 0) return false;

  return withDbClient(async (client) => {
    const result = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM audit_command_log
          WHERE node_id = $1
            AND target_type = 'nodo'
            AND action = $2
            AND ack_status = ANY($3::text[])
            AND issued_at >= now() - make_interval(secs => $4)
        ) AS exists
      `,
      [args.nodeId, args.action, args.statuses, args.windowSeconds]
    );

    return Boolean(result.rows[0]?.exists);
  });
}
