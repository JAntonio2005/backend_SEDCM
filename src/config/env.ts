export type AppEnv = {
  httpPort: number;
  mqttUrl: string;
  mqttClientId: string;
  mqttConnectTimeoutMs: number;
  mqttReconnectPeriodMs: number;
};

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`[BLOQUEANTE] Missing required environment variable: ${name}`);
  }
  return value;
}

function getNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[BLOQUEANTE] Invalid positive number for ${name}: ${raw}`);
  }
  return parsed;
}

export function loadEnv(): AppEnv {
  return {
    httpPort: getNumber("HTTP_PORT", 3000),
    mqttUrl: getRequired("MQTT_URL"),
    mqttClientId: process.env.MQTT_CLIENT_ID?.trim() || "backend-sedcm-ingesta",
    mqttConnectTimeoutMs: getNumber("MQTT_CONNECT_TIMEOUT_MS", 5000),
    mqttReconnectPeriodMs: getNumber("MQTT_RECONNECT_PERIOD_MS", 3000)
  };
}
