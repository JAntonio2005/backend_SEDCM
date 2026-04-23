import { MqttClient } from "mqtt";
import { buildDedupeKey, createDedupeTracker } from "../ingest/dedupe/dedupe-key";
import { normalizeEnvironmentTelemetry } from "../ingest/normalizers/environment-telemetry.normalizer";
import { normalizeNodeTelemetry } from "../ingest/normalizers/node-telemetry.normalizer";
import { validateEnvironmentTelemetryPayload } from "../ingest/validators/environment-telemetry.validator";
import { validateNodeTelemetryPayload } from "../ingest/validators/node-telemetry.validator";
import { routeTelemetryMessage, TelemetryTopicHandlers } from "./router";

export const TELEMETRY_SUBSCRIPTION_FILTER = "dc/telemetria/#";

function createDefaultHandlers(): TelemetryTopicHandlers {
  const dedupeTracker = createDedupeTracker();
  const nodeLastEventByStream = new Map<string, number>();
  const environmentLastEventByStream = new Map<string, number>();

  return {
    onNodeTopic: ({ route, payload, topic }) => {
      const payloadText = payload.toString("utf8");
      let parsedPayload: unknown;

      try {
        parsedPayload = JSON.parse(payloadText);
      } catch {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "mqtt_ingest_rejected",
            handler: "node",
            topic,
            cause: "invalid_json"
          })
        );
        return;
      }

      const validation = validateNodeTelemetryPayload({
        payload: parsedPayload,
        topic: route
      });

      if (!validation.ok) {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "mqtt_ingest_rejected",
            handler: "node",
            topic,
            cause: validation.cause,
            detail: validation.detail
          })
        );
        return;
      }

      const streamKey = `${validation.value.metadata.dc_zone}|${validation.value.metadata.dc_rack}|${validation.value.metadata.node_id}`;
      const previousEventTimeMs = nodeLastEventByStream.get(streamKey);
      const normalized = normalizeNodeTelemetry({
        validated: validation.value,
        previousEventTimeMs
      });

      const dedupeKey = buildDedupeKey({
        topic,
        metadata: {
          dc_zone: normalized.metadata.dc_zone,
          dc_rack: normalized.metadata.dc_rack,
          node_id: normalized.metadata.node_id
        },
        timestamp: normalized.timestamp,
        payload
      });

      const isDuplicate = dedupeTracker.checkAndTrack(dedupeKey);
      if (isDuplicate) {
        console.log(
          JSON.stringify({
            level: "info",
            event: "mqtt_ingest_duplicate",
            handler: "node",
            topic,
            dedupe_key: dedupeKey
          })
        );
        return;
      }

      nodeLastEventByStream.set(streamKey, validation.value.eventTimeMs);

      console.log(
        JSON.stringify({
          level: "info",
          event: "mqtt_ingest_accepted",
          handler: "node",
          topic,
          payloadBytes: payload.length,
          normalized
        })
      );
    },
    onEnvironmentTopic: ({ route, payload, topic }) => {
      const payloadText = payload.toString("utf8");
      let parsedPayload: unknown;

      try {
        parsedPayload = JSON.parse(payloadText);
      } catch {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "mqtt_ingest_rejected",
            handler: "environment",
            topic,
            cause: "invalid_json"
          })
        );
        return;
      }

      const validation = validateEnvironmentTelemetryPayload({
        payload: parsedPayload,
        topic: route
      });

      if (!validation.ok) {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "mqtt_ingest_rejected",
            handler: "environment",
            topic,
            cause: validation.cause,
            detail: validation.detail
          })
        );
        return;
      }

      const streamKey = `${validation.value.metadata.dc_zone}|${validation.value.metadata.dc_rack}`;
      const previousEventTimeMs = environmentLastEventByStream.get(streamKey);
      const normalized = normalizeEnvironmentTelemetry({
        validated: validation.value,
        previousEventTimeMs
      });

      const dedupeKey = buildDedupeKey({
        topic,
        metadata: {
          dc_zone: normalized.metadata.dc_zone,
          dc_rack: normalized.metadata.dc_rack
        },
        timestamp: normalized.timestamp,
        payload
      });

      const isDuplicate = dedupeTracker.checkAndTrack(dedupeKey);
      if (isDuplicate) {
        console.log(
          JSON.stringify({
            level: "info",
            event: "mqtt_ingest_duplicate",
            handler: "environment",
            topic,
            dedupe_key: dedupeKey
          })
        );
        return;
      }

      environmentLastEventByStream.set(streamKey, validation.value.eventTimeMs);

      console.log(
        JSON.stringify({
          level: "info",
          event: "mqtt_ingest_accepted",
          handler: "environment",
          topic,
          payloadBytes: payload.length,
          normalized
        })
      );
    }
  };
}

export async function activateTelemetrySubscriptions(args: {
  client: MqttClient;
  handlers?: Partial<TelemetryTopicHandlers>;
}): Promise<void> {
  const handlers: TelemetryTopicHandlers = {
    ...createDefaultHandlers(),
    ...args.handlers
  };

  await new Promise<void>((resolve, reject) => {
    args.client.subscribe(TELEMETRY_SUBSCRIPTION_FILTER, { qos: 0 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  args.client.on("message", (topic: string, payload: Buffer) => {
    void routeTelemetryMessage({
      topic,
      payload,
      handlers
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          level: "error",
          event: "mqtt_route_failed",
          topic,
          message
        })
      );
    });
  });
}
