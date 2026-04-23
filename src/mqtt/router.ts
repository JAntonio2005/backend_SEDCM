import { parseTelemetryTopic, ParsedEnvironmentTopic, ParsedNodeTopic } from "./topic-parser";

export type NodeTopicHandler = (args: {
  route: ParsedNodeTopic;
  payload: Buffer;
  topic: string;
}) => void | Promise<void>;

export type EnvironmentTopicHandler = (args: {
  route: ParsedEnvironmentTopic;
  payload: Buffer;
  topic: string;
}) => void | Promise<void>;

export type TelemetryTopicHandlers = {
  onNodeTopic: NodeTopicHandler;
  onEnvironmentTopic: EnvironmentTopicHandler;
};

export async function routeTelemetryMessage(args: {
  topic: string;
  payload: Buffer;
  handlers: TelemetryTopicHandlers;
}): Promise<void> {
  const parsed = parseTelemetryTopic(args.topic);

  if (parsed.kind === "error") {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "mqtt_topic_rejected",
        topic: args.topic,
        cause: parsed.cause,
        detail: parsed.detail
      })
    );
    return;
  }

  if (parsed.topic.kind === "node") {
    await args.handlers.onNodeTopic({
      route: parsed.topic,
      payload: args.payload,
      topic: args.topic
    });
    return;
  }

  await args.handlers.onEnvironmentTopic({
    route: parsed.topic,
    payload: args.payload,
    topic: args.topic
  });
}
