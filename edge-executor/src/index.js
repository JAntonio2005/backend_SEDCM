const mqtt = require("mqtt");

const ALLOWED_ACTIONS = new Set(["soft_reboot", "hard_shutdown", "set_hvac_mode"]);

function asPositiveNumber(raw, fallback) {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function asAckMode(raw) {
  const mode = (raw || "ACKED").trim().toUpperCase();
  return mode === "FAILED" ? "FAILED" : "ACKED";
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function log(level, event, extra) {
  console.log(JSON.stringify({ level, event, ...extra }));
}

const env = {
  mqttUrl: process.env.MQTT_URL || "mqtt://127.0.0.1:1883",
  edgeZone: process.env.EDGE_ZONE || "A",
  edgeRack: process.env.EDGE_RACK || "A1",
  executorId: process.env.EXECUTOR_ID || "executor-A1",
  ackDelayMs: asPositiveNumber(process.env.ACK_DELAY_MS, 500),
  ackMode: asAckMode(process.env.ACK_MODE)
};

const commandTopic = `dc/control/zona/${env.edgeZone}/rack/${env.edgeRack}`;
const ackTopic = `dc/ack/zona/${env.edgeZone}/rack/${env.edgeRack}`;

log("info", "edge_executor_started", {
  mqtt_url: env.mqttUrl,
  edge_zone: env.edgeZone,
  edge_rack: env.edgeRack,
  executor_id: env.executorId,
  ack_delay_ms: env.ackDelayMs,
  ack_mode: env.ackMode,
  command_topic: commandTopic,
  ack_topic: ackTopic
});

const client = mqtt.connect(env.mqttUrl, {
  clientId: `${env.executorId}-${Math.random().toString(16).slice(2, 8)}`,
  connectTimeout: 5000,
  reconnectPeriod: 3000
});

client.on("connect", () => {
  log("info", "edge_executor_connected", { broker: env.mqttUrl });

  client.subscribe(commandTopic, { qos: 0 }, (error) => {
    if (error) {
      log("error", "edge_executor_error", {
        stage: "subscribe",
        message: error.message,
        topic: commandTopic
      });
      return;
    }

    log("info", "edge_executor_subscribed", { topic: commandTopic });
  });
});

client.on("error", (error) => {
  log("error", "edge_executor_error", {
    stage: "mqtt_client",
    message: error.message
  });
});

client.on("message", (topic, payloadBuffer) => {
  if (topic !== commandTopic) return;

  const payloadText = payloadBuffer.toString("utf8");
  let parsed;

  try {
    parsed = JSON.parse(payloadText);
  } catch {
    log("warn", "edge_invalid_command", {
      topic,
      cause: "invalid_json"
    });
    return;
  }

  const cmd = asObject(parsed);
  if (!cmd) {
    log("warn", "edge_invalid_command", {
      topic,
      cause: "invalid_payload_type"
    });
    return;
  }

  const commandId = typeof cmd.command_id === "string" ? cmd.command_id.trim() : "";
  const action = typeof cmd.action === "string" ? cmd.action.trim() : "";

  if (!commandId) {
    log("warn", "edge_invalid_command", {
      topic,
      cause: "missing_command_id"
    });
    return;
  }

  if (!action || !ALLOWED_ACTIONS.has(action)) {
    log("warn", "edge_invalid_command", {
      topic,
      command_id: commandId,
      cause: "invalid_action",
      action
    });
    return;
  }

  log("info", "edge_command_received", {
    topic,
    command_id: commandId,
    action,
    target: cmd.target || null,
    reason: typeof cmd.reason === "string" ? cmd.reason : null
  });

  const simulationMessage = `Simulated ${action} for ${env.edgeZone}/${env.edgeRack}`;
  log("info", "edge_command_simulated", {
    command_id: commandId,
    action,
    message: simulationMessage
  });

  setTimeout(() => {
    const ackPayload = {
      command_id: commandId,
      timestamp_ack: new Date().toISOString(),
      status: env.ackMode,
      executor_id: env.executorId,
      message: env.ackMode === "ACKED" ? "Command executed successfully" : "Command execution failed",
      action,
      target: asObject(cmd.target) || null
    };

    client.publish(ackTopic, JSON.stringify(ackPayload), { qos: 0 }, (error) => {
      if (error) {
        log("error", "edge_executor_error", {
          stage: "publish_ack",
          command_id: commandId,
          message: error.message
        });
        return;
      }

      log("info", "edge_ack_published", {
        topic: ackTopic,
        command_id: commandId,
        status: env.ackMode
      });
    });
  }, env.ackDelayMs);
});