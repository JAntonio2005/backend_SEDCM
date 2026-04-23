import { createHash } from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function payloadToBytes(payload: Buffer | string | object): Buffer {
  if (Buffer.isBuffer(payload)) return payload;
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  return Buffer.from(stableStringify(payload), "utf8");
}

export function computePayloadHash(payload: Buffer | string | object): string {
  const bytes = payloadToBytes(payload);
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildDedupeKey(args: {
  topic: string;
  timestamp: string;
  metadata: {
    dc_zone: string;
    dc_rack: string;
    node_id?: string;
  };
  payload: Buffer | string | object;
}): string {
  const payloadHash = computePayloadHash(args.payload);
  const nodePart = args.metadata.node_id ?? "-";
  return [
    args.topic,
    args.metadata.dc_zone,
    args.metadata.dc_rack,
    nodePart,
    args.timestamp,
    payloadHash
  ].join("|");
}

export function createDedupeTracker() {
  const seen = new Set<string>();

  return {
    checkAndTrack(key: string): boolean {
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    }
  };
}
