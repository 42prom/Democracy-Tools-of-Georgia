[CmdletBinding()]
param(
    [string]$ComposeFile = "docker-compose.yml",
    [string]$EnvFile = ".env",
    [string]$ProjectName = "",
    [int]$MinimumFreeGiB = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composePath = (Resolve-Path (Join-Path $repoRoot $ComposeFile)).Path
$envPathCandidate = Join-Path $repoRoot $EnvFile

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found."
}

try {
    $null = docker version --format '{{.Server.Version}}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Engine is not reachable."
    }
}
catch {
    throw "Docker Engine is not reachable: $($_.Exception.Message)"
}

$composeArgs = @("compose")
if ($ProjectName) {
    $composeArgs += @("-p", $ProjectName)
}
if (Test-Path -LiteralPath $envPathCandidate) {
    $composeArgs += @("--env-file", $envPathCandidate)
}
$composeArgs += @("-f", $composePath, "config", "--format", "json")

$configJson = docker @composeArgs
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose configuration is invalid."
}

try {
    $config = ($configJson -join [Environment]::NewLine) | ConvertFrom-Json
}
catch {
    throw "Docker Compose returned invalid JSON: $($_.Exception.Message)"
}

$activeProject = if ($ProjectName) { $ProjectName } else { [string]$config.name }
if (-not $activeProject) {
    throw "Unable to determine the Compose project name."
}

$publishedPorts = @()
foreach ($serviceProperty in $config.services.PSObject.Properties) {
    $serviceName = $serviceProperty.Name
    foreach ($binding in @($serviceProperty.Value.ports)) {
        if ($null -eq $binding -or $null -eq $binding.published) {
            continue
        }

        $port = 0
        if (-not [int]::TryParse([string]$binding.published, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
            throw "Service '$serviceName' has an invalid published port."
        }

        $hostIp = [string]$binding.host_ip
        if ($hostIp -notin @("127.0.0.1", "::1")) {
            throw "Service '$serviceName' publishes port $port on '$hostIp'. Local services must bind only to loopback."
        }

        $publishedPorts += [pscustomobject]@{
            Service = $serviceName
            HostIp  = $hostIp
            Port    = $port
            Protocol = if ($binding.protocol) { [string]$binding.protocol } else { "tcp" }
        }
    }
}

$duplicates = $publishedPorts | Group-Object HostIp, Port, Protocol | Where-Object Count -gt 1
if ($duplicates) {
    $duplicateList = ($duplicates | ForEach-Object Name) -join ", "
    throw "Compose publishes duplicate host ports: $duplicateList"
}

$dockerOwnersByPort = @{}
foreach ($containerId in @(docker ps -q)) {
    if (-not $containerId) {
        continue
    }

    try {
        $labels = (docker inspect --format '{{json .Config.Labels}}' $containerId) | ConvertFrom-Json
        $bindings = (docker inspect --format '{{json .NetworkSettings.Ports}}' $containerId) | ConvertFrom-Json
        $containerName = (docker inspect --format '{{.Name}}' $containerId).TrimStart('/')
        $ownerProject = [string]$labels.'com.docker.compose.project'

        if ($null -eq $bindings) {
            continue
        }

        foreach ($containerPort in $bindings.PSObject.Properties) {
            foreach ($hostBinding in @($containerPort.Value)) {
                if ($null -eq $hostBinding -or -not $hostBinding.HostPort) {
                    continue
                }
                $hostPort = [int]$hostBinding.HostPort
                if (-not $dockerOwnersByPort.ContainsKey($hostPort)) {
                    $dockerOwnersByPort[$hostPort] = @()
                }
                $dockerOwnersByPort[$hostPort] += [pscustomobject]@{
                    Container = $containerName
                    Project   = $ownerProject
                    HostIp    = [string]$hostBinding.HostIp
                }
            }
        }
    }
    catch {
        throw "Failed to inspect running Docker container '$containerId': $($_.Exception.Message)"
    }
}

$listenersByPort = @{}
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    foreach ($listener in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)) {
        $listenerPort = [int]$listener.LocalPort
        if (-not $listenersByPort.ContainsKey($listenerPort)) {
            $listenersByPort[$listenerPort] = @()
        }
        $listenersByPort[$listenerPort] += $listener
    }
}

