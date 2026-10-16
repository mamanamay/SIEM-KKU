#requires -Version 5.1
<#
.SYNOPSIS
Copy the updated source files with SCP, then rebuild their three services.
.EXAMPLE
.\deploy.ps1 -ServerIP 10.101.104.234 -Username napat -RemoteDir '~/siem_v2'
.EXAMPLE
.\deploy.ps1 -ServerIP 10.101.104.234 -Username napat -UploadOnly
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')][string]$ServerIP,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$Username,
    [string]$RemoteDir = '~/siem_v2',
    [ValidateRange(1, 65535)][int]$Port = 22,
    [string]$IdentityFile,
    [string]$EnvFile,
    [string]$ComposeProjectName,
    [switch]$UploadOnly,
    [switch]$CheckOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$localUploadDir = $null
$uploadName = 'siem-direct-' + [Guid]::NewGuid().ToString('N')
$sourceFiles = @(
    'backend/src/ai.service.ts'
    'backend/src/app.module.ts'
    'backend/src/attacks.controller.ts'
    'backend/src/auth.controller.ts'
    'backend/src/cve-intel.service.ts'
    'backend/src/cve.controller.ts'
    'backend/src/data-source.ts'
    'backend/src/developer-api/catalog.service.ts'
    'backend/src/entities/attack.entity.ts'
    'backend/src/entities/cve-finding.entity.ts'
    'backend/src/events.gateway.ts'
    'backend/src/http-context.ts'
    'backend/src/incident-evidence.service.ts'
    'backend/src/incident-local-analysis.ts'
    'backend/src/report-narrative.ts'
    'backend/src/cve-translation.ts'
    'backend/src/entities/cve-translation.entity.ts'
    'backend/src/migrations/1792137600000-CveThaiTranslation.ts'
    'backend/src/incident-report-template.ts'
    'backend/src/incident-report.controller.ts'
    'backend/src/ingest.controller.ts'
    'backend/src/log.service.ts'
    'backend/src/migrations/1792100000000-IncidentEvidence.ts'
    'backend/src/outbound-http.ts'
    'backend/src/receipt.service.ts'
    'backend/src/report-filters.ts'
    'backend/src/report-query.service.ts'
    'backend/src/settings.controller.ts'
    'detection-engine/parsers/firewall_parser.py'
    'detection-engine/parsers/nginx_parser.py'
    'detection-engine/schemas/event.py'
    'frontend/src/lib/ReportEngine/CveSimilarityEngine.ts'
    'frontend/src/lib/ReportEngine/ReportWizardV2.svelte'
    'frontend/src/lib/ReportEngine/reportWorkflow.ts'
    'frontend/src/lib/ReportEngine/liveReportEdit.ts'
    'frontend/src/lib/ReportEngine/types.ts'
    'frontend/src/lib/components/AiAnalysisBlock.svelte'
    'frontend/src/routes/dashboard/cve/+page.svelte'
    'frontend/src/routes/dashboard/+layout.svelte'
    'frontend/src/routes/dashboard/explorer/+page.svelte'
    'frontend/src/routes/dashboard/hunting/+page.svelte'
    'frontend/src/routes/dashboard/soar/+page.svelte'
    'frontend/src/routes/dashboard/settings/developer-api/+page.svelte'
    'frontend/src/routes/wallboard/+page.svelte'
    'frontend/src/stores/events.ts'
    'frontend/src/stores/faculties.ts'
    'frontend/src/stores/globalReportStore.ts'
    'frontend/src/lib/utils/wallboardMap.ts'
    'frontend/src/lib/utils/kkuai.ts'
    'frontend/src/lib/workspace/layout.css'
)
$fileCount = $sourceFiles.Count
function ConvertTo-ShellLiteral([string]$Value) {
    if ($Value -match '[\r\n\x00]') { throw 'Invalid remote argument.' }
    $q = [string][char]39
    return $q + $Value.Replace($q, ($q + '\' + $q + $q)) + $q
}
function Get-SourceHash([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
try {
    if ($UploadOnly -and $CheckOnly) { throw 'Use either -UploadOnly or -CheckOnly.' }
    if ($RemoteDir -notmatch '^(~/|/)' -or $RemoteDir -in @('/', '~/', '/home', '/root')) { throw 'RemoteDir must point to the existing application.' }
    foreach ($value in @($RemoteDir, $EnvFile, $ComposeProjectName)) { if ($value -match '[\r\n\x00]') { throw 'Invalid remote argument.' } }
    $ssh = @(Get-Command ssh.exe -CommandType Application -ErrorAction Stop)[0].Source
    $scp = @(Get-Command scp.exe -CommandType Application -ErrorAction Stop)[0].Source
    $sshArgs = @('-p', [string]$Port, '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6')
    $scpArgs = @('-P', [string]$Port, '-r')
    if ($IdentityFile) {
        $key = (Resolve-Path -LiteralPath $IdentityFile -ErrorAction Stop).ProviderPath
        $sshArgs += @('-i', $key)
        $scpArgs += @('-i', $key)
    }
    # One SCP connection sends ordinary source directories, never an archive.
    # Only the explicit file list and the embedded command script are included.
    $localUploadDir = Join-Path ([IO.Path]::GetTempPath()) $uploadName
    New-Item -ItemType Directory -Path $localUploadDir -ErrorAction Stop > $null
    $hashRows = @()
    foreach ($file in $sourceFiles) {
        $source = Join-Path $PSScriptRoot $file
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing source file: $file" }
        $dest = Join-Path $localUploadDir $file
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest)) > $null
        Copy-Item -LiteralPath $source -Destination $dest
        $hashRows += (Get-SourceHash $dest) + '  ' + $file
    }
    $remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail
upload="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
app_arg="$1" mode="$2" env_override="${3:-}" project_override="${4:-}"
case "$mode" in deploy|upload|check) ;; *) exit 2;; esac
case "$app_arg" in '~/'*) app_arg="$HOME/${app_arg:2}";; /*) ;; *) echo ABSOLUTE_APPLICATION_PATH_REQUIRED >&2; exit 2;; esac
app="$(cd -- "$app_arg" && pwd -P)"
[[ -d "$app/backend/src" && -d "$app/frontend/src" && -d "$app/detection-engine" ]] || { echo WRONG_APPLICATION_DIRECTORY >&2; exit 1; }
printf 'STEP 1/4: checking uploaded files and existing deployment\n'
(cd -- "$upload"; sha256sum --check --status <<'DIRECT_SOURCE_HASHES'
__HASH_ROWS__
DIRECT_SOURCE_HASHES
)
sudo -v
label() { sudo docker inspect --format "{{index .Config.Labels \"$2\"}}" "$1"; }
ids="$(sudo docker ps --no-trunc -q --filter label=com.docker.compose.service=backend --filter label=com.docker.compose.oneoff=False)"
matches=()
while IFS= read -r id; do
  [[ -n "$id" ]] || continue
  [[ "$(label "$id" com.docker.compose.project.working_dir)" = "$app" ]] || continue
  [[ -z "$project_override" || "$(label "$id" com.docker.compose.project)" = "$project_override" ]] || continue
  matches+=("$id")
done <<< "$ids"
[[ "${#matches[@]}" = 1 ]] || { echo EXISTING_BACKEND_NOT_UNIQUE >&2; exit 1; }
backend_id="${matches[0]}"
project="$(label "$backend_id" com.docker.compose.project)"
config_label="$(label "$backend_id" com.docker.compose.project.config_files)"
env_label="$(label "$backend_id" com.docker.compose.project.environment_file)"
[[ -n "$project" && "$project" != '<no value>' && -n "$config_label" && "$config_label" != '<no value>' ]] || { echo COMPOSE_LABELS_MISSING >&2; exit 1; }
compose_args=(--project-directory "$app" -p "$project")
if [[ -n "$env_override" ]]; then
  case "$env_override" in '~/'*) env_override="$HOME/${env_override:2}";; /*) ;; *) echo ABSOLUTE_ENV_FILE_REQUIRED >&2; exit 2;; esac
  env_files=("$env_override")
elif [[ -n "$env_label" && "$env_label" != '<no value>' ]]; then
  IFS=',' read -r -a env_files <<< "$env_label"
else
  env_files=("$app/.env")
fi
for env_file in "${env_files[@]}"; do
  [[ "$env_file" = /* ]] && sudo test -f "$env_file" || { echo ENV_FILE_MISSING >&2; exit 1; }
  compose_args+=(--env-file "$env_file")
done
IFS=',' read -r -a config_files <<< "$config_label"
for config_file in "${config_files[@]}"; do
  [[ "$config_file" = /* ]] && sudo test -f "$config_file" || { echo COMPOSE_FILE_MISSING >&2; exit 1; }
  compose_args+=(-f "$config_file")
done
dc() { sudo docker compose "${compose_args[@]}" "$@"; }
cd -- "$app"
dc config --quiet
[[ "$(dc ps -q backend)" = "$backend_id" ]] || { echo COMPOSE_BACKEND_MISMATCH >&2; exit 1; }
printf 'PROJECT=%s\nAPPLICATION=%s\n' "$project" "$app"
if [[ "$mode" = check ]]; then echo 'CHECK_COMPLETE: __FILE_COUNT__ source files ready'; exit 0; fi
legacy_pids="$(pgrep -u "$(id -u)" -f '[.]siem-incident-[a-f0-9]+/remote-entry[.]sh' || true)"
[[ -z "$legacy_pids" ]] || { echo 'PREVIOUS_DEPLOY_RUNNING: stop the old deployment with Ctrl+C first' >&2; exit 1; }
if [[ "$mode" = deploy ]]; then
  postgres_id="$(dc ps -a -q postgres)"
  [[ -n "$postgres_id" ]] || { echo EXISTING_POSTGRES_NOT_FOUND >&2; exit 1; }
  if [[ "$(sudo docker inspect --format '{{.State.Running}}' "$postgres_id")" = true ]]; then
    processes="$(sudo docker top "$postgres_id" -eo pid,comm)"
    if awk 'NR > 1 && $2 == "pg_dump" { found=1 } END { exit !found }' <<< "$processes"; then
      echo 'PREVIOUS_PG_DUMP_RUNNING: finish or stop the previous backup before restarting backend' >&2
      exit 1
    fi
  fi
fi
printf 'STEP 2/4: copying __FILE_COUNT__ source files\n'
sudo bash -s -- "$upload" "$app" <<'COPY_DIRECT_SOURCE'
set -euo pipefail
umask 022
upload="$1" app="$2"
files=(
__FILE_ROWS__
)
for file in "${files[@]}"; do
  target="$app/$file"
  resolved="$(readlink -m -- "$target")"
  [[ "$resolved" = "$target" && ! -L "$target" ]] || { printf 'SYMLINK_DESTINATION_REFUSED: %s\n' "$file" >&2; exit 1; }
  [[ ! -e "$target" || -f "$target" ]] || { printf 'NON_FILE_DESTINATION: %s\n' "$file" >&2; exit 1; }
done
for file in "${files[@]}"; do
  target="$app/$file"
  mkdir -p -- "$(dirname -- "$target")"
  if [[ -f "$target" ]]; then
    cp -- "$upload/$file" "$target"
  else
    cp -- "$upload/$file" "$target"
    chmod 0644 -- "$target"
  fi
  printf 'UPDATED %s\n' "$file"
done
cd -- "$app"
sha256sum --check --status <<'DIRECT_SOURCE_HASHES'
__HASH_ROWS__
DIRECT_SOURCE_HASHES
COPY_DIRECT_SOURCE
printf 'UPLOAD_COMPLETE___FILE_COUNT___FILES\n'
if [[ "$mode" = upload ]]; then exit 0; fi
printf 'STEP 3/4: building backend, frontend, detection-engine\n'
dc --progress plain build backend frontend detection-engine
# Start the existing database without replacing its container or persistent volume.
ensure_postgres_ready() {
  printf 'Waiting for the existing PostgreSQL database (up to 120 seconds)\n'
  if ! dc up -d --no-deps --no-build --no-recreate --wait --wait-timeout 120 postgres; then
    echo 'POSTGRES_NOT_READY: deployment stopped before migration checks; inspect PostgreSQL logs' >&2
    dc ps -a postgres || true
    dc logs --no-color --tail=60 postgres || true
    return 1
  fi
}
ensure_postgres_ready
# Backend startup applies migrations; reject unrelated pending work before up.
migrations="$(dc run -T --rm --no-deps -e FORCE_COLOR=0 backend npm run migration:show)"
printf '%s\n' "$migrations"
clean="$(printf '%s\n' "$migrations" | sed -E 's/\x1B\[[0-9;]*[[:alpha:]]//g' | tr -d '\r')"
for expected in IncidentEvidence1792100000000 CveThaiTranslation1792137600000; do
  grep -Eq "^\[(X| )\] ([0-9]+ )?$expected$" <<< "$clean" || { printf 'EXPECTED_MIGRATION_NOT_FOUND: %s\n' "$expected" >&2; exit 1; }
done
pending="$(sed -n 's/^[[:space:]]*\[ \][[:space:]]*//p' <<< "$clean")"
while IFS= read -r migration; do
  [[ -z "$migration" || "$migration" = IncidentEvidence1792100000000 || "$migration" = CveThaiTranslation1792137600000 ]] || { printf 'OTHER_PENDING_MIGRATION: %s\n' "$migration" >&2; exit 1; }
