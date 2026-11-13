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
git pull origin main

# Step 3: Ensure .env exists
if [ ! -f .env ]; then
    echo "⚠️ Warning: .env not found. Copying from .env.example..."
    cp .env.example .env
fi

# Step 4: Build & Launch all containers (postgres, redis, app, nginx, certbot)
echo "⚡ Building & launching application containers..."
docker compose up -d postgres redis
docker compose up -d --build app
docker compose up -d nginx certbot

# Step 5: Automatically sync active Let's Encrypt certificates to Nginx
CERT_DIR=""
if docker ps | grep -q auth_certbot; then
    CERT_DIR=$(docker exec auth_certbot sh -c 'ls -1 /etc/letsencrypt/live 2>/dev/null | grep -v README | head -n 1' 2>/dev/null || true)
    if [ -n "$CERT_DIR" ]; then
        echo "🔒 Syncing SSL certificates for domain: $CERT_DIR"
        docker exec auth_certbot cat /etc/letsencrypt/live/$CERT_DIR/fullchain.pem > ./nginx/ssl/cert.pem 2>/dev/null || true
        docker exec auth_certbot cat /etc/letsencrypt/live/$CERT_DIR/privkey.pem > ./nginx/ssl/key.pem 2>/dev/null || true
        docker compose restart nginx >/dev/null 2>&1 || true
    fi
fi

# Step 6: Determine Dynamic Public IP / Domain
PUBLIC_IP=$(curl -s -m 3 http://checkip.amazonaws.com 2>/dev/null || curl -s -m 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN="${CERT_DIR:-${PUBLIC_IP}.nip.io}"

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
