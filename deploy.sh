#!/usr/bin/env bash
# Production One-Click Deployment Script for AuthGuard on AWS EC2
set -e

echo "========================================================"
echo "🚀 Deploying AuthGuard Multi-Tenant Platform to AWS..."
echo "========================================================"

# Step 1: Discard local uncommitted overrides on server
git checkout deploy.sh init-letsencrypt.sh 2>/dev/null || true

# Step 2: Pull latest code & pre-compiled static assets
echo "📥 Pulling latest code from GitHub..."
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "prod")
git pull origin "$BRANCH"

# Step 3: Ensure .env exists
if [ ! -f .env ]; then
    echo "⚠️ Warning: .env not found. Copying from .env.example..."
    cp .env.example .env
fi

# Step 4: Build & Launch all containers (postgres, redis, app, nginx, certbot)
echo "⚡ Building & launching application containers..."
docker compose up -d postgres redis
docker compose up -d --build app nginx
docker compose up -d certbot

# Step 5: Detect Active Dynamic Public IP & nip.io Domain
echo "🔍 Detecting active AWS Public IP..."
PUBLIC_IP=$(curl -s -m 4 http://checkip.amazonaws.com 2>/dev/null || curl -s -m 4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN="${PUBLIC_IP}.nip.io"

echo "🌐 Current Server Public IP: $PUBLIC_IP"
echo "🌐 Active Platform Domain:  $DOMAIN"

# Step 6: Automatically acquire Let's Encrypt SSL if IP changed or cert missing
HAS_CERT="no"
if docker ps | grep -q auth_certbot; then
    if docker exec auth_certbot test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
        HAS_CERT="yes"
    fi
fi

if [ "$HAS_CERT" != "yes" ]; then
    echo "🔒 New AWS IP detected ($PUBLIC_IP)! Requesting fresh Let's Encrypt SSL certificate for $DOMAIN..."
    docker compose run --rm --entrypoint "\
      certbot certonly --webroot -w /var/www/certbot \
        --email admin@${DOMAIN} \
        -d ${DOMAIN} \
        --agree-tos \
        --non-interactive" certbot || true
fi

# Step 7: Sync the active domain's SSL certificates to Nginx
if docker exec auth_certbot test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
    echo "🔒 Installing Let's Encrypt SSL certificates for $DOMAIN into Nginx..."
    docker exec auth_certbot cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem > ./nginx/ssl/cert.pem 2>/dev/null || true
    docker exec auth_certbot cat /etc/letsencrypt/live/$DOMAIN/privkey.pem > ./nginx/ssl/key.pem 2>/dev/null || true
    docker compose restart nginx >/dev/null 2>&1 || true
fi

echo ""
echo "========================================================"
echo "📊 Current Container Status:"
echo "========================================================"
docker compose ps

echo ""
echo "========================================================"
echo "✅ Deployment Successful!"
echo "🌐 Platform URL: https://${DOMAIN}/"
echo "📱 Authenticator PWA: https://${DOMAIN}/pwa/"
echo "========================================================"
