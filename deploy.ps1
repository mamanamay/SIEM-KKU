param(
    [Parameter(Mandatory=$false)][string]$ServerIP,
    [Parameter(Mandatory=$false)][string]$Username
)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "    KKUSIEM Honeypot - Deploy to Server           " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $ServerIP) { $ServerIP = Read-Host "Enter Server IP (e.g. 192.168.1.100)" }
if (-not $Username) { $Username = Read-Host "Enter SSH Username (e.g. ubuntu or root)" }

# ----------------------------------------------------
# 1. Define files/folders to EXPLICITLY INCLUDE
# ----------------------------------------------------
$includeItems = @(
    "backend",
    ".env",
    "backend/.env",
    "frontend",
    "honeypots",
    "nginx",
    "tools",
    "docker-compose.yml",
    ".dockerignore",
    ".env.example",
    "README.md",
    "DEPLOY.md",
    "INGEST_GUIDE.md"
)

# ----------------------------------------------------
# 2. Define patterns to EXCLUDE from the included folders
# ----------------------------------------------------
$excludePatterns = @(
    "node_modules",
    "frontend/build", 
    "frontend/.svelte-kit",
    "backend/dist",
    "*.log"
)

Write-Host "[1/4] Packing project files (only necessary files for production)..." -ForegroundColor Yellow

$tarArgs = "-czf deploy.tar.gz "
foreach ($ex in $excludePatterns) {
    $tarArgs += "--exclude='$ex' "
}
foreach ($item in $includeItems) {
    $tarArgs += "$item "
}

try {
    Invoke-Expression "tar $tarArgs"
    Write-Host "  [OK] Packed -> deploy.tar.gz" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] tar failed. Make sure tar is available (Git Bash or Windows 10+)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/4] Uploading to ${Username}@${ServerIP}..." -ForegroundColor Yellow
Write-Host "      (You will be prompted for SSH password)" -ForegroundColor Cyan
scp deploy.tar.gz "${Username}@${ServerIP}:~/deploy.tar.gz"
Write-Host "  [OK] Upload complete" -ForegroundColor Green

Write-Host ""
Write-Host "[3/4] Extracting and starting on server..." -ForegroundColor Yellow
Write-Host "      (You will be prompted for SSH password again)" -ForegroundColor Cyan

# Define remote script as a simple string to avoid PowerShell parsing errors on older systems
$remoteScript = "set -e;"
$remoteScript += " echo '  -> Extracting files...';"
$remoteScript += " mkdir -p ~/honeypot-siem;"
$remoteScript += " tar -xzf ~/deploy.tar.gz -C ~/honeypot-siem;"
$remoteScript += " rm ~/deploy.tar.gz;"
$remoteScript += " cd ~/honeypot-siem;"
$remoteScript += " if [ ! -f .env ]; then cp .env.example .env; cp backend/.env.example backend/.env; echo '  [WARNING] .env created from template. Edit .env and backend/.env then run: cd ~/honeypot-siem && bash nginx/generate-ssl.sh && docker compose up -d --build'; exit 0; fi;"
$remoteScript += " chmod +x nginx/generate-ssl.sh;"
$remoteScript += " bash nginx/generate-ssl.sh;"
$remoteScript += " mkdir -p logs/siem logs/webtrap logs/cowrie honeypots/cowrie/var/lib/cowrie;"
$remoteScript += " docker compose build --no-cache;"
$remoteScript += " docker compose up -d;"
$remoteScript += " docker compose ps"

ssh "${Username}@${ServerIP}" $remoteScript

Write-Host ""
Write-Host "[4/4] Cleaning up..." -ForegroundColor Yellow
Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
Write-Host "  [OK] Cleaned" -ForegroundColor Green

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  [OK] DEPLOYMENT COMPLETE!                       " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Dashboard : https://$ServerIP" -ForegroundColor Green
Write-Host "  SSH Trap  : ${ServerIP}:2222" -ForegroundColor Green
Write-Host "  WebTrap   : http://${ServerIP}:8081" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
