# Cloudflare Tunnel Startup Script
# This exposes your local backend to the internet for mobile testing

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Cloudflare Tunnel for DTG Testing" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if cloudflared is installed
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
    Write-Host "cloudflared not found. Installing..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Run this command to install:" -ForegroundColor White
    Write-Host "  winget install Cloudflare.cloudflared" -ForegroundColor Green
    Write-Host ""
    Write-Host "Or download from:" -ForegroundColor White
    Write-Host "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Blue
    exit 1
}

Write-Host "Starting tunnel for backend (port 3000)..." -ForegroundColor Green
Write-Host ""
Write-Host "Once started, you'll get a URL like:" -ForegroundColor Yellow
Write-Host "  https://random-name.trycloudflare.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "Use this URL in your mobile app:" -ForegroundColor Yellow
Write-Host "  flutter run --dart-define=API_BASE_URL=https://YOUR-TUNNEL.trycloudflare.com/api/v1" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the tunnel" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Start the tunnel
cloudflared tunnel --url http://localhost:3000
