const mqtt = require("mqtt");

function asPositiveNumber(raw, fallback) {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(values) {
  return values[randInt(0, values.length - 1)];
}

function log(level, event, extra) {
  console.log(JSON.stringify({ level, event, ...extra }));
}

const env = {
  mqttUrl: process.env.MQTT_URL || "mqtt://127.0.0.1:1883",
  edgeZone: process.env.EDGE_ZONE || "A",
  edgeRack: process.env.EDGE_RACK || "A1",
  nodeId: process.env.NODE_ID || "N1",
  collectorId: process.env.COLLECTOR_ID || "collector-A1",
  nodeIntervalMs: asPositiveNumber(process.env.NODE_INTERVAL_MS, 5000),
  envIntervalMs: asPositiveNumber(process.env.ENV_INTERVAL_MS, 10000),
  scenario: (process.env.SCENARIO || "normal").trim().toLowerCase()
};

const nodeTopic = `dc/telemetria/zona/${env.edgeZone}/rack/${env.edgeRack}/nodo/${env.nodeId}`;
const environmentTopic = `dc/telemetria/zona/${env.edgeZone}/rack/${env.edgeRack}/ambiente`;

const SCENARIOS = new Set(["normal", "warning", "critical_node", "critical_environment"]);
if (!SCENARIOS.has(env.scenario)) {
  env.scenario = "normal";
}

function buildNodeMetrics() {
  if (env.scenario === "warning") {
    return {
      cpu_usage_pct: randInt(80, 90),
      ram_usage_mb: randInt(8192, 10000),
      net_rx_bytes_sec: randInt(700, 2500),
      net_tx_bytes_sec: randInt(650, 2200)
    };
  }

  if (env.scenario === "critical_node") {
    return {
      cpu_usage_pct: randInt(95, 99),
      ram_usage_mb: randInt(12288, 14000),
      net_rx_bytes_sec: randInt(800, 2800),
      net_tx_bytes_sec: randInt(700, 2600)
    };
  }

  return {
    cpu_usage_pct: randInt(40, 60),
    ram_usage_mb: randInt(1000, 2000),
    net_rx_bytes_sec: randInt(400, 1700),
    net_tx_bytes_sec: randInt(350, 1500)
  };
}

function buildEnvironmentMetrics() {
  if (env.scenario === "warning") {
    return {
      temperature_c: randInt(30, 38),
      humidity_pct: randChoice([35, 65])
    };
  }

  if (env.scenario === "critical_environment") {
    return {
      temperature_c: randInt(45, 50),
      humidity_pct: randInt(45, 55)
    };
  }

  return {
    temperature_c: randInt(24, 27),
    humidity_pct: randInt(45, 55)
  };
}

function buildNodePayload() {
  return {
    timestamp: new Date().toISOString(),
    metadata: {
      dc_zone: env.edgeZone,
      dc_rack: env.edgeRack,
      node_id: env.nodeId
    },
    metrics: buildNodeMetrics()
  };
}

function buildEnvironmentPayload() {
  return {
    timestamp: new Date().toISOString(),
    metadata: {
      dc_zone: env.edgeZone,
      dc_rack: env.edgeRack
    },
    environment: buildEnvironmentMetrics()
  };
}

log("info", "edge_collector_started", {
  mqtt_url: env.mqttUrl,
  edge_zone: env.edgeZone,
  edge_rack: env.edgeRack,
  node_id: env.nodeId,
  collector_id: env.collectorId,
  scenario: env.scenario,
  node_interval_ms: env.nodeIntervalMs,
  env_interval_ms: env.envIntervalMs,
  node_topic: nodeTopic,
  environment_topic: environmentTopic
});

const client = mqtt.connect(env.mqttUrl, {
  clientId: `${env.collectorId}-${Math.random().toString(16).slice(2, 8)}`,
  connectTimeout: 5000,
  reconnectPeriod: 3000
});

let nodeTimer = null;
let envTimer = null;

function publishNodeTelemetry() {
  const payload = buildNodePayload();

  client.publish(nodeTopic, JSON.stringify(payload), { qos: 0 }, (error) => {
    if (error) {
      log("error", "edge_collector_error", {
        stage: "publish_node",
        message: error.message
      });
      return;
    }

    log("info", "edge_node_telemetry_published", {
      topic: nodeTopic,
      scenario: env.scenario,
      payload
    });
  });
}

function publishEnvironmentTelemetry() {
  const payload = buildEnvironmentPayload();

  client.publish(environmentTopic, JSON.stringify(payload), { qos: 0 }, (error) => {
    if (error) {
      log("error", "edge_collector_error", {
        stage: "publish_environment",
        message: error.message
      });
      return;
    }

    log("info", "edge_environment_telemetry_published", {
      topic: environmentTopic,
      scenario: env.scenario,
      payload
    });
  });
}

client.on("connect", () => {
  log("info", "edge_collector_connected", { broker: env.mqttUrl });

  publishNodeTelemetry();
  publishEnvironmentTelemetry();

  if (nodeTimer) clearInterval(nodeTimer);
  if (envTimer) clearInterval(envTimer);

  nodeTimer = setInterval(publishNodeTelemetry, env.nodeIntervalMs);
  envTimer = setInterval(publishEnvironmentTelemetry, env.envIntervalMs);
});

client.on("error", (error) => {
  log("error", "edge_collector_error", {
    stage: "mqtt_client",
    message: error.message
  });
});

function shutdown(signal) {
  log("info", "edge_collector_error", {
    stage: "shutdown",
    signal,
    message: "collector shutting down"
  });

  if (nodeTimer) clearInterval(nodeTimer);
  if (envTimer) clearInterval(envTimer);

  client.end(true, () => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));