param(
    [Parameter(Mandatory=$false)][string]$ServerIP,
    [Parameter(Mandatory=$false)][string]$Username
)

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    KKUSIEM Honeypot — Deploy to Server           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if (-not $ServerIP) { $ServerIP = Read-Host "Enter Server IP (e.g. 192.168.1.100)" }
if (-not $Username) { $Username = Read-Host "Enter SSH Username (e.g. ubuntu or root)" }

# ── Files / folders to EXCLUDE from deployment ────────────────
$excludePatterns = @(
    ".git", ".gitattributes",
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

Write-Host "[1/4] Packing project files (excluding junk & node_modules)..." -ForegroundColor Yellow

# Build list of items to include (everything NOT in excludePatterns)
$includeItems = Get-ChildItem -Name | Where-Object {
    $item = $_
    $skip = $false
    foreach ($ex in $excludePatterns) {
        if ($item -like "$ex*" -or $item -eq $ex) { $skip = $true; break }
    }
    -not $skip
}

# Create tar using WSL or Git Bash tar
$tarArgs = "-czf deploy.tar.gz " + ($includeItems -join " ")
try {
    Invoke-Expression "tar $tarArgs"
    Write-Host "  ✅ Packed → deploy.tar.gz" -ForegroundColor Green
} catch {
    Write-Host "  ❌ tar failed. Make sure tar is available (Git Bash or WSL)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/4] Uploading to ${Username}@${ServerIP}..." -ForegroundColor Yellow
Write-Host "      (You will be prompted for SSH password)" -ForegroundColor Cyan
scp deploy.tar.gz "${Username}@${ServerIP}:~/deploy.tar.gz"
Write-Host "  ✅ Upload complete" -ForegroundColor Green

Write-Host ""
Write-Host "[3/4] Extracting & starting on server..." -ForegroundColor Yellow
Write-Host "      (You will be prompted for SSH password again)" -ForegroundColor Cyan

$remoteScript = @'
set -e
echo "  → Extracting files..."
mkdir -p ~/honeypot-siem
tar -xzf ~/deploy.tar.gz -C ~/honeypot-siem
rm ~/deploy.tar.gz
cd ~/honeypot-siem

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "  ⚠️  .env created from template. Edit it then run:"
  echo "      cd ~/honeypot-siem && bash nginx/generate-ssl.sh && docker compose up -d --build"
  exit 0
fi

chmod +x nginx/generate-ssl.sh
bash nginx/generate-ssl.sh
mkdir -p siem-logs webtrap-logs cowrie-config/var/log/cowrie cowrie-config/var/lib/cowrie
docker compose up -d --build
docker compose ps
'@

ssh "${Username}@${ServerIP}" $remoteScript

Write-Host ""
Write-Host "[4/4] Cleaning up..." -ForegroundColor Yellow
Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
Write-Host "  ✅ Cleaned" -ForegroundColor Green

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  ✅ DEPLOYMENT COMPLETE!                         ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Dashboard : https://$ServerIP" -ForegroundColor Green
Write-Host "║  SSH Trap  : ${ServerIP}:2222" -ForegroundColor Green
Write-Host "║  WebTrap   : http://${ServerIP}:8081" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
