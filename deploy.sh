#!/usr/bin/env bash
# Usage: bash deploy.sh --pack-only OR bash deploy.sh [--use-existing-package] HOST USER [~/siem_kku]
set -euo pipefail
cd "$(dirname "$0")"
use_existing=false
upload_only=false
if [[ "${1:-}" == '--upload-only' ]]; then upload_only=true; shift; fi
if [[ "${1:-}" == '--use-existing-package' ]]; then use_existing=true; shift; fi
if [[ "${1:-}" == '--pack-only' ]]; then
files=()
while IFS= read -r file || [[ -n "$file" ]]; do
  file=${file%$'\r'}
  [[ -z "$file" || "$file" == \#* ]] && continue
  files+=("$file")
done < scripts/deploy-files.txt
for file in "${files[@]}"; do [[ -e "$file" ]] || { echo "Release source missing: $file. Use the updated worktree or --use-existing-package." >&2; exit 1; }; done
while IFS= read -r file || [[ -n "$file" ]]; do
  file=${file%$'\r'}
  [[ -z "$file" || "$file" == \#* ]] && continue
  [[ -e "$file" ]] || { echo "Required release source missing: $file. Use the updated worktree or --use-existing-package." >&2; exit 1; }
done < scripts/deploy-required-files.txt
tar --exclude='__pycache__' --exclude='*.pyc' --exclude='*.spec.ts' --exclude='test-support' --exclude='.jest-cache' --exclude='.env' --exclude='.test-deps' --exclude='release-info.json' -czf deploy.tar.gz "${files[@]}"
echo 'Release created: deploy.tar.gz (secrets, certificates and live data excluded)'
sha256sum deploy.tar.gz > deploy.tar.gz.sha256
fi
bash scripts/check-package.sh deploy.tar.gz
[[ "${1:-}" != '--pack-only' ]] || exit 0
host=${1:?Provide HOST USER or --pack-only}
user=${2:?Provide SSH username}
remote=${3:-'~/siem_kku'}
[[ "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && "$user" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || { echo 'Invalid SSH host/user' >&2; exit 1; }
[[ "$remote" =~ ^(\~/|/)([a-zA-Z0-9_-][a-zA-Z0-9_.-]*/?)+$ ]] || { echo 'Invalid remote directory' >&2; exit 1; }
[[ "/${remote#\~/}/" != *'/../'* && "/${remote#\~/}/" != *'/./'* ]] || { echo 'Remote directory contains traversal' >&2; exit 1; }
destination="$user@$host"
upload_name=".siem-upload-$(date -u +%Y%m%dT%H%M%S)-$RANDOM-$RANDOM"
installer_hash=$(sha256sum scripts/install-release.py | cut -d ' ' -f 1)
ssh "$destination" "umask 077; mkdir ~/$upload_name"
scp deploy.tar.gz deploy.tar.gz.sha256 scripts/install-release.py "$destination:~/$upload_name/"
if "$upload_only"; then
  echo 'Run in the server SSH terminal (sudo may prompt for a password):'
  echo "sudo python3 ~/$upload_name/install-release.py --archive ~/$upload_name/deploy.tar.gz --target $remote --deploy"
  exit 0
fi
ssh "$destination" bash -s <<REMOTE
set -euo pipefail
command -v python3 >/dev/null || { echo 'python3 required for release installation'; exit 1; }
cd ~/$upload_name
sha256sum -c deploy.tar.gz.sha256
echo '$installer_hash  install-release.py' | sha256sum -c -
python3 install-release.py --archive deploy.tar.gz --target $remote --deploy
REMOTE
echo 'Services healthy. Release archive preserved for review.'
