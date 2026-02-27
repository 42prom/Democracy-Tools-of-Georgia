import fs from 'fs/promises';
import path from 'path';
import { query } from './client';

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

interface Migration {
  version: number;
  filename: string;
  sql: string;
}

/**
 * Create migrations tracking table if it doesn't exist
 */
async function createMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<Set<number>> {
  const result = await query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return new Set(result.rows.map(row => row.version));
}

/**
 * Get list of available migration files
 */
async function getAvailableMigrations(): Promise<Migration[]> {
  console.log('Searching for migrations in:', MIGRATIONS_DIR);
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  const migrations: Migration[] = [];

  for (const filename of sqlFiles) {
    const match = filename.match(/^(\d+)_/);
    if (!match) {
      console.warn(`Skipping migration file with invalid name: ${filename}`);
      continue;
    }

    const version = parseInt(match[1], 10);
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = await fs.readFile(filepath, 'utf-8');

    migrations.push({ version, filename, sql });
  }

  return migrations;
}

/**
 * Apply a single migration
 */
async function applyMigration(migration: Migration): Promise<void> {
  console.log(`Applying migration ${migration.version}: ${migration.filename}`);

  try {
    // Execute migration SQL
    await query(migration.sql);

    // Record migration as applied
    await query(
      'INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)',
      [migration.version, migration.filename]
    );

    console.log(`✓ Migration ${migration.version} applied successfully`);
  } catch (error) {
    console.error(`✗ Migration ${migration.version} failed:`, error);
    throw error;
  }
}

/**
 * Detect if Docker initdb.d already applied migrations (tables exist but
 * schema_migrations is empty). If so, record all existing migrations as
 * already applied to prevent re-running them.
 */
async function detectDockerInit(
  appliedVersions: Set<number>,
  availableMigrations: Migration[]
): Promise<void> {
  if (appliedVersions.size > 0) return; // Already tracking

  // Check if key tables from migration 001 already exist (Docker init ran)
  const result = await query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'polls'
    ) AS polls_exist
  `);

  if (!result.rows[0]?.polls_exist) return; // Fresh database

  console.log('Detected Docker-initialized database. Checking column existence...');

  // Only record as applied if we actually see the columns from later migrations
  // e.g., migration 010 adds device_key_thumbprint
  const columnCheck = await query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'device_key_thumbprint'
    ) AS col_exists
  `);

  if (!columnCheck.rows[0]?.col_exists) {
    console.warn('⚠️  Database has tables but missing required columns (e.g., device_key_thumbprint). Skipping auto-record of all migrations.');
    return;
  }

  console.log('Recording existing migrations in schema_migrations...');

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

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  console.log('Starting database migrations...\n');

  try {
    // Create migrations tracking table
    await createMigrationsTable();

    // Get applied and available migrations
    const appliedVersions = await getAppliedMigrations();
    const availableMigrations = await getAvailableMigrations();

    // Detect and handle Docker-initialized databases
    await detectDockerInit(appliedVersions, availableMigrations);

    // Re-read applied versions after potential Docker init detection
    const updatedAppliedVersions = await getAppliedMigrations();

    // Filter pending migrations
    const pendingMigrations = availableMigrations.filter(
      m => !updatedAppliedVersions.has(m.version)
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations. Database is up to date.');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s)\n`);

    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await applyMigration(migration);
    }

    console.log('\n✓ All migrations completed successfully');
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Check migration status
 */
export async function checkStatus(): Promise<void> {
  console.log('Checking database migration status...\n');

  try {
    // Ensure migrations table exists (just in case)
    await createMigrationsTable();

    const appliedVersions = await getAppliedMigrations();
    const availableMigrations = await getAvailableMigrations();
    
    // Check for Docker init simulation
    await detectDockerInit(appliedVersions, availableMigrations);
    const updatedAppliedVersions = await getAppliedMigrations();

    console.log(`\n[Migration Status]`);
    console.log(`Applied: ${updatedAppliedVersions.size}`);
    console.log(`Available: ${availableMigrations.length}`);

    const pending = availableMigrations.filter(m => !updatedAppliedVersions.has(m.version));

    if (pending.length > 0) {
      console.log(`\n⚠️  ${pending.length} Pending Migration(s):`);
      pending.forEach(m => console.log(` - ${m.version}: ${m.filename}`));
      process.exit(1); // Exit 1 to indicate pending migrations (useful for CI)
    } else {
      console.log('\n✓ Database is up to date.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Failed to check status:', error);
    process.exit(1);
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'status') {
    checkStatus();
  } else {
    runMigrations()
      .then(() => {
        console.log('\nDatabase migration complete');
        process.exit(0);
      })
      .catch((error) => {
        console.error('\nDatabase migration error:', error);
        process.exit(1);
      });
  }
}
