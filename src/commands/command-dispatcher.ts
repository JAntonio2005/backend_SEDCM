import { randomUUID } from "node:crypto";
import { MqttClient } from "mqtt";
import { EnvironmentTelemetryNormalized } from "../ingest/normalizers/environment-telemetry.normalizer";
import { NodeTelemetryNormalized } from "../ingest/normalizers/node-telemetry.normalizer";
import {
  getLatestNodeCommandWithinWindow,
  hasRecentNodeCommandByStatuses,
  hasRecentPendingCommand,
  insertCommandAuditRecord
} from "../repositories/command-audit.repository";
import { broadcastRealtimeEvent } from "../realtime/ws-server";
import { RuleStatus } from "../rules/rules-engine";

const PENDING_DEDUP_WINDOW_SECONDS = 300;
const RECENT_NODE_COMMAND_WINDOW_SECONDS = 300;
const DEFAULT_NODE_ESCALATION_GRACE_MS = 30000;

type CommandAction = "soft_reboot" | "hard_shutdown" | "set_hvac_mode";
type CommandTargetType = "nodo" | "rack";

type CommandDescriptor = {
  zoneCode: string;
  rackCode: string;
  nodeId: string | null;
  targetType: CommandTargetType;
  targetId: string;
  action: CommandAction;
  reason: string;
};

function buildCommandTopic(zoneCode: string, rackCode: string): string {
  return `dc/control/zona/${zoneCode}/rack/${rackCode}`;
}

function buildPayload(args: {
  commandId: string;
  issuedAt: string;
  descriptor: CommandDescriptor;
}): Record<string, unknown> {
  return {
    command_id: args.commandId,
    timestamp_issued: args.issuedAt,
    target: {
      dc_zone: args.descriptor.zoneCode,
      dc_rack: args.descriptor.rackCode,
      target_type: args.descriptor.targetType,
      target_id: args.descriptor.targetId
    },
    action: args.descriptor.action,
    reason: args.descriptor.reason
  };
}

function publishCommand(args: {
  client: MqttClient;
  topic: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    args.client.publish(args.topic, JSON.stringify(args.payload), { qos: 0 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function selectEnvironmentCommand(args: {
  telemetry: EnvironmentTelemetryNormalized;
  status: RuleStatus;
}): CommandDescriptor | null {
  const zoneCode = args.telemetry.metadata.dc_zone;
  const rackCode = args.telemetry.metadata.dc_rack;
  const temperature = args.telemetry.environment.temperature_c;
  const humidity = args.telemetry.environment.humidity_pct;

  if (args.status === "Critico") {
    return {
      zoneCode,
      rackCode,
      nodeId: null,
      targetType: "rack",
      targetId: rackCode,
      action: "hard_shutdown",
      reason: "environment_critical_hard_shutdown"
    };
  }

  if (humidity < 40) {
    return {
      zoneCode,
      rackCode,
      nodeId: null,
      targetType: "rack",
      targetId: rackCode,
      action: "set_hvac_mode",
      reason: "humidity_low_set_hvac_humidify"
    };
  }

  if (humidity > 60) {
    return {
      zoneCode,
      rackCode,
      nodeId: null,
      targetType: "rack",
      targetId: rackCode,
      action: "set_hvac_mode",
      reason: "humidity_high_set_hvac_dehumidify"
    };
  }

  if (temperature >= 28 && temperature <= 44) {
    return {
      zoneCode,
      rackCode,
      nodeId: null,
      targetType: "rack",
      targetId: rackCode,
      action: "set_hvac_mode",
      reason: "temperature_warning_set_hvac_cooling"
    };
  }

  return null;
}

async function dispatchWithAudit(args: {
  client: MqttClient;
  descriptor: CommandDescriptor;
  source: "node" | "environment";
  topic: string;
}): Promise<void> {
  const mqttTopic = buildCommandTopic(args.descriptor.zoneCode, args.descriptor.rackCode);
  const issuedAt = new Date().toISOString();
  const commandId = randomUUID();
  const payload = buildPayload({
    commandId,
    issuedAt,
    descriptor: args.descriptor
  });

  console.log(
    JSON.stringify({
      level: "info",
      event: "command_dispatch_requested",
      source: args.source,
      input_topic: args.topic,
      mqtt_topic: mqttTopic,
      action: args.descriptor.action,
      target_type: args.descriptor.targetType,
      target_id: args.descriptor.targetId,
      reason: args.descriptor.reason
    })
  );

  try {
    const skip = await hasRecentPendingCommand({
      zoneCode: args.descriptor.zoneCode,
      rackCode: args.descriptor.rackCode,
      nodeId: args.descriptor.nodeId,
      targetType: args.descriptor.targetType,
      action: args.descriptor.action,
      reason: args.descriptor.reason,
      windowSeconds: PENDING_DEDUP_WINDOW_SECONDS
    });

    if (skip) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "command_dispatch_skipped",
          source: args.source,
          mqtt_topic: mqttTopic,
          action: args.descriptor.action,
          target_type: args.descriptor.targetType,
          target_id: args.descriptor.targetId,
          reason: args.descriptor.reason
        })
      );
      return;
    }

    await publishCommand({
      client: args.client,
      topic: mqttTopic,
      payload
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "command_published",
        source: args.source,
        command_id: commandId,
        mqtt_topic: mqttTopic,
        action: args.descriptor.action
      })
    );

    broadcastRealtimeEvent({
      type: "command_published",
      data: {
        command_id: commandId,
        mqtt_topic: mqttTopic,
        action: args.descriptor.action,
        reason: args.descriptor.reason,
        target_type: args.descriptor.targetType,
        target_id: args.descriptor.targetId,
        zone_code: args.descriptor.zoneCode,
        rack_code: args.descriptor.rackCode,
        node_id: args.descriptor.nodeId
      }
    });

    await insertCommandAuditRecord({
      commandId,
      zoneCode: args.descriptor.zoneCode,
      rackCode: args.descriptor.rackCode,
      nodeId: args.descriptor.nodeId,
      targetType: args.descriptor.targetType,
      action: args.descriptor.action,
      reason: args.descriptor.reason,
      mqttTopic,
      payload,
      issuedAt
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "command_audit_recorded",
        source: args.source,
        command_id: commandId
      })
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "command_dispatch_failed",
        source: args.source,
        action: args.descriptor.action,
        target_type: args.descriptor.targetType,
        target_id: args.descriptor.targetId,
        message
      })
    );
  }
}

