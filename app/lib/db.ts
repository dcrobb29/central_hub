import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER!,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  database: process.env.DB_NAME!,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeout: 15000,
  requestTimeout: 15000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 15000,
  },
  options: {
    encrypt: process.env.DB_ENCRYPT !== "false",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
  },
};

// Reuse a single connection pool across requests instead of opening one per query.
let poolPromise: Promise<sql.ConnectionPool> | undefined;

function logPoolError(event: string, error: unknown) {
  const fields: Record<string, string | number> = {};
  if (error && typeof error === "object") {
    for (const key of ["name", "code", "number"] as const) {
      const value: unknown = Reflect.get(error, key);
      if (typeof value === "number" && Number.isFinite(value)
        || typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)) {
        fields[key] = value;
      }
    }
  }
  console.error(event, fields);
}

function connectPool(previous?: sql.ConnectionPool): Promise<sql.ConnectionPool> {
  const pending = (async () => {
    if (previous) {
      console.warn("SQL pool recovery started", { connected: previous.connected, healthy: previous.healthy });
      try {
        await previous.close();
      } catch (error) {
        logPoolError("SQL pool close failed", error);
        throw error;
      }
    }
    const pool = new sql.ConnectionPool(config);
    pool.on("error", error => logPoolError("SQL pool error", error));
    const started = Date.now();
    try {
      await pool.connect();
      console.info("SQL pool connected", { durationMs: Date.now() - started, recovered: Boolean(previous) });
      return pool;
    } catch (error) {
      logPoolError("SQL pool connection failed", error);
      throw error;
    }
  })();
  poolPromise = pending;
  void pending.catch(() => {
    if (poolPromise === pending) poolPromise = undefined;
  });
  return pending;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) return connectPool();
  const current = poolPromise;
  const pool = await current;
  if (pool.connected && pool.healthy) return pool;
  if (poolPromise !== current) return getPool();
  return connectPool(pool);
}

export { sql };
