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

# Files / folders to EXCLUDE from deployment
$excludePatterns = @(
    ".git", ".gitattributes", ".env",
    "node_modules",
    "frontend/node_modules", "backend/node_modules", "webtrap/node_modules",
    "frontend/build", "frontend/.svelte-kit",
    "backend/dist",
    "siem-logs", "webtrap-logs",
    "check_divs.js", "fix_divs.js", "fix_text_2.js",
    "update_analytics.js", "update_ds.js", "test_db.js",
    "extract.py", "proxy.js",
    "simulate_attack.ps1", "start_proxy.ps1", "init-git.sh",
    "ip_records.json", "temp_faculties.txt",
    "CLAUDE.md", "docker-compose.dev.yml",
    "deploy.tar.gz", "deploy.tar"
)

Write-Host "[1/4] Packing project files (excluding junk and node_modules)..." -ForegroundColor Yellow

# Create tar command with proper --exclude flags so nested directories are ignored
$tarArgs = "-czf deploy.tar.gz "
foreach ($ex in $excludePatterns) {
    $tarArgs += "--exclude='$ex' "
}
$tarArgs += "."
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
$remoteScript += " if [ ! -f .env ]; then cp .env.example .env; echo '  [WARNING] .env created from template. Edit it then run: cd ~/honeypot-siem && bash nginx/generate-ssl.sh && docker compose up -d --build'; exit 0; fi;"
$remoteScript += " chmod +x nginx/generate-ssl.sh;"
$remoteScript += " bash nginx/generate-ssl.sh;"
$remoteScript += " mkdir -p siem-logs webtrap-logs cowrie-config/var/log/cowrie cowrie-config/var/lib/cowrie;"
$remoteScript += " docker compose up -d --build;"
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
