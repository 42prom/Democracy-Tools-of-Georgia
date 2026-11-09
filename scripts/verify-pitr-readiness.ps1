[CmdletBinding()]
param(
    [string]$ProjectName = "antygravity",
    [string]$ComposeFile = "docker-compose.yml"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composePath = (Resolve-Path (Join-Path $repoRoot $ComposeFile)).Path
$composeArgs = @("compose", "-p", $ProjectName, "-f", $composePath)
$containerId = (& docker @composeArgs ps -q postgres).Trim()
if ($LASTEXITCODE -ne 0 -or $containerId -notmatch '^[0-9a-f]{12,64}$') {
    throw "The selected Compose project's postgres service is not running."
}

$dbUser = (& docker exec $containerId printenv POSTGRES_USER).Trim()
$dbName = (& docker exec $containerId printenv POSTGRES_DB).Trim()
if ($dbUser -notmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$' -or $dbName -notmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$') {
    throw "Postgres user or database name is not safe for inspection."
}

$sql = @"
SELECT json_build_object(
  'archive_mode', current_setting('archive_mode'),
  'archive_command_configured', current_setting('archive_command') NOT IN ('', '(disabled)'),
  'archive_timeout_seconds', current_setting('archive_timeout'),
  'wal_level', current_setting('wal_level'),
  'max_wal_senders', current_setting('max_wal_senders')::integer,
  'in_recovery', pg_is_in_recovery()
)::text;
"@
$raw = (& docker exec $containerId psql -X -U $dbUser -d $dbName -Atc $sql).Trim()
if ($LASTEXITCODE -ne 0 -or -not $raw) { throw "Could not inspect PostgreSQL WAL settings." }
$status = $raw | ConvertFrom-Json
$ready = $status.archive_mode -eq 'on' -and
         $status.archive_command_configured -eq $true -and
         $status.wal_level -in @('replica', 'logical') -and
         [int]$status.max_wal_senders -gt 0 -and
         $status.in_recovery -eq $false

[pscustomobject]@{
    project = $ProjectName
    postgres_container = $containerId.Substring(0, 12)
    pitr_ready = $ready
    archive_mode = $status.archive_mode
    archive_command_configured = $status.archive_command_configured
    archive_timeout_seconds = $status.archive_timeout_seconds
    wal_level = $status.wal_level
    max_wal_senders = $status.max_wal_senders
    in_recovery = $status.in_recovery
} | ConvertTo-Json

if (-not $ready) {
    throw "PITR is not ready: continuous WAL archiving is not fully configured."
}
