param(
    [Parameter(Mandatory=$false)]
    [string]$ServerIP,
    
    [Parameter(Mandatory=$false)]
    [string]$Username
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   SIEM Honeypot Deploy Script (UAT)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (-not $ServerIP) {
    $ServerIP = Read-Host "Enter Server IP (e.g. 192.168.1.100)"
}
if (-not $Username) {
    $Username = Read-Host "Enter Username (e.g. root or ubuntu)"
}

Write-Host "`n[1/3] Packing project files (excluding heavy logs/node_modules)..." -ForegroundColor Yellow
$exclude = @(".git", "node_modules", "frontend/node_modules", "backend/node_modules", "siem-logs", "webtrap-logs", "cowrie-config/var")
$tarCommand = "tar -cf deploy.tar"
foreach ($item in Get-ChildItem -Name) {
    $skip = $false
    foreach ($ex in $exclude) {
        if ($item -like "$ex*") { $skip = $true; break }
    }
    if (-not $skip) {
        $tarCommand += " $item"
    }
}
Invoke-Expression $tarCommand
Write-Host "Project packed as deploy.tar successfully." -ForegroundColor Green

Write-Host "`n[2/3] Uploading project to UAT Server ($ServerIP)..." -ForegroundColor Yellow
Write-Host ">>> YOU WILL BE PROMPTED FOR YOUR PASSWORD <<<" -ForegroundColor Cyan
scp deploy.tar ${Username}@${ServerIP}:~/deploy.tar

Write-Host "`n[3/3] Extracting and starting Docker on UAT Server..." -ForegroundColor Yellow
Write-Host ">>> YOU WILL BE PROMPTED FOR YOUR PASSWORD AGAIN <<<" -ForegroundColor Cyan
$remoteCommands = "
    mkdir -p ~/honeypot-siem && 
    tar -xf ~/deploy.tar -C ~/honeypot-siem && 
    rm ~/deploy.tar && 
    cd ~/honeypot-siem && 
    cp .env.example .env && 
    chmod +x nginx/generate-ssl.sh && 
    bash nginx/generate-ssl.sh && 
    echo 'Starting Docker Containers...' && 
    sudo docker compose up -d --build
"
ssh ${Username}@${ServerIP} $remoteCommands

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT COMPLETE!" -ForegroundColor Green
Write-Host "Your SIEM Dashboard should be live at: https://$ServerIP" -ForegroundColor Cyan
Write-Host "Honeypot is listening on: $ServerIP:2222" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Remove-Item deploy.tar -ErrorAction SilentlyContinue
