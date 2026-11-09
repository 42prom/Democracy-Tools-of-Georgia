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
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
    throw "The selected Compose project's postgres service is not running."
}
if ($containerId -notmatch '^[0-9a-f]{12,64}$') {
    throw "Unexpected postgres container identifier."
}

$dbUser = (& docker exec $containerId printenv POSTGRES_USER).Trim()
$dbName = (& docker exec $containerId printenv POSTGRES_DB).Trim()
if ($dbUser -notmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$' -or $dbName -notmatch '^[A-Za-z_][A-Za-z0-9_-]{0,62}$') {
    throw "Postgres user or database name is not safe for the restore drill."
}

$suffix = [DateTime]::UtcNow.ToString("yyyyMMddHHmmss")
$restoreDb = "dtg_restore_drill_$suffix"
$remoteBackup = "/tmp/$restoreDb.dump"
$createdRestoreDb = $false

try {
    & docker exec $containerId pg_dump -U $dbUser -d $dbName -Fc -f $remoteBackup
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }

    & docker exec $containerId createdb -U $dbUser $restoreDb
    if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated restore database." }
    $createdRestoreDb = $true

    & docker exec $containerId pg_restore -U $dbUser -d $restoreDb --no-owner --no-privileges $remoteBackup
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }

    $verification = (& docker exec $containerId psql -U $dbUser -d $restoreDb -Atc @"
SELECT
  (SELECT count(*) FROM schema_migrations) || '|' ||
  (SELECT count(*) FROM admin_users) || '|' ||
  (SELECT count(*) FROM polls) || '|' ||
  (SELECT count(*) FROM audit_log);
"@).Trim()
    if ($LASTEXITCODE -ne 0 -or $verification -notmatch '^\d+\|\d+\|\d+\|\d+$') {
        throw "Restored database verification failed."
    }

    Write-Output "Restore drill passed (schema_migrations|admin_users|polls|audit_log=$verification)."
}
finally {
    if ($createdRestoreDb) {
        & docker exec $containerId dropdb -U $dbUser --if-exists --force $restoreDb | Out-Null
    }
    & docker exec $containerId rm -f $remoteBackup | Out-Null
}

