param(
    [Parameter(Mandatory=$false)][string]$ServerIP,
    [Parameter(Mandatory=$false)][string]$Username,
    [Parameter(Mandatory=$false)][string]$RemoteDir = "~/siem_kku"
)

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "    KKUSIEM Honeypot - Deploy to Server           " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $ServerIP) { $ServerIP = Read-Host "Enter Server IP (e.g. 10.101.104.234)" }
if (-not $Username) { $Username = Read-Host "Enter SSH Username (e.g. ubuntu)" }

# ────────────────────────────────────────────────────────────
# [1/4] Pack — เฉพาะไฟล์ที่ใช้รัน production จริงๆ
# ────────────────────────────────────────────────────────────
Write-Host "[1/4] Packing production files..." -ForegroundColor Yellow

$includeItems = @(
    "backend/src",
    "backend/package.json",
    "backend/package-lock.json",
    "backend/tsconfig.json",
    "backend/tsconfig.build.json",
    "backend/nest-cli.json",
    "backend/Dockerfile",
    "frontend/src",
    "frontend/static",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/svelte.config.js",
    "frontend/vite.config.ts",
    "frontend/tsconfig.json",
    "frontend/Dockerfile",
    "detection-engine/api",
    "detection-engine/core",
    "detection-engine/engine",
    "detection-engine/features",
    "detection-engine/fusion",
    "detection-engine/parsers",
    "detection-engine/schemas",
    "detection-engine/database",
    "detection-engine/models_registry",
    "detection-engine/main.py",
    "detection-engine/requirements.txt",
    "detection-engine/Dockerfile",
    "nginx/nginx.conf",
    "docker-compose.yml"
)

$excludePatterns = @(
    "node_modules",
    "__pycache__",
    "*.pyc",
    "*.log",
    ".svelte-kit",
    "dist",
    "build",
    ".git"
)

$tarArgs = "-czf deploy.tar.gz "
foreach ($ex in $excludePatterns) {
    $tarArgs += "--exclude='$ex' "
}
foreach ($item in $includeItems) {
    $tarArgs += "$item "
}

try {
    Invoke-Expression "tar $tarArgs"
    $size = [math]::Round((Get-Item deploy.tar.gz).Length / 1MB, 2)
    Write-Host "  [OK] deploy.tar.gz ($size MB)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] tar failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ────────────────────────────────────────────────────────────
# [2/4] Upload
# ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2/4] Uploading to ${Username}@${ServerIP}..." -ForegroundColor Yellow
scp deploy.tar.gz "${Username}@${ServerIP}:~/deploy.tar.gz"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] SCP upload failed" -ForegroundColor Red
    Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  [OK] Upload complete" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# [3/4] Extract + Restart containers บน server
# ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Extracting and restarting on server..." -ForegroundColor Yellow

$remoteScript = @"
set -e
echo '  -> Extracting...'
mkdir -p $RemoteDir
tar -xzf ~/deploy.tar.gz -C $RemoteDir
rm -f ~/deploy.tar.gz

cd $RemoteDir

# ตรวจว่า .env มีอยู่แล้ว (ต้องวางไว้บน server ก่อน deploy)
if [ ! -f .env ]; then
  echo '[ERROR] .env not found in $RemoteDir — วาง .env บน server ก่อนแล้วค่อย deploy ใหม่'
  exit 1
fi

echo '  -> Building and restarting containers...'
docker compose build --no-cache
docker compose up -d

echo ''
echo '  -> Container status:'
docker compose ps
"@

ssh "${Username}@${ServerIP}" $remoteScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Remote script failed" -ForegroundColor Red
    Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  [OK] Server updated" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# [4/4] Cleanup local tar
# ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Cleaning up local temp file..." -ForegroundColor Yellow
Remove-Item deploy.tar.gz -ErrorAction SilentlyContinue
Write-Host "  [OK] Done" -ForegroundColor Green

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  DEPLOYMENT COMPLETE                             " -ForegroundColor Cyan
Write-Host "  Dashboard : https://$ServerIP`:18443           " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
