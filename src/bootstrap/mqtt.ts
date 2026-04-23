import { MqttClient, connect } from "mqtt";
import type { AppEnv } from "../config/env";

export async function connectMqttBroker(env: AppEnv): Promise<MqttClient> {
  const client = connect(env.mqttUrl, {
    clientId: env.mqttClientId,
    connectTimeout: env.mqttConnectTimeoutMs,
    reconnectPeriod: env.mqttReconnectPeriodMs
  });

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("error", onError);
    };

    client.once("connect", onConnect);
    client.once("error", onError);
  });

  return client;
}
