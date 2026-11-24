#!/usr/bin/env bash
# ==============================================================================
# AuthGuard V1 - Zero-Build Production Deployment Script
# ==============================================================================
# Usage:
#   IMAGE_TAG="v1.0.1-sha-abc1234" ./deploy-v1/deploy.sh
# ==============================================================================
set -e

echo "========================================================"
echo "🚀 AuthGuard V1 Deployment (GHCR Registry Edition)"
echo "========================================================"

# Step 1: Resolve IMAGE_TAG
export IMAGE_TAG="${IMAGE_TAG:-v1-latest}"
echo "🏷️  Deploying Image Version: $IMAGE_TAG"

# Step 2: Ensure .env exists in project root
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env not found in project root. Copying from .env.example..."
    cp .env.example .env
fi

COMPOSE_FILE="deploy-v1/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Error: Could not find $COMPOSE_FILE in $(pwd)"
    exit 1
fi

# Use --project-directory . to resolve ./nginx/ssl and --env-file to load root .env
DOCKER_CMD="docker compose --project-directory . --env-file .env -f $COMPOSE_FILE"

# Step 3: Ensure initial self-signed SSL certs exist so Nginx can boot immediately
mkdir -p ./nginx/ssl
if [ ! -f ./nginx/ssl/cert.pem ] || [ ! -f ./nginx/ssl/key.pem ]; then
    echo "🔒 Generating initial self-signed SSL certificate for Nginx boot..."
    chmod +x ./nginx/ssl/generate-self-signed.sh 2>/dev/null || true
    ./nginx/ssl/generate-self-signed.sh 2>/dev/null || {
        openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
            -keyout ./nginx/ssl/key.pem \
            -out ./nginx/ssl/cert.pem \
            -subj "/CN=localhost/O=AuthGuard/C=US" 2>/dev/null || true
    }
fi

# Step 4: Stop legacy V0 containers to release ports (80, 443, 6379, 5432)
echo "🛑 Stopping legacy V0 containers (if running) to prevent port conflicts..."
docker stop auth_nginx auth_app auth_postgres auth_redis auth_certbot 2>/dev/null || true

# Step 4: Pull pre-compiled images from GHCR (Zero CPU/RAM spike on EC2!)
echo "📥 Pulling images from GitHub Container Registry (ghcr.io)..."
$DOCKER_CMD pull app nginx || {
    echo "⚠️  Warning: Could not pull specific tag. Attempting to run existing local images..."
}

# Step 5: Launch all V1 containers (postgres, redis, app, nginx, certbot)
echo "⚡ Launching V1 application containers..."
$DOCKER_CMD up -d postgres redis
$DOCKER_CMD up -d app nginx
$DOCKER_CMD up -d certbot

# Step 6: Detect Active Dynamic Public IP & nip.io Domain
echo "🔍 Detecting active AWS Public IP..."
PUBLIC_IP=$(curl -s -m 4 http://checkip.amazonaws.com 2>/dev/null || curl -s -m 4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN="${PUBLIC_IP}.nip.io"

echo "🌐 Current Server Public IP: $PUBLIC_IP"
echo "🌐 Active Platform Domain:  $DOMAIN"

# Step 7: Automatically acquire Let's Encrypt SSL if IP changed or cert missing
HAS_CERT="no"
if docker ps | grep -q auth_certbot_v1; then
    if docker exec auth_certbot_v1 test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
        HAS_CERT="yes"
    fi
fi

if [ "$HAS_CERT" != "yes" ]; then
    echo "🔒 Requesting fresh Let's Encrypt SSL certificate for $DOMAIN..."
    mkdir -p ./nginx/ssl
    $DOCKER_CMD run --rm --entrypoint "\
      certbot certonly --webroot -w /var/www/certbot \
        --email admin@${DOMAIN} \
        -d ${DOMAIN} \
        --agree-tos \
        --non-interactive" certbot || true
fi

# Step 8: Sync the active domain's SSL certificates to Nginx
if docker exec auth_certbot_v1 test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
    echo "🔒 Installing Let's Encrypt SSL certificates into Nginx..."
    mkdir -p ./nginx/ssl
    docker exec auth_certbot_v1 cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem > ./nginx/ssl/cert.pem 2>/dev/null || true
    docker exec auth_certbot_v1 cat /etc/letsencrypt/live/$DOMAIN/privkey.pem > ./nginx/ssl/key.pem 2>/dev/null || true
    $DOCKER_CMD restart nginx >/dev/null 2>&1 || true
fi

echo ""
echo "========================================================"
echo "📊 Current Container Status (V1):"
echo "========================================================"
$DOCKER_CMD ps

echo ""
echo "========================================================"
echo "✅ Deployment Successful!"
echo "🏷️  Live Version: $IMAGE_TAG"
echo "🌐 Platform URL: https://${DOMAIN}/"
echo "========================================================"
