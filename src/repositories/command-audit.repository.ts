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
