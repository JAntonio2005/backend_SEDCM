import { Server } from "node:http";
import { MqttClient } from "mqtt";
import { startHttpServer } from "./bootstrap/http";
import { connectMqttBroker } from "./bootstrap/mqtt";
import { loadEnv } from "./config/env";
import { activateTelemetrySubscriptions } from "./mqtt/subscriptions";

let httpServer: Server | undefined;
let mqttClient: MqttClient | undefined;

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: "info", event: "shutdown_signal", signal }));

  if (mqttClient) {
    mqttClient.end(true);
  }

  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  process.exit(0);
}

async function main(): Promise<void> {
  const env = loadEnv();

  httpServer = await startHttpServer(env.httpPort);
  console.log(JSON.stringify({ level: "info", event: "http_started", port: env.httpPort }));

  mqttClient = await connectMqttBroker(env);
  console.log(JSON.stringify({ level: "info", event: "mqtt_connected", broker: env.mqttUrl }));

  await activateTelemetrySubscriptions({ client: mqttClient });
  console.log(JSON.stringify({ level: "info", event: "mqtt_subscriptions_activated" }));
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: "error", event: "startup_failed", message }));
  process.exit(1);
});