function buildNodeSoftRebootDescriptor(args: {
  zoneCode: string;
  rackCode: string;
  nodeId: string;
}): CommandDescriptor {
  return {
    zoneCode: args.zoneCode,
    rackCode: args.rackCode,
    nodeId: args.nodeId,
    targetType: "nodo",
    targetId: args.nodeId,
    action: "soft_reboot",
    reason: "node_critical_soft_reboot"
  };
}

function buildNodeHardShutdownDescriptor(args: {
  zoneCode: string;
  rackCode: string;
  nodeId: string;
}): CommandDescriptor {
  return {
    zoneCode: args.zoneCode,
    rackCode: args.rackCode,
    nodeId: args.nodeId,
    targetType: "nodo",
    targetId: args.nodeId,
    action: "hard_shutdown",
    reason: "node_critical_persistent_hard_shutdown"
  };
}

export async function dispatchNodeCommandIfNeeded(args: {
  client: MqttClient;
  telemetry: NodeTelemetryNormalized;
  status: RuleStatus;
  topic: string;
  escalationGraceMs?: number;
}): Promise<void> {
  if (args.status !== "Critico") return;

  const graceMs =
    typeof args.escalationGraceMs === "number" && args.escalationGraceMs > 0
      ? args.escalationGraceMs
      : DEFAULT_NODE_ESCALATION_GRACE_MS;

  const nodeId = args.telemetry.metadata.node_id;
  const zoneCode = args.telemetry.metadata.dc_zone;
  const rackCode = args.telemetry.metadata.dc_rack;

  try {
    const latestSoft = await getLatestNodeCommandWithinWindow({
      nodeId,
      action: "soft_reboot",
      windowSeconds: RECENT_NODE_COMMAND_WINDOW_SECONDS
    });

    const hasRecentBlockingHardShutdown = await hasRecentNodeCommandByStatuses({
      nodeId,
      action: "hard_shutdown",
      statuses: ["PENDING", "ACKED"],
      windowSeconds: RECENT_NODE_COMMAND_WINDOW_SECONDS
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "escalation_evaluated",
        node_id: nodeId,
        status: args.status,
        grace_ms: graceMs,
        latest_soft_reboot_command_id: latestSoft?.commandId ?? null,
        latest_soft_reboot_ack_status: latestSoft?.ackStatus ?? null,
        latest_soft_reboot_age_ms: latestSoft?.ageMs ?? null,
        has_recent_blocking_hard_shutdown: hasRecentBlockingHardShutdown
      })
    );

    broadcastRealtimeEvent({
      type: "escalation_event",
      data: {
        stage: "evaluated",
        node_id: nodeId,
        zone_code: zoneCode,
        rack_code: rackCode,
        status: args.status,
        grace_ms: graceMs,
        latest_soft_reboot_command_id: latestSoft?.commandId ?? null,
        latest_soft_reboot_ack_status: latestSoft?.ackStatus ?? null,
        latest_soft_reboot_age_ms: latestSoft?.ageMs ?? null,
        has_recent_blocking_hard_shutdown: hasRecentBlockingHardShutdown
      }
    });

    if (!latestSoft) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "escalation_soft_reboot_selected",
          node_id: nodeId,
          reason: "no_recent_soft_reboot"
        })
      );

      broadcastRealtimeEvent({
        type: "escalation_event",
        data: {
          stage: "soft_reboot_selected",
          node_id: nodeId,
          zone_code: zoneCode,
          rack_code: rackCode,
          reason: "no_recent_soft_reboot"
        }
      });

      await dispatchWithAudit({
        client: args.client,
        descriptor: buildNodeSoftRebootDescriptor({ zoneCode, rackCode, nodeId }),
        source: "node",
        topic: args.topic
      });
      return;
    }

    if (hasRecentBlockingHardShutdown) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "escalation_skipped_existing_hard_shutdown",
          node_id: nodeId
        })
      );

      broadcastRealtimeEvent({
        type: "escalation_event",
        data: {
          stage: "skipped_existing_hard_shutdown",
          node_id: nodeId,
          zone_code: zoneCode,
          rack_code: rackCode
        }
      });
      return;
    }

    if (latestSoft.ageMs < graceMs) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "escalation_waiting_grace_period",
          node_id: nodeId,
          soft_reboot_command_id: latestSoft.commandId,
          soft_reboot_ack_status: latestSoft.ackStatus,
          soft_reboot_age_ms: latestSoft.ageMs,
          grace_ms: graceMs
        })
      );

      broadcastRealtimeEvent({
        type: "escalation_event",
        data: {
          stage: "waiting_grace_period",
          node_id: nodeId,
          zone_code: zoneCode,
          rack_code: rackCode,
          soft_reboot_command_id: latestSoft.commandId,
          soft_reboot_ack_status: latestSoft.ackStatus,
          soft_reboot_age_ms: latestSoft.ageMs,
          grace_ms: graceMs
        }
      });
      return;
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "escalation_hard_shutdown_selected",
        node_id: nodeId,
        based_on_soft_reboot_command_id: latestSoft.commandId,
        based_on_soft_reboot_ack_status: latestSoft.ackStatus,
        soft_reboot_age_ms: latestSoft.ageMs
      })
    );

    broadcastRealtimeEvent({
      type: "escalation_event",
      data: {
        stage: "hard_shutdown_selected",
        node_id: nodeId,
        zone_code: zoneCode,
        rack_code: rackCode,
        based_on_soft_reboot_command_id: latestSoft.commandId,
        based_on_soft_reboot_ack_status: latestSoft.ackStatus,
        soft_reboot_age_ms: latestSoft.ageMs
      }
    });

    await dispatchWithAudit({
      client: args.client,
      descriptor: buildNodeHardShutdownDescriptor({ zoneCode, rackCode, nodeId }),
      source: "node",
      topic: args.topic
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "escalation_failed",
        node_id: nodeId,
        message
      })
    );

    broadcastRealtimeEvent({
      type: "escalation_event",
      data: {
        stage: "failed",
        node_id: nodeId,
        zone_code: zoneCode,
        rack_code: rackCode,
        message
      }
    });
  }
}

export async function dispatchEnvironmentCommandIfNeeded(args: {
  client: MqttClient;
  telemetry: EnvironmentTelemetryNormalized;
  status: RuleStatus;
  topic: string;
}): Promise<void> {
  const descriptor = selectEnvironmentCommand({
    telemetry: args.telemetry,
    status: args.status
  });
  if (!descriptor) return;

  await dispatchWithAudit({
    client: args.client,
    descriptor,
    source: "environment",
    topic: args.topic
  });
}
