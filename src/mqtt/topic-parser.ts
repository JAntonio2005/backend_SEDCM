export type ParsedNodeTopic = {
  kind: "node";
  zoneCode: string;
  rackCode: string;
  nodeId: string;
};

export type ParsedEnvironmentTopic = {
  kind: "environment";
  zoneCode: string;
  rackCode: string;
};

export type ParsedTelemetryTopic = ParsedNodeTopic | ParsedEnvironmentTopic;

export type TopicParseError = {
  kind: "error";
  cause: string;
  detail?: string;
};

export type TopicParseSuccess = {
  kind: "ok";
  topic: ParsedTelemetryTopic;
};

export type TopicParseResult = TopicParseSuccess | TopicParseError;

function hasInvalidSegment(segment: string): boolean {
  return segment.trim() === "";
}

export function parseTelemetryTopic(rawTopic: string): TopicParseResult {
  if (typeof rawTopic !== "string") {
    return { kind: "error", cause: "topic_not_string" };
  }

  const topic = rawTopic.trim();
  if (topic === "") {
    return { kind: "error", cause: "topic_empty" };
  }

  const segments = topic.split("/");

  if (segments[0] !== "dc" || segments[1] !== "telemetria") {
    return {
      kind: "error",
      cause: "invalid_prefix",
      detail: "expected dc/telemetria"
    };
  }

  if (segments[2] !== "zona") {
    return { kind: "error", cause: "missing_zona_segment" };
  }

  const zoneCode = segments[3];
  if (!zoneCode || hasInvalidSegment(zoneCode)) {
    return { kind: "error", cause: "invalid_zone_code" };
  }

  if (segments[4] !== "rack") {
    return { kind: "error", cause: "missing_rack_segment" };
  }

  const rackCode = segments[5];
  if (!rackCode || hasInvalidSegment(rackCode)) {
    return { kind: "error", cause: "invalid_rack_code" };
  }

  const lastSegment = segments[6];

  if (lastSegment === "ambiente") {
    if (segments.length !== 7) {
      return {
        kind: "error",
        cause: "invalid_segment_count",
        detail: "expected 7 segments for ambiente topic"
      };
    }

    return {
      kind: "ok",
      topic: {
        kind: "environment",
        zoneCode,
        rackCode
      }
    };
  }

  if (lastSegment === "nodo") {
    if (segments.length !== 8) {
      return {
        kind: "error",
        cause: "invalid_segment_count",
        detail: "expected 8 segments for nodo topic"
      };
    }

    const nodeId = segments[7];
    if (!nodeId || hasInvalidSegment(nodeId)) {
      return { kind: "error", cause: "invalid_node_id" };
    }

    return {
      kind: "ok",
      topic: {
        kind: "node",
        zoneCode,
        rackCode,
        nodeId
      }
    };
  }

  return {
    kind: "error",
    cause: "unsupported_topic_kind",
    detail: "expected .../nodo/{N} or .../ambiente"
  };
}
