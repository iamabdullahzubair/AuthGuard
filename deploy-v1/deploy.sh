#!/usr/bin/env bash
# ==============================================================================
# AuthGuard V1 - Zero-Build Production Deployment Script with Auto-Rollback
# ==============================================================================
# Features:
#   - Automated Rollback on deployment/health check failure
#   - Pulls pre-compiled versioned containers from GHCR (Zero EC2 load)
#   - Automatic Let's Encrypt SSL management
# ==============================================================================
set -e

echo "========================================================"
echo "🚀 AuthGuard V1 Deployment (GHCR Registry Edition)"
echo "========================================================"

# Step 1: Resolve Target Image Version and Track Previous Working Tag
export IMAGE_TAG="${IMAGE_TAG:-v1-latest}"
TAG_FILE=".current_v1_tag"
PREVIOUS_TAG=$(cat "$TAG_FILE" 2>/dev/null || echo "")

echo "🏷️  Target Version:   $IMAGE_TAG"
if [ -n "$PREVIOUS_TAG" ]; then
    echo "⏮️  Previous Version: $PREVIOUS_TAG (Safe Rollback Target)"
else
    echo "⏮️  Previous Version: None recorded (Initial V1 Run)"
fi

COMPOSE_FILE="deploy-v1/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Error: Could not find $COMPOSE_FILE in $(pwd)"
    exit 1
fi

# Explicit project directory and env file
DOCKER_CMD="docker compose --project-directory . --env-file .env -f $COMPOSE_FILE"

# ==============================================================================
# 🛡️ AUTOMATED ROLLBACK ENGINE
# ==============================================================================
rollback() {
    echo ""
    echo "========================================================"
    echo "🚨 CRITICAL: Deployment Verification Failed!"
    echo "========================================================"
    if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$IMAGE_TAG" ]; then
        echo "⏪ Initiating Automatic Rollback to working version: $PREVIOUS_TAG"
        IMAGE_TAG="$PREVIOUS_TAG" $DOCKER_CMD up -d --force-recreate app nginx
        echo "✅ Rollback executed! Server restored to $PREVIOUS_TAG."
    else
        echo "⚠️ No different previous version available to roll back to."
        echo "📋 Dumping recent container logs for debugging:"
        $DOCKER_CMD logs --tail=30 postgres app nginx || true
    fi
    echo "========================================================"
    exit 1
}

# Step 2: Ensure .env exists in project root
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env not found in project root. Copying from .env.example..."
    cp .env.example .env
fi

# Step 3: Free up disk space on EC2 (Deletes unused Docker images & cache, NEVER touches volumes)
echo "🧹 Pruning unused Docker images and build caches to free disk space..."
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true

echo "💾 Available Disk Space on Server:"
df -h / | awk 'NR==2 {print "   Free: " $4 " of " $2 " (" $5 " used)"}'

# Step 4: Remove any legacy/stale containers holding ports (80, 443, 6379, 5432)
echo "🧹 Cleaning up legacy containers and releasing port allocations..."
docker rm -f auth_redis_v1 auth_postgres_v1 auth_app_v1 auth_nginx_v1 auth_certbot_v1 \
             auth_redis auth_postgres auth_app auth_nginx auth_certbot 2>/dev/null || true

# Step 5: Ensure initial self-signed SSL certs exist so Nginx can boot immediately
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

# Step 5: Pull pre-compiled images from GHCR (Zero CPU/RAM spike on EC2!)
echo "📥 Pulling images from GitHub Container Registry (ghcr.io)..."
$DOCKER_CMD pull app nginx || {
    echo "⚠️ Warning: Could not pull specific tag. Attempting local images..."
}

# Step 6: Launch all V1 containers
echo "⚡ Launching V1 application containers..."
$DOCKER_CMD up -d postgres redis || rollback
$DOCKER_CMD up -d app nginx certbot || rollback

# Step 7: Detect Active Dynamic Public IP & nip.io Domain
echo "🔍 Detecting active AWS Public IP..."
PUBLIC_IP=$(curl -s -m 4 http://checkip.amazonaws.com 2>/dev/null || curl -s -m 4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN="${PUBLIC_IP}.nip.io"

echo "🌐 Current Server Public IP: $PUBLIC_IP"
echo "🌐 Active Platform Domain:  $DOMAIN"

# Step 8: Automatically acquire Let's Encrypt SSL if missing
HAS_CERT="no"
if $DOCKER_CMD exec certbot test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
    HAS_CERT="yes"
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

# Step 9: Sync the active domain's SSL certificates to Nginx
if $DOCKER_CMD exec certbot test -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null; then
    echo "🔒 Installing Let's Encrypt SSL certificates into Nginx..."
    mkdir -p ./nginx/ssl
    $DOCKER_CMD exec certbot cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem > ./nginx/ssl/cert.pem 2>/dev/null || true
    $DOCKER_CMD exec certbot cat /etc/letsencrypt/live/$DOMAIN/privkey.pem > ./nginx/ssl/key.pem 2>/dev/null || true
    $DOCKER_CMD restart nginx >/dev/null 2>&1 || true
fi

# Step 10: Live Health Verification Loop
echo "🔍 Verifying platform health via https://${DOMAIN}/api/health..."
MAX_RETRIES=8
RETRY_COUNT=0
HEALTHY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Health check attempt $RETRY_COUNT of $MAX_RETRIES..."
    
    HTTP_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/api/health" 2>/dev/null || curl -k -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3001/api/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo "✅ Backend API is healthy and responding with 200 OK."
        HEALTHY=1
        break
    fi
    sleep 3
done

if [ "$HEALTHY" -ne 1 ]; then
    echo "❌ Health check failed after $MAX_RETRIES attempts!"
    rollback
fi

# Record newly verified working tag for future rollbacks
echo "$IMAGE_TAG" > "$TAG_FILE"

echo ""
echo "========================================================"
echo "📊 Current Container Status (V1):"
echo "========================================================"
$DOCKER_CMD ps

echo ""
echo "========================================================"
echo "🎉 Deployment Successful & Verified!"
echo "🏷️  Active Version: $IMAGE_TAG (Saved to $TAG_FILE)"
echo "🌐 Platform URL:  https://${DOMAIN}/"
echo "========================================================"
