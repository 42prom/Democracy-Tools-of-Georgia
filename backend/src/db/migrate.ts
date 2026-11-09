import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getClient, query } from './client';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  ? path.resolve(process.env.MIGRATIONS_DIR)
  : path.resolve(process.cwd(), 'db', 'migrations');

interface Migration {
  version: number;
  filename: string;
  sql: string;
  checksum: string;
}

interface AppliedMigration {
  version: number;
  filename: string;
  checksum: string | null;
}

// Releases before the consolidated 0001 baseline tracked one file per change.
// Those files were intentionally squashed, but deployed databases retain their
// original immutable filenames. This explicit manifest prevents a missing-file
// bypass while allowing the ledger to be normalized once with deterministic
// synthetic checksums.
const LEGACY_MIGRATION_FILENAMES: Readonly<Record<number, string>> = {
  0: '000_enable_pgcrypto.sql',
  1: '001_init.sql',
  2: '002_add_poll_rewards.sql',
  3: '003_create_regions.sql',
  4: '004_identity_system.sql',
  5: '005_settings_table.sql',
  6: '006_survey_questions.sql',
  7: '007_messages.sql',
  8: '008_enrollment_verification.sql',
  9: '009_user_rewards.sql',
  10: '010_fix_users_schema.sql',
  11: '011_make_pn_hash_nullable.sql',
  12: '012_add_names_to_users.sql',
  13: '013_add_pn_masked_to_users.sql',
  14: '014_biometric_rate_limits.sql',
  15: '015_add_published_at_to_messages.sql',
  16: '016_add_notifications_enabled.sql',
  17: '017_admin_auth.sql',
  18: '018_device_voter_policy.sql',
  19: '019_add_device_tokens.sql',
  20: '020_unlinkable_ballots.sql',
  21: '021_fix_regions_table.sql',
  22: '022_add_participant_user_index.sql',
  23: '023_add_nullifier_poll_index.sql',
  24: '024_add_wallet_binding.sql',
  25: '025_add_idempotency_keys.sql',
  26: '026_add_liveness_nonce.sql',
  27: '027_system_settings.sql',
  28: '028_add_credential_dob.sql',
  29: '029_make_device_key_nullable.sql',
  30: '030_tickets_system.sql',
  31: '031_wallet_transfers.sql',
  32: '032_fix_idempotency_fk_cascade.sql',
  33: '033_add_audit_export_events.sql',
  38: '0038_analytics_performance.sql',
  39: '0039_encrypted_votes.sql',
  41: '041_geo_blocking.sql',
  42: '042_remove_i18n_columns.sql',
  43: '043_remove_remaining_i18n_columns.sql',
};

function legacyLedgerChecksum(version: number, filename: string): string {
  return crypto
    .createHash('sha256')
    .update(`legacy-ledger:${version}:${filename}`, 'utf8')
    .digest('hex');
}

/**
 * Create migrations tracking table if it doesn't exist
 */
async function createMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64),
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum CHAR(64)`);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(): Promise<Map<number, AppliedMigration>> {
  const result = await query<AppliedMigration>(
    'SELECT version, filename, checksum FROM schema_migrations ORDER BY version'
  );
  return new Map(result.rows.map(row => [row.version, row]));
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

    const checksum = crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
    migrations.push({ version, filename, sql, checksum });
  }

  return migrations;
}

/**
 * Apply a single migration
 */
async function applyMigration(migration: Migration): Promise<void> {
  console.log(`Applying migration ${migration.version}: ${migration.filename}`);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Historical files may contain an outer transaction for direct psql use.
    // The runner owns it so schema changes and metadata commit atomically.
    const executableSql = migration.sql
      .replace(/^\s*BEGIN\s*;\s*/i, '')
      .replace(/\s*COMMIT\s*;\s*$/i, '');
    await client.query(executableSql);

    await client.query(
      'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
      [migration.version, migration.filename, migration.checksum]
    );
    await client.query('COMMIT');

    console.log(`✓ Migration ${migration.version} applied successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`✗ Migration ${migration.version} failed:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Detect if Docker initdb.d already applied migrations (tables exist but
 * schema_migrations is empty). If so, record all existing migrations as
 * already applied to prevent re-running them.
 */
async function detectDockerInit(
  appliedVersions: Map<number, AppliedMigration>,
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
        'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [migration.version, migration.filename, migration.checksum]
      );
    } catch {
      // Ignore errors — best effort
    }
  }

  console.log('✓ Existing migrations recorded in schema_migrations');
}

async function validateAndBackfillMigrationMetadata(
  applied: Map<number, AppliedMigration>,
  available: Migration[]
): Promise<void> {
  const availableByVersion = new Map(available.map(migration => [migration.version, migration]));
  for (const row of applied.values()) {
    const legacyFilename = LEGACY_MIGRATION_FILENAMES[row.version];
    if (legacyFilename === row.filename) {
      const expected = legacyLedgerChecksum(row.version, row.filename);
      if (!row.checksum) {
        await query('UPDATE schema_migrations SET checksum = $2 WHERE version = $1 AND checksum IS NULL', [
          row.version,
          expected,
        ]);
      } else if (row.checksum !== expected) {
        throw new Error(`Legacy migration ${row.version} ledger checksum mismatch`);
      }
      continue;
    }

    const migration = availableByVersion.get(row.version);
    if (!migration) {
      throw new Error(`Applied migration ${row.version} (${row.filename}) is missing from disk`);
    }
    if (migration.filename !== row.filename) {
      throw new Error(
        `Migration ${row.version} filename drift: database=${row.filename}, disk=${migration.filename}`
      );
    }
    if (!row.checksum) {
      await query('UPDATE schema_migrations SET checksum = $2 WHERE version = $1 AND checksum IS NULL', [
        row.version,
        migration.checksum,
      ]);
    } else if (row.checksum !== migration.checksum) {
      throw new Error(`Migration ${row.version} checksum mismatch; applied migrations are immutable`);
    }
  }
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
    await validateAndBackfillMigrationMetadata(updatedAppliedVersions, availableMigrations);

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
    await validateAndBackfillMigrationMetadata(updatedAppliedVersions, availableMigrations);

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