$conflicts = @()
Write-Host "Docker preflight for Compose project '$activeProject'" -ForegroundColor Cyan
foreach ($published in $publishedPorts | Sort-Object Port) {
    $dockerOwners = @(if ($dockerOwnersByPort.ContainsKey($published.Port)) {
        $dockerOwnersByPort[$published.Port]
    }
    else {
        @()
    })

    $foreignOwners = @($dockerOwners | Where-Object { $_.Project -ne $activeProject })
    if ($foreignOwners.Count -gt 0) {
        $ownerText = ($foreignOwners | ForEach-Object {
            if ($_.Project) { "$($_.Container) (project $($_.Project))" } else { $_.Container }
        }) -join ", "
        $conflicts += "$($published.Service) needs $($published.HostIp):$($published.Port), owned by $ownerText"
        Write-Host "[CONFLICT] $($published.Service) -> $($published.HostIp):$($published.Port) ($ownerText)" -ForegroundColor Red
        continue
    }

    if ($dockerOwners.Count -gt 0) {
        Write-Host "[OK] $($published.Service) -> $($published.HostIp):$($published.Port) (current project)" -ForegroundColor Green
        continue
    }

    if ($listenersByPort.ContainsKey($published.Port)) {
        $processNames = @($listenersByPort[$published.Port] | ForEach-Object {
            (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        } | Where-Object { $_ } | Sort-Object -Unique)
        $processText = if ($processNames.Count) { $processNames -join ", " } else { "unknown process" }
        $conflicts += "$($published.Service) needs $($published.HostIp):$($published.Port), used by $processText"
        Write-Host "[CONFLICT] $($published.Service) -> $($published.HostIp):$($published.Port) ($processText)" -ForegroundColor Red
        continue
    }

    Write-Host "[OK] $($published.Service) -> $($published.HostIp):$($published.Port) (available)" -ForegroundColor Green
}

$driveRoot = [System.IO.Path]::GetPathRoot($repoRoot)
$drive = [System.IO.DriveInfo]::new($driveRoot)
$freeGiB = [math]::Round($drive.AvailableFreeSpace / 1GB, 2)
if ($freeGiB -lt $MinimumFreeGiB) {
    $conflicts += "Only $freeGiB GiB is free on $driveRoot; minimum is $MinimumFreeGiB GiB"
    Write-Host "[CONFLICT] Free disk: $freeGiB GiB (minimum $MinimumFreeGiB GiB)" -ForegroundColor Red
}
else {
    Write-Host "[OK] Free disk: $freeGiB GiB" -ForegroundColor Green
}

$dockerVhd = Join-Path $env:LOCALAPPDATA "Docker\wsl\disk\docker_data.vhdx"
if (Test-Path -LiteralPath $dockerVhd) {
    $vhdGiB = [math]::Round((Get-Item -LiteralPath $dockerVhd).Length / 1GB, 2)
    if ($freeGiB -le ($vhdGiB + 5)) {
        Write-Host "[INFO] Offline full-VHD copy is not safe here: VHD $vhdGiB GiB, free $freeGiB GiB, required margin 5 GiB." -ForegroundColor Yellow
    }
    else {
        Write-Host "[INFO] Disk capacity is sufficient for an offline full-VHD copy; Docker must be stopped first." -ForegroundColor Yellow
    }
}

if ($conflicts.Count -gt 0) {
    Write-Host "Preflight failed with $($conflicts.Count) conflict(s). No Docker resources were changed." -ForegroundColor Red
    exit 1
}

Write-Host "Preflight passed. No Docker resources were changed." -ForegroundColor Green
