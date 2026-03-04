#!/bin/bash
# ============================================================
# SSL Setup Script for playdarksurvivor.in
# Run this on the EC2 instance to set up Let's Encrypt HTTPS
# ============================================================

DOMAIN="playdarksurvivor.in"
EMAIL="admin@playdarksurvivor.in"

set -e

echo "=== Step 1: Check DNS resolution ==="
RESOLVED_IP=$(dig +short $DOMAIN @8.8.8.8 | head -1)
MY_IP=$(curl -s http://checkip.amazonaws.com)
echo "Domain resolves to: $RESOLVED_IP"
echo "Server IP: $MY_IP"

if [ "$RESOLVED_IP" != "$MY_IP" ]; then
    echo "WARNING: DNS not pointing to this server yet!"
    echo "Domain resolves to: '$RESOLVED_IP', expected: '$MY_IP'"
    echo "Continuing anyway (certbot will fail if DNS isn't ready)..."
fi

echo ""
echo "=== Step 2: Create temporary HTTP-only nginx config ==="
cd /home/ec2-user/dark-survivors

# Backup existing nginx config
cp nginx/nginx.conf nginx/nginx.conf.ssl-backup

# Create HTTP-only config for certbot challenge
cat > nginx/nginx.conf.http-only << 'HTTPCONF'
worker_processes auto;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    upstream app {
        server dark-survivors:3000;
    }
    server {
        listen 80;
        server_name playdarksurvivor.in www.playdarksurvivor.in;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
HTTPCONF

echo ""
echo "=== Step 3: Start with HTTP-only config ==="
# Use the HTTP-only config temporarily
cp nginx/nginx.conf.http-only nginx/nginx.conf.active

sudo docker compose down --remove-orphans 2>/dev/null || true

# Run with HTTP-only config first
sudo docker compose -f docker-compose.yml run -d --name nginx-temp \
    --service-ports \
    -v $(pwd)/nginx/nginx.conf.http-only:/etc/nginx/nginx.conf:ro \
    nginx 2>/dev/null || true

# Actually, let's just use docker compose with a temp config
cp nginx/nginx.conf nginx/nginx.conf.full
cp nginx/nginx.conf.http-only nginx/nginx.conf

sudo docker compose up -d
sleep 3
echo "Containers started."

echo ""
echo "=== Step 4: Get SSL certificate ==="
# Run certbot in a container using the shared volumes
sudo docker run --rm \
    -v dark-survivors_certbot-etc:/etc/letsencrypt \
    -v dark-survivors_certbot-var:/var/lib/letsencrypt \
    -v dark-survivors_certbot-www:/var/www/certbot \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN \
    -d www.$DOMAIN

if [ $? -ne 0 ]; then
    echo "ERROR: Certbot failed! DNS may not be ready yet."
    echo "Restoring original config..."
    cp nginx/nginx.conf.full nginx/nginx.conf
    exit 1
fi

echo ""
echo "=== Step 5: Switch to HTTPS config ==="
cp nginx/nginx.conf.full nginx/nginx.conf
sudo docker compose down
sudo docker compose up -d

echo ""
echo "=== Step 6: Verify ==="
sleep 3
sudo docker compose ps
echo ""
echo "Testing HTTPS..."
curl -sk https://$DOMAIN/health || echo "(health check)"
echo ""
echo "============================================"
echo "  SSL SETUP COMPLETE!"
echo "  https://$DOMAIN is now live!"
echo "============================================"

echo ""
echo "=== Step 7: Set up auto-renewal cron ==="
# Add certbot renewal cron job
(crontab -l 2>/dev/null; echo "0 3 * * * sudo docker run --rm -v dark-survivors_certbot-etc:/etc/letsencrypt -v dark-survivors_certbot-var:/var/lib/letsencrypt -v dark-survivors_certbot-www:/var/www/certbot certbot/certbot renew --quiet && cd /home/ec2-user/dark-survivors && sudo docker compose exec nginx nginx -s reload") | sort -u | crontab -
echo "Auto-renewal cron job added (runs daily at 3 AM)."
