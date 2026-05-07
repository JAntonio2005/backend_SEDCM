import { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

export type RealtimeEventType =
  | "telemetry_node_received"
  | "telemetry_environment_received"
  | "node_status_changed"
  | "rack_status_changed"
  | "command_published"
  | "command_ack_received"
  | "escalation_event";

export type RealtimeEvent = {
  type: RealtimeEventType;
  timestamp: string;
  data: Record<string, unknown>;
};

let wsServer: WebSocketServer | undefined;

export function startWebSocketServer(server: Server): void {
  if (wsServer) return;

  wsServer = new WebSocketServer({
    server,
    path: "/ws"
  });

  wsServer.on("connection", (socket, request) => {
    console.log(
      JSON.stringify({
        level: "info",
        event: "websocket_client_connected",
        path: request.url,
        remote_address: request.socket.remoteAddress ?? null
      })
    );

    socket.on("close", () => {
      console.log(
        JSON.stringify({
          level: "info",
          event: "websocket_client_disconnected",
          remote_address: request.socket.remoteAddress ?? null
        })
      );
    });
  });

  console.log(
    JSON.stringify({
      level: "info",
      event: "websocket_started",
      path: "/ws"
    })
  );
}

export function broadcastRealtimeEvent(args: {
  type: RealtimeEventType;
  data: Record<string, unknown>;
  timestamp?: string;
}): void {
  if (!wsServer) return;

  const eventPayload: RealtimeEvent = {
    type: args.type,
    timestamp: args.timestamp ?? new Date().toISOString(),
    data: args.data
  };

  const serialized = JSON.stringify(eventPayload);
  let sentCount = 0;

  for (const client of wsServer.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    try {
      client.send(serialized);
      sentCount += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          level: "error",
          event: "websocket_broadcast_failed",
          type: args.type,
          message
        })
      );
    }
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "websocket_broadcast_sent",
      type: args.type,
      clients_total: wsServer.clients.size,
      sent_count: sentCount
    })
  );
}