done <<< "$pending"
printf 'STEP 4/4: starting the three updated services\n'
for service in detection-engine backend frontend; do
  dc up -d --no-deps --no-build --wait --wait-timeout 180 "$service"
done
dc ps
printf 'DEPLOY_COMPLETE\n'
'@
    $remoteScript = $remoteScript.Replace('__FILE_ROWS__', (($sourceFiles | ForEach-Object { '  ' + (ConvertTo-ShellLiteral $_) }) -join "`n"))
    $remoteScript = $remoteScript.Replace('__HASH_ROWS__', ($hashRows -join "`n")).Replace('__FILE_COUNT__', [string]$fileCount).Replace("`r`n", "`n") + "`n"
    [IO.File]::WriteAllText((Join-Path $localUploadDir 'deploy-direct.sh'), $remoteScript, (New-Object Text.UTF8Encoding($false)))
    $destination = "$Username@$ServerIP"
    $mode = 'deploy'
    if ($UploadOnly) { $mode = 'upload' }
    if ($CheckOnly) { $mode = 'check' }
    Write-Host "Sending $fileCount source files from $PSScriptRoot using SCP. Mode: $mode"
    Write-Host 'SCP/SSH and sudo may request your password.'
    & $scp @scpArgs $localUploadDir "${destination}:./.$uploadName"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed (exit $LASTEXITCODE). Application files were not copied." }
    $remote = 'cd && exec bash ' + (ConvertTo-ShellLiteral ".$uploadName/deploy-direct.sh") + ' ' +
        (ConvertTo-ShellLiteral $RemoteDir) + ' ' + (ConvertTo-ShellLiteral $mode) + ' ' +
        (ConvertTo-ShellLiteral $EnvFile) + ' ' + (ConvertTo-ShellLiteral $ComposeProjectName)
    & $ssh @sshArgs '-t' $destination $remote
    if ($LASTEXITCODE -ne 0) { throw "Deploy stopped (exit $LASTEXITCODE). Fix the error above and rerun. Uploaded files: ~/.$uploadName" }
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    if ($localUploadDir -and (Test-Path -LiteralPath $localUploadDir)) {
        $resolved = [IO.Path]::GetFullPath($localUploadDir)
        $expected = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) $uploadName))
        $item = Get-Item -LiteralPath $localUploadDir
        if ($resolved -ceq $expected -and $item.Name -ceq $uploadName -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}
