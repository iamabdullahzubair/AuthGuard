#!/usr/bin/env bash
# Automated Let's Encrypt SSL setup script for AuthGuard on AWS / Production VPS
set -e

if [ "$#" -lt 1 ]; then
    echo "Usage: ./init-letsencrypt.sh <your-domain.com> [your-email@example.com]"
    echo "Example: ./init-letsencrypt.sh 15.135.173.157.nip.io admin@example.com"
    exit 1
fi

DOMAIN="$1"
EMAIL="${2:-admin@$DOMAIN}"

echo "=========================================================="
echo "🔒 Setting up Let's Encrypt SSL for: $DOMAIN"
echo "   Contact Email: $EMAIL"
echo "=========================================================="

# 1. Ensure docker containers are up with initial self-signed cert
echo "1. Starting services (Nginx, App, Postgres)..."
docker compose up -d postgres app nginx

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

# 4. Copy generated certificates into Nginx SSL directory (dereferencing symlinks with cp -L)
echo "4. Installing certificates into Nginx SSL directory..."
docker compose exec -T nginx sh -c "\
  cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/nginx/ssl/cert.pem && \
  cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/nginx/ssl/key.pem && \
  chmod 600 /etc/nginx/ssl/key.pem && \
  chmod 644 /etc/nginx/ssl/cert.pem"

# 5. Reload Nginx
echo "5. Reloading Nginx with new trusted SSL certificate..."
docker compose exec nginx nginx -s reload

echo ""
echo "=========================================================="
echo "✅ SUCCESS! SSL Certificate successfully installed."
echo "   Website: https://$DOMAIN/"
echo "   PWA App: https://$DOMAIN/pwa/"
echo "=========================================================="
