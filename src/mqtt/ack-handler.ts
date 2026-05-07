import { updateCommandAckRecord } from "../repositories/command-audit.repository";
import { broadcastRealtimeEvent } from "../realtime/ws-server";

export const ACK_SUBSCRIPTION_FILTER = "dc/ack/#";

type AckStatus = "ACKED" | "FAILED";

type ParsedAckTopic =
  | {
      ok: true;
      zoneCode: string;
      rackCode: string;
    }
  | {
      ok: false;
      cause: string;
      detail?: string;
    };

type AckPayloadValidated = {
  commandId: string;
  status: AckStatus;
  timestampAck: string | null;
  ackPayload: Record<string, unknown>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseAckTopic(rawTopic: string): ParsedAckTopic {
  const topic = rawTopic.trim();
  const segments = topic.split("/");

  if (segments.length !== 6) {
    return {
      ok: false,
      cause: "invalid_ack_topic_segments",
      detail: "expected dc/ack/zona/{Z}/rack/{R}"
    };
  }

  if (segments[0] !== "dc" || segments[1] !== "ack") {
    return {
      ok: false,
      cause: "invalid_ack_topic_prefix",
      detail: "expected dc/ack"
    };
  }

  if (segments[2] !== "zona") {
    return { ok: false, cause: "invalid_ack_topic_zona_segment" };
  }

  if (segments[4] !== "rack") {
    return { ok: false, cause: "invalid_ack_topic_rack_segment" };
  }

  const zoneCode = segments[3]?.trim();
  const rackCode = segments[5]?.trim();

  if (!zoneCode) {
    return { ok: false, cause: "invalid_ack_zone_code" };
  }

  if (!rackCode) {
    return { ok: false, cause: "invalid_ack_rack_code" };
  }

  return {
    ok: true,
    zoneCode,
    rackCode
  };
}

function validateAckPayload(payload: unknown): { ok: true; value: AckPayloadValidated } | {
  ok: false;
  cause: string;
  detail?: string;
} {
  const root = asObject(payload);
  if (!root) {
    return { ok: false, cause: "invalid_payload_type", detail: "payload must be an object" };
  }

  const commandIdRaw = root.command_id;
  if (typeof commandIdRaw !== "string" || commandIdRaw.trim() === "") {
    return {
      ok: false,
      cause: "missing_command_id",
      detail: "command_id is required and must be non-empty string"
    };
  }

  const statusRaw = root.status;
  if (typeof statusRaw !== "string" || statusRaw.trim() === "") {
    return {
      ok: false,
      cause: "missing_status",
      detail: "status is required and must be string"
    };
  }

  const normalizedStatus = statusRaw.trim().toUpperCase();
  if (normalizedStatus !== "ACKED" && normalizedStatus !== "FAILED") {
    return {
      ok: false,
      cause: "invalid_status",
      detail: "status must be ACKED or FAILED"
    };
  }

  const timestampAckRaw = root.timestamp_ack;
  let timestampAck: string | null = null;
  if (timestampAckRaw !== undefined) {
    if (typeof timestampAckRaw !== "string" || timestampAckRaw.trim() === "") {
      return {
        ok: false,
        cause: "invalid_timestamp_ack",
        detail: "timestamp_ack must be a non-empty string when provided"
      };
    }

    const parsedMs = Date.parse(timestampAckRaw);
    if (Number.isNaN(parsedMs)) {
      return {
        ok: false,
        cause: "invalid_timestamp_ack",
        detail: "timestamp_ack is not parseable"
      };
    }
    timestampAck = new Date(parsedMs).toISOString();
  }

  if (root.executor_id !== undefined && typeof root.executor_id !== "string") {
    return {
      ok: false,
      cause: "invalid_executor_id",
      detail: "executor_id must be string when provided"
    };
  }

  if (root.message !== undefined && typeof root.message !== "string") {
    return {
      ok: false,
      cause: "invalid_message",
      detail: "message must be string when provided"
    };
  }

  return {
    ok: true,
    value: {
      commandId: commandIdRaw.trim(),
      status: normalizedStatus,
      timestampAck,
      ackPayload: root
    }
  };
}

export async function handleAckMessage(args: {
  topic: string;
  payload: Buffer;
}): Promise<void> {
  const parsedTopic = parseAckTopic(args.topic);
  if (!parsedTopic.ok) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "ack_invalid_payload",
        topic: args.topic,
        cause: parsedTopic.cause,
        detail: parsedTopic.detail
      })
    );
    return;
  }

  const payloadText = args.payload.toString("utf8");
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(payloadText);
  } catch {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "ack_invalid_payload",
        topic: args.topic,
        cause: "invalid_json"
      })
    );
    return;
  }

  const validated = validateAckPayload(parsedPayload);
  if (!validated.ok) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "ack_invalid_payload",
        topic: args.topic,
        cause: validated.cause,
        detail: validated.detail
      })
    );
    return;
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "ack_received",
      topic: args.topic,
      zone_code: parsedTopic.zoneCode,
      rack_code: parsedTopic.rackCode,
      command_id: validated.value.commandId,
      status: validated.value.status
    })
  );

  broadcastRealtimeEvent({
    type: "command_ack_received",
    data: {
      topic: args.topic,
      zone_code: parsedTopic.zoneCode,
      rack_code: parsedTopic.rackCode,
      command_id: validated.value.commandId,
      status: validated.value.status,
      timestamp_ack: validated.value.timestampAck
    }
  });

  try {
    const updated = await updateCommandAckRecord({
      commandId: validated.value.commandId,
      ackStatus: validated.value.status,
      timestampAck: validated.value.timestampAck,
      ackPayload: validated.value.ackPayload
    });

    if (!updated) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "ack_command_not_found",
          topic: args.topic,
          command_id: validated.value.commandId
        })
      );
      return;
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "ack_record_updated",
        topic: args.topic,
        command_id: validated.value.commandId,
        ack_status: validated.value.status
      })
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "ack_update_failed",
        topic: args.topic,
        command_id: validated.value.commandId,
        message
      })
    );
  }
}
