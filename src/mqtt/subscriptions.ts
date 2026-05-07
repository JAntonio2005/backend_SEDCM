import { MqttClient } from "mqtt";
import { buildDedupeKey, createDedupeTracker } from "../ingest/dedupe/dedupe-key";
import { normalizeEnvironmentTelemetry } from "../ingest/normalizers/environment-telemetry.normalizer";
import { normalizeNodeTelemetry } from "../ingest/normalizers/node-telemetry.normalizer";
import { validateEnvironmentTelemetryPayload } from "../ingest/validators/environment-telemetry.validator";
import { validateNodeTelemetryPayload } from "../ingest/validators/node-telemetry.validator";
import {
  persistEnvironmentTelemetry,
  persistNodeTelemetry
} from "../repositories/telemetry.repository";
import {
  dispatchEnvironmentCommandIfNeeded,
  dispatchNodeCommandIfNeeded
} from "../commands/command-dispatcher";
import {
  applyNodeStatus,
  applyRackEnvironmentStatus,
  evaluateNodeStatus,
  evaluateRackEnvironmentStatus
} from "../rules/rules-engine";
import { broadcastRealtimeEvent } from "../realtime/ws-server";
import { ACK_SUBSCRIPTION_FILTER, handleAckMessage } from "./ack-handler";
import { routeTelemetryMessage, TelemetryTopicHandlers } from "./router";

export const TELEMETRY_SUBSCRIPTION_FILTER = "dc/telemetria/#";

function createDefaultHandlers(
  client: MqttClient,
  nodeEscalationGraceMs: number
): TelemetryTopicHandlers {
  const dedupeTracker = createDedupeTracker();
  const nodeLastEventByStream = new Map<string, number>();
  const environmentLastEventByStream = new Map<string, number>();

  return {
    onNodeTopic: async ({ route, payload, topic }) => {
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

      try {
        await persistNodeTelemetry({ normalized });
        console.log(
          JSON.stringify({
            level: "info",
            event: "mqtt_ingest_persisted",
            handler: "node",
            topic,
            timestamp: normalized.timestamp
          })
        );

        broadcastRealtimeEvent({
          type: "telemetry_node_received",
          data: {
            topic,
            timestamp: normalized.timestamp,
            metadata: normalized.metadata,
            metrics: normalized.metrics
          }
        });

        try {
          const evaluatedStatus = evaluateNodeStatus(normalized);
          console.log(
            JSON.stringify({
              level: "info",
              event: "rules_evaluated",
              handler: "node",
              topic,
              node_id: normalized.metadata.node_id,
              evaluated_status: evaluatedStatus
            })
          );

          const updated = await applyNodeStatus({
            nodeId: normalized.metadata.node_id,
            status: evaluatedStatus
          });

          if (updated.changed) {
            console.log(
              JSON.stringify({
                level: "info",
                event: "node_status_changed",
                node_id: normalized.metadata.node_id,
                previous_status: updated.previousStatus,
                new_status: evaluatedStatus
              })
            );

            broadcastRealtimeEvent({
              type: "node_status_changed",
              data: {
                node_id: normalized.metadata.node_id,
                zone_code: normalized.metadata.dc_zone,
                rack_code: normalized.metadata.dc_rack,
                previous_status: updated.previousStatus,
                new_status: evaluatedStatus
              }
            });
          }

          await dispatchNodeCommandIfNeeded({
            client,
            telemetry: normalized,
            status: evaluatedStatus,
            topic,
            escalationGraceMs: nodeEscalationGraceMs
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            JSON.stringify({
              level: "error",
              event: "rules_evaluation_failed",
              handler: "node",
              topic,
              message
            })
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          JSON.stringify({
            level: "error",
            event: "mqtt_ingest_persistence_failed",
            handler: "node",
            topic,
            accepted: true,
            message
          })
        );
      }
    },
    onEnvironmentTopic: async ({ route, payload, topic }) => {
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

      try {
        await persistEnvironmentTelemetry({ normalized });
        console.log(
          JSON.stringify({
            level: "info",
            event: "mqtt_ingest_persisted",
            handler: "environment",
            topic,
            timestamp: normalized.timestamp
          })
        );

        broadcastRealtimeEvent({
          type: "telemetry_environment_received",
          data: {
            topic,
            timestamp: normalized.timestamp,
            metadata: normalized.metadata,
            environment: normalized.environment
          }
        });

        try {
          const evaluatedStatus = evaluateRackEnvironmentStatus(normalized);
          console.log(
            JSON.stringify({
              level: "info",
              event: "rules_evaluated",
              handler: "environment",
              topic,
              zone_code: normalized.metadata.dc_zone,
              rack_code: normalized.metadata.dc_rack,
              evaluated_status: evaluatedStatus
            })
          );

          const updated = await applyRackEnvironmentStatus({
            zoneCode: normalized.metadata.dc_zone,
            rackCode: normalized.metadata.dc_rack,
            status: evaluatedStatus
          });

          if (updated.changed) {
            console.log(
              JSON.stringify({
                level: "info",
                event: "rack_status_changed",
                zone_code: normalized.metadata.dc_zone,
                rack_code: normalized.metadata.dc_rack,
                previous_status: updated.previousStatus,
                new_status: evaluatedStatus
              })
            );

            broadcastRealtimeEvent({
              type: "rack_status_changed",
              data: {
                zone_code: normalized.metadata.dc_zone,
                rack_code: normalized.metadata.dc_rack,
                previous_status: updated.previousStatus,
                new_status: evaluatedStatus
              }
            });
          }

          await dispatchEnvironmentCommandIfNeeded({
            client,
            telemetry: normalized,
            status: evaluatedStatus,
            topic
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            JSON.stringify({
              level: "error",
              event: "rules_evaluation_failed",
              handler: "environment",
              topic,
              message
            })
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          JSON.stringify({
            level: "error",
            event: "mqtt_ingest_persistence_failed",
            handler: "environment",
            topic,
            accepted: true,
            message
          })
        );
      }
    }
  };
}

export async function activateTelemetrySubscriptions(args: {
  client: MqttClient;
  nodeEscalationGraceMs: number;
  handlers?: Partial<TelemetryTopicHandlers>;
}): Promise<void> {
  const handlers: TelemetryTopicHandlers = {
    ...createDefaultHandlers(args.client, args.nodeEscalationGraceMs),
    ...args.handlers
  };

  const subscribeFilter = async (filter: string): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      args.client.subscribe(filter, { qos: 0 }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  await subscribeFilter(TELEMETRY_SUBSCRIPTION_FILTER);
  await subscribeFilter(ACK_SUBSCRIPTION_FILTER);

  args.client.on("message", (topic: string, payload: Buffer) => {
    if (topic.startsWith("dc/telemetria/")) {
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
      return;
    }

    if (topic.startsWith("dc/ack/")) {
      void handleAckMessage({ topic, payload });
    }
  });
}
