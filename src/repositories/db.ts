import { Pool, PoolClient, PoolConfig } from "pg";

type DbSslMode = "disable" | "require";

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`[BLOQUEANTE] Missing required environment variable: ${name}`);
  }
  return value;
}

function getPort(): number {
  const raw = process.env.PGPORT ?? "5432";
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[BLOQUEANTE] Invalid PGPORT value: ${raw}`);
  }
  return parsed;
}

function getSslMode(): DbSslMode {
  const raw = process.env.PGSSLMODE?.trim().toLowerCase();
  if (!raw || raw === "disable") return "disable";
  if (raw === "require") return "require";
  throw new Error(`[BLOQUEANTE] Unsupported PGSSLMODE value: ${raw}`);
}

function buildPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();
  const sslMode = getSslMode();

  if (connectionString) {
    return {
      connectionString,
      ssl: sslMode === "require"
    };
  }

  return {
    host: getRequired("PGHOST"),
    port: getPort(),
    database: getRequired("PGDATABASE"),
    user: getRequired("PGUSER"),
    password: process.env.PGPASSWORD,
    ssl: sslMode === "require"
  };
}

let pool: Pool | undefined;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
  }
  return pool;
}

export async function verifyDbConnection(): Promise<void> {
  const client = await getDbPool().connect();
  client.release();
}

export async function withDbClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbPool().connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function closeDbPool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}
