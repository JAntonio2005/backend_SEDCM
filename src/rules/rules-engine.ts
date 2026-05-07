import { EnvironmentTelemetryNormalized } from "../ingest/normalizers/environment-telemetry.normalizer";
import { NodeTelemetryNormalized } from "../ingest/normalizers/node-telemetry.normalizer";
import { withDbClient } from "../repositories/db";

export type RuleStatus = "Normal" | "Warning" | "Critico";

const CPU_WARNING_THRESHOLD = 80;
const CPU_CRITICAL_THRESHOLD = 95;
const RAM_WARNING_MB_THRESHOLD = 8192;
const RAM_CRITICAL_MB_THRESHOLD = 12288;

function severity(status: RuleStatus): number {
  if (status === "Critico") return 2;
  if (status === "Warning") return 1;
  return 0;
}

function maxStatus(left: RuleStatus, right: RuleStatus): RuleStatus {
  return severity(left) >= severity(right) ? left : right;
}

export function evaluateNodeStatus(telemetry: NodeTelemetryNormalized): RuleStatus {
  const cpu = telemetry.metrics.cpu_usage_pct;
  const ram = telemetry.metrics.ram_usage_mb;

  if (cpu >= CPU_CRITICAL_THRESHOLD || ram >= RAM_CRITICAL_MB_THRESHOLD) {
    return "Critico";
  }

  if (cpu >= CPU_WARNING_THRESHOLD || ram >= RAM_WARNING_MB_THRESHOLD) {
    return "Warning";
  }

  return "Normal";
}

function evaluateTemperatureStatus(temperatureC: number): RuleStatus {
  if (temperatureC >= 45) return "Critico";
  if (temperatureC >= 28 && temperatureC <= 44) return "Warning";
  return "Normal";
}

function evaluateHumidityStatus(humidityPct: number): RuleStatus {
  if (humidityPct < 20 || humidityPct > 80) return "Critico";
  if (humidityPct < 40 || humidityPct > 60) return "Warning";
  return "Normal";
}

export function evaluateRackEnvironmentStatus(
  telemetry: EnvironmentTelemetryNormalized
): RuleStatus {
  const tempStatus = evaluateTemperatureStatus(telemetry.environment.temperature_c);
  const humidityStatus = evaluateHumidityStatus(telemetry.environment.humidity_pct);
  return maxStatus(tempStatus, humidityStatus);
}

export async function applyNodeStatus(args: {
  nodeId: string;
  status: RuleStatus;
}): Promise<{ previousStatus: RuleStatus | null; changed: boolean }> {
  return withDbClient(async (client) => {
    const current = await client.query<{ health_status: RuleStatus }>(
      `
        SELECT health_status
        FROM inventory_node
        WHERE node_id = $1
      `,
      [args.nodeId]
    );

    const previousStatus = current.rowCount ? current.rows[0].health_status : null;
    if (previousStatus === args.status) {
      return { previousStatus, changed: false };
    }

    await client.query(
      `
        UPDATE inventory_node
        SET health_status = $2
        WHERE node_id = $1
      `,
      [args.nodeId, args.status]
    );

    return { previousStatus, changed: true };
  });
}

export async function applyRackEnvironmentStatus(args: {
  zoneCode: string;
  rackCode: string;
  status: RuleStatus;
}): Promise<{ previousStatus: RuleStatus | null; changed: boolean }> {
  return withDbClient(async (client) => {
    const current = await client.query<{ environment_status: RuleStatus }>(
      `
        SELECT environment_status
        FROM inventory_rack
        WHERE zone_code = $1 AND rack_code = $2
      `,
      [args.zoneCode, args.rackCode]
    );

    const previousStatus = current.rowCount ? current.rows[0].environment_status : null;
    if (previousStatus === args.status) {
      return { previousStatus, changed: false };
    }

    await client.query(
      `
        UPDATE inventory_rack
        SET environment_status = $3
        WHERE zone_code = $1 AND rack_code = $2
      `,
      [args.zoneCode, args.rackCode, args.status]
    );

    return { previousStatus, changed: true };
  });
}
