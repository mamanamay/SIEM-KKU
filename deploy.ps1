param(
    [string]$ServerIP,
    [string]$Username,
    [string]$RemoteDir = '~/siem_kku',
    [switch]$PackOnly,
    [switch]$UseExistingPackage,
    [switch]$UploadOnly
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($PackOnly -and $UseExistingPackage) { throw 'Choose -PackOnly or -UseExistingPackage.' }
if ($PackOnly -and $UploadOnly) { throw 'Choose -PackOnly or -UploadOnly.' }
if ($PackOnly) {
$items = @(Get-Content -LiteralPath scripts/deploy-files.txt | Where-Object { $_.Trim() -and -not $_.StartsWith('#') })
foreach ($item in $items) {
    if (-not (Test-Path -LiteralPath $item)) { throw "Release source missing: $item. Package from the updated worktree, or use -UseExistingPackage to upload the verified archive." }
}
foreach ($item in (Get-Content -LiteralPath scripts/deploy-required-files.txt)) {
    if ($item.Trim() -and -not $item.StartsWith('#') -and -not (Test-Path -LiteralPath $item)) { throw "Required release source missing: $item. Use the updated worktree or -UseExistingPackage." }
}
$tarArgs = @('-czf', 'deploy.tar.gz', '--exclude=__pycache__', '--exclude=*.pyc', '--exclude=*.spec.ts', '--exclude=test-support', '--exclude=.jest-cache', '--exclude=.env', '--exclude=.test-deps', '--exclude=release-info.json') + $items
& tar @tarArgs
if ($LASTEXITCODE -ne 0) { throw 'Release archive failed' }
Write-Host 'Release created: deploy.tar.gz (secrets, certificates and live data excluded)'
$hash = (Get-FileHash -LiteralPath deploy.tar.gz -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'deploy.tar.gz.sha256'), "$hash  deploy.tar.gz`n", [System.Text.UTF8Encoding]::new($false))
}
& (Join-Path $PSScriptRoot 'scripts/check-package.ps1') -Archive (Join-Path $PSScriptRoot 'deploy.tar.gz')
if ($PackOnly) { return }
if (-not $ServerIP -or -not $Username) { throw 'Provide -ServerIP and -Username, or use -PackOnly.' }
if ($ServerIP -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*$' -or $Username -notmatch '^[a-zA-Z_][a-zA-Z0-9_-]*$') { throw 'Invalid SSH host/user' }
if ($RemoteDir -notmatch '^(~/|/)([a-zA-Z0-9_-][a-zA-Z0-9_.-]*/?)+$') { throw 'RemoteDir must name a specific directory without traversal' }
$segments=$RemoteDir.Replace('~/','').Split('/')
if ($segments -contains '..' -or $segments -contains '.') { throw 'RemoteDir contains traversal.' }
$destination = "${Username}@${ServerIP}"
$uploadName='.siem-upload-'+[Guid]::NewGuid().ToString('N')
& ssh $destination "umask 077; mkdir ~/$uploadName"
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare remote upload directory' }
& scp deploy.tar.gz deploy.tar.gz.sha256 scripts/install-release.py "${destination}:~/$uploadName/"
if ($LASTEXITCODE -ne 0) { throw 'Release upload failed' }
if ($UploadOnly) {
    Write-Host 'Upload verified locally. Run the following in the server SSH terminal (sudo may prompt for a password):'
    Write-Output "sudo python3 ~/$uploadName/install-release.py --archive ~/$uploadName/deploy.tar.gz --target $RemoteDir --deploy"
    return
}
$remoteScript = @"
set -euo pipefail
command -v python3 >/dev/null || { echo 'python3 required for release installation'; exit 1; }
cd ~/$uploadName
sha256sum -c deploy.tar.gz.sha256
echo '$((Get-FileHash -LiteralPath scripts/install-release.py -Algorithm SHA256).Hash.ToLowerInvariant())  install-release.py' | sha256sum -c -
python3 install-release.py --archive deploy.tar.gz --target $RemoteDir --deploy
"@
# Windows PowerShell can append CRLF when converting pipeline strings to native
# stdin even after Replace(). Normalize at the SSH receiver before Bash parses it.
$remoteScript.Replace("`r`n", "`n") | & ssh $destination "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; inspect migration/health logs. The local archive is preserved.' }
Write-Host 'Services healthy. Release archive preserved for review.'
