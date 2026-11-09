# Database backup and recovery gate

Voting data must never rely on a Docker volume as its only copy. Production uses
an encrypted PostgreSQL backup system with continuous WAL archiving to storage in
a separate account, object-lock retention, separate restore credentials, and
alerts for every failed backup. The application database role must not be able to
delete or overwrite backups.

Release targets:

- Recovery point objective (RPO): 5 minutes or less.
- Recovery time objective (RTO): 30 minutes or less.
- Daily full/incremental backup according to the selected PostgreSQL platform,
  continuous WAL archiving, and at least 35 days of immutable retention.
- Monthly automated restore into an isolated environment and quarterly witnessed
  disaster-recovery exercise.
- Backup encryption keys are held outside the database and application runtime.
- A release is blocked when the most recent restore drill, WAL replay test, or
  backup alert is missing.

For a safe local validation against the already running Compose project:

```powershell
.\scripts\verify-backup-restore.ps1 -ProjectName antygravity
```

The script creates a uniquely named temporary database inside only the selected
project's PostgreSQL container, restores a custom-format dump, verifies critical
tables, and removes both the temporary database and dump in `finally`. It does not
publish ports, change the live database, retain a sensitive dump, or touch another
Compose project.

This local drill proves logical dump/restore compatibility. It does not replace a
production point-in-time-recovery drill or immutable off-site backup monitoring.

To inspect WAL/PITR configuration without changing the selected Compose project:

```powershell
.\scripts\verify-pitr-readiness.ps1 -ProjectName antygravity
```

The readiness check is intentionally fail-closed. The local developer database
normally has WAL archiving disabled and should therefore fail; production must
show `pitr_ready=true`, then separately prove an actual timestamp-targeted
restore from immutable off-site storage.
