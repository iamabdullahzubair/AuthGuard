#!/usr/bin/env bash
# Automated Let's Encrypt SSL setup script for AuthGuard on AWS / Production VPS
set -e

if [ "$#" -lt 1 ]; then
    AUTO_IP=$(curl -s -m 3 http://checkip.amazonaws.com 2>/dev/null || curl -s -m 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    if [ -n "$AUTO_IP" ]; then
        DOMAIN="${AUTO_IP}.nip.io"
        echo "Auto-detected server domain: $DOMAIN"
    else
        echo "Usage: ./init-letsencrypt.sh <your-domain.com> [your-email@example.com]"
        exit 1
    fi
else
    DOMAIN="$1"
fi
EMAIL="${2:-admin@$DOMAIN}"

echo "=========================================================="
echo "🔒 Setting up Let's Encrypt SSL for: $DOMAIN"
echo "   Contact Email: $EMAIL"
echo "=========================================================="

# 1. Ensure docker containers are up
echo "1. Starting services (Nginx, App, Postgres)..."
docker compose up -d postgres app nginx certbot

# 2. Wait for Nginx to be ready
echo "2. Waiting for Nginx to be accessible..."
sleep 5

# 3. Request certificate from Let's Encrypt using Certbot webroot mode
echo "3. Requesting certificate from Let's Encrypt..."
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $EMAIL \
    -d $DOMAIN \
    --rsa-key-size 4096 \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot

# 4. Copy generated certificates using docker cp (foolproof across all platforms)
echo "4. Installing certificates into Nginx SSL directory..."
docker cp auth_certbot:/etc/letsencrypt/live/$DOMAIN/fullchain.pem ./nginx/ssl/cert.pem
docker cp auth_certbot:/etc/letsencrypt/live/$DOMAIN/privkey.pem ./nginx/ssl/key.pem

# 5. Restart Nginx to load the new SSL certificate
echo "5. Restarting Nginx with new trusted SSL certificate..."
docker compose restart nginx

echo ""
echo "=========================================================="
echo "✅ SUCCESS! SSL Certificate successfully installed."
echo "   Website: https://$DOMAIN/"
echo "   PWA App: https://$DOMAIN/pwa/"
echo "=========================================================="
