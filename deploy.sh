#!/bin/bash
# ============================================================
# KKUSIEM Honeypot Dashboard — Server Deploy Script (Linux)
# ============================================================
# Usage:  bash deploy.sh <SERVER_IP> <USERNAME>
# Example: bash deploy.sh 192.168.1.100 ubuntu
# ============================================================

set -e

SERVER_IP=${1:-""}
USERNAME=${2:-""}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║    KKUSIEM Honeypot — Deploy to Server           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Validate inputs ────────────────────────────────────────
if [ -z "$SERVER_IP" ]; then
  read -p "Enter Server IP (e.g. 192.168.1.100): " SERVER_IP
fi
if [ -z "$USERNAME" ]; then
  read -p "Enter SSH Username (e.g. ubuntu or root): " USERNAME
fi

echo ""
echo "[1/4] 📦 Packing project files (excluding node_modules, logs, certs)..."

tar --exclude='node_modules' \
    --exclude='logs' \
    --exclude='.git' \
    --exclude='frontend/node_modules' \
    --exclude='backend/node_modules' \
    --exclude='webtrap/node_modules' \
    --exclude='.env' \
    --exclude='backend/.env' \
    --exclude='frontend/build' \
    --exclude='frontend/.svelte-kit' \
    --exclude='backend/dist' \
    --exclude='siem-logs' \
    --exclude='webtrap-logs' \
    --exclude='cowrie-config/var/log/cowrie/*.json.*' \
    --exclude='cowrie-config/var/log/cowrie/*.log' \
    --exclude='nginx/certs/*.pem' \
    --exclude='nginx/certs/*.key' \
    --exclude='nginx/certs/*.crt' \
    --exclude='check_divs.js' \
    --exclude='fix_divs.js' \
    --exclude='fix_text_2.js' \
    --exclude='update_analytics.js' \
    --exclude='update_ds.js' \
    --exclude='test_db.js' \
    --exclude='extract.py' \
    --exclude='proxy.js' \
    --exclude='simulate_attack.ps1' \
    --exclude='start_proxy.ps1' \
    --exclude='CLAUDE.md' \
    --exclude='docker-compose.dev.yml' \
    -czf deploy.tar.gz .

echo "  ✅ Packed → deploy.tar.gz"
echo ""
echo "[2/4] 📤 Uploading to ${USERNAME}@${SERVER_IP}..."
echo "      (You will be prompted for SSH password)"
scp deploy.tar.gz ${USERNAME}@${SERVER_IP}:~/deploy.tar.gz
echo "  ✅ Upload complete"

echo ""
echo "[3/4] 🚀 Extracting & starting on server..."
echo "      (You will be prompted for SSH password again)"
ssh ${USERNAME}@${SERVER_IP} << 'REMOTE'
  set -e
  echo "  → Extracting files..."
  mkdir -p ~/honeypot-siem
  tar -xzf ~/deploy.tar.gz -C ~/honeypot-siem
  rm ~/deploy.tar.gz
  cd ~/honeypot-siem

  echo "  → Setting up .env..."
  if [ ! -f .env ]; then
    cp .env.example .env
    cp backend/.env.example backend/.env
    echo ""
    echo "  ⚠️  .env created from template. Please edit .env and backend/.env before continuing:"
    echo "      nano ~/honeypot-siem/.env"
    echo "      nano ~/honeypot-siem/backend/.env"
    echo ""
    echo "  After editing, run: cd ~/honeypot-siem && bash nginx/generate-ssl.sh && docker compose up -d --build"
    exit 0
  fi

  echo "  → Generating SSL certificate (if needed)..."
  chmod +x nginx/generate-ssl.sh
  bash nginx/generate-ssl.sh

  echo "  → Creating required log directories..."
  mkdir -p logs/siem logs/webtrap logs/cowrie honeypots/cowrie/var/lib/cowrie

  echo "  → Starting Docker containers..."
  docker compose up -d --build
  docker compose ps
REMOTE

echo ""
echo "[4/4] 🧹 Cleaning up local deploy package..."
rm -f deploy.tar.gz
echo "  ✅ Cleaned"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOYMENT COMPLETE!                         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Dashboard : https://${SERVER_IP}               "
echo "║  SSH Trap  : ${SERVER_IP}:2222                  "
echo "║  WebTrap   : http://${SERVER_IP}:8081           "
echo "╚══════════════════════════════════════════════════╝"
echo ""
