import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Use shared db/migrations/ directory (same as Docker init and backend runner)
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'db', 'migrations');

async function createMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<number>> {
  const result = await query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return new Set(result.rows.map(row => row.version));
}

async function getAvailableMigrations() {
  let files: string[];
  try {
    files = await fs.readdir(MIGRATIONS_DIR);
  } catch (error) {
    console.warn(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  const migrations = [];
  for (const filename of sqlFiles) {
    const match = filename.match(/^(\d+)_/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = await fs.readFile(filepath, 'utf-8');

    migrations.push({ version, filename, sql });
  }

  return migrations;
}

/**
 * Detect if Docker initdb.d already applied migrations (tables exist but
 * schema_migrations is empty). If so, record all existing migrations as
 * already applied to prevent re-running them.
 */
async function detectDockerInit(
  appliedVersions: Set<number>,
  availableMigrations: { version: number; filename: string }[]
) {
  if (appliedVersions.size > 0) return; // Already tracking — nothing to do

  // Check if key tables from migration 001 already exist (Docker init ran)
  const result = await query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'polls'
    ) AS polls_exist
  `);

  if (!result.rows[0]?.polls_exist) return; // Fresh database — no Docker init

  console.log('Detected Docker-initialized database. Recording existing migrations...');

  // Mark ALL available migrations as applied (Docker ran them via initdb.d)
  for (const migration of availableMigrations) {
    try {
      await query(
        'INSERT INTO schema_migrations (version, filename) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [migration.version, migration.filename]
      );
    } catch {
      // Ignore errors — best effort
    }
  }

  console.log('✓ Existing migrations recorded in schema_migrations');
}

async function applyMigration(migration: { version: number; filename: string; sql: string }) {
  console.log(`Applying migration ${migration.version}: ${migration.filename}`);

  await query(migration.sql);
  await query(
    'INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)',
    [migration.version, migration.filename]
  );

  console.log(`✓ Migration ${migration.version} applied`);
}

export async function runMigrations() {
  console.log('Starting migrations...\n');

  await createMigrationsTable();
  const appliedVersions = await getAppliedMigrations();
  const availableMigrations = await getAvailableMigrations();

  // Detect and handle Docker-initialized databases
  await detectDockerInit(appliedVersions, availableMigrations);

  // Re-read applied versions after potential Docker init detection
  const updatedAppliedVersions = await getAppliedMigrations();
  const pendingMigrations = availableMigrations.filter(m => !updatedAppliedVersions.has(m.version));

  if (pendingMigrations.length === 0) {
    console.log('No pending migrations.');
    return;
  }

  console.log(`Found ${pendingMigrations.length} pending migration(s)\n`);

  for (const migration of pendingMigrations) {
    await applyMigration(migration);
  }

  console.log('\n✓ All migrations completed');
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
