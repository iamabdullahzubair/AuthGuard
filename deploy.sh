#!/usr/bin/env bash
# Production One-Click Deployment Script for AuthGuard on AWS EC2
set -e

echo "========================================================"
echo "🚀 Deploying AuthGuard Multi-Tenant Platform to AWS..."
echo "========================================================"

# Step 1: Discard local uncommitted overrides on server
if [ -f init-letsencrypt.sh ]; then
    git checkout init-letsencrypt.sh 2>/dev/null || true
fi

# Step 2: Pull latest code & pre-compiled static assets
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Step 3: Ensure .env exists
if [ ! -f .env ]; then
    echo "⚠️ Warning: .env not found. Copying from .env.example..."
    cp .env.example .env
fi

# Step 4: Build & Launch all containers (app, nginx, postgres, certbot)
echo "⚡ Building & launching application containers..."
docker compose up -d --build app
docker compose up -d nginx certbot

# Step 5: Ensure trusted Let's Encrypt certificates are active
if docker ps | grep -q auth_certbot; then
    docker exec auth_certbot cat /etc/letsencrypt/live/15.135.173.157.nip.io/fullchain.pem > ./nginx/ssl/cert.pem 2>/dev/null && \
    docker exec auth_certbot cat /etc/letsencrypt/live/15.135.173.157.nip.io/privkey.pem > ./nginx/ssl/key.pem 2>/dev/null && \
    docker compose restart nginx >/dev/null 2>&1 || true
fi

echo ""
echo "========================================================"
echo "📊 Current Container Status:"
echo "========================================================"
docker compose ps

echo ""
echo "✅ Deployment Successful!"
echo "🌐 Platform URL: https://15.135.173.157.nip.io/login"
echo "📱 Authenticator PWA: https://15.135.173.157.nip.io/pwa/"
echo "========================================================"
