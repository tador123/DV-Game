#!/bin/bash
# ============================================================
# 🧛 DARK SURVIVORS — EC2 Deployment Script
# Run this as user-data when launching EC2, or SSH in and run:
#   chmod +x deploy.sh && sudo ./deploy.sh
# ============================================================

set -euo pipefail

REPO="https://github.com/tador123/DV-Game.git"
APP_DIR="/opt/dark-survivors"

echo "=========================================="
echo "  🧛 Dark Survivors — AWS Deployment"
echo "=========================================="

# ---------- 1. System updates ----------
echo "[1/6] Updating system packages..."
yum update -y

# ---------- 2. Install Docker ----------
echo "[2/6] Installing Docker..."
yum install -y docker git
systemctl enable docker
systemctl start docker

# ---------- 3. Install Docker Compose ----------
echo "[3/6] Installing Docker Compose..."
COMPOSE_VERSION="v2.27.0"
curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" \
    -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# Also install as Docker CLI plugin
mkdir -p /usr/local/lib/docker/cli-plugins
cp /usr/local/bin/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose

# ---------- 4. Clone repository ----------
echo "[4/6] Cloning repository..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull origin main
else
    git clone "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

# ---------- 5. Configure swap (t2.micro has only 1GB RAM) ----------
echo "[5/6] Configuring 1GB swap..."
if [ ! -f /swapfile ]; then
    dd if=/dev/zero of=/swapfile bs=128M count=8
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

# ---------- 6. Pull and start ----------
echo "[6/6] Pulling and starting containers..."
cd "$APP_DIR"
docker compose pull
docker compose up -d

# ---------- 7. Setup auto-restart on reboot ----------
cat > /etc/systemd/system/dark-survivors.service << 'EOF'
[Unit]
Description=Dark Survivors Game
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/dark-survivors
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dark-survivors.service

# ---------- 8. Setup automated daily backup of game data ----------
cat > /etc/cron.daily/backup-game-data << 'CRON'
#!/bin/bash
BACKUP_DIR="/opt/backups"
mkdir -p "$BACKUP_DIR"
docker cp dark-survivors:/app/data/data.json "$BACKUP_DIR/data-$(date +%Y%m%d).json" 2>/dev/null || true
# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "data-*.json" -mtime +7 -delete
CRON
chmod +x /etc/cron.daily/backup-game-data

# ---------- Done ----------
echo ""
echo "=========================================="
echo "  ✅ Deployment complete!"
echo "=========================================="
echo ""
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "YOUR_EC2_IP")
echo "  🌐 Game URL: http://$PUBLIC_IP"
echo "  📦 App dir:  $APP_DIR"
echo "  📋 Logs:     cd $APP_DIR && docker compose logs -f"
echo "  🔄 Update:   cd $APP_DIR && git pull && docker compose up -d --build"
echo ""
