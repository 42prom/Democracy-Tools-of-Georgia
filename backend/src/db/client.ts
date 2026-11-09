import { Pool, PoolClient } from 'pg';
import { getDatabaseUrl } from '../config/secrets';

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 10000, // 10 seconds max query time
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

function databaseErrorMetadata(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return { message: 'Unknown database error' };
  }
  const dbError = error as Record<string, unknown>;
  return {
    message: typeof dbError.message === 'string' ? dbError.message : 'Database operation failed',
    code: dbError.code,
    constraint: dbError.constraint,
    table: dbError.table,
    severity: dbError.severity,
  };
}

/**
 * Execute a query with the connection pool
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    // Never log PostgreSQL `detail`: uniqueness errors can include nullifiers,
    // identifiers, or other values from bound parameters.
    console.error('Database query error', { text, error: databaseErrorMetadata(error) });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    const operational = Boolean(
      error && typeof error === 'object' && (error as Record<string, unknown>).isOperational
    );
    if (!operational) {
      console.error('Database transaction error:', databaseErrorMetadata(error));
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database connection health
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed', error);
    return false;
  }
}

interface DatabaseRoleSecurity {
  role_name: string;
  is_superuser: boolean;
  can_create_role: boolean;
  can_create_db: boolean;
  can_replicate: boolean;
  can_bypass_rls: boolean;
  can_create_public: boolean;
  owns_database: boolean;
  owned_objects: string | number;
}

/** Prove that the web process is not connected as an owner or administrator. */
export async function assertRestrictedDatabaseRole(): Promise<void> {
  const result = await pool.query<DatabaseRoleSecurity>(`
    SELECT current_user AS role_name,
           role.rolsuper AS is_superuser,
           role.rolcreaterole AS can_create_role,
           role.rolcreatedb AS can_create_db,
           role.rolreplication AS can_replicate,
           role.rolbypassrls AS can_bypass_rls,
           has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public,
           database.datdba = role.oid AS owns_database,
           (SELECT COUNT(*)
              FROM pg_class object
              JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
             WHERE object.relowner = role.oid
               AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
               AND namespace.nspname NOT LIKE 'pg_toast%') AS owned_objects
      FROM pg_roles role
      JOIN pg_database database ON database.datname = current_database()
     WHERE role.rolname = current_user
  `);
  const role = result.rows[0];
  if (!role) throw new Error('Unable to inspect the PostgreSQL runtime role.');
  const unsafe = role.is_superuser || role.can_create_role || role.can_create_db ||
    role.can_replicate || role.can_bypass_rls || role.can_create_public ||
    role.owns_database || Number(role.owned_objects) > 0;
  if (unsafe) {
    throw new Error(`PostgreSQL runtime role '${role.role_name}' is privileged or owns schema objects.`);
  }
}

/**
 * Close all database connections (for graceful shutdown)
 */
export async function close(): Promise<void> {
  await pool.end();
}

// Export pool both as named and default export
export { pool };
export default pool;
