#!/usr/bin/env bash
# Quick production deployment script for AWS EC2
set -e

echo "🚀 Deploying AuthGuard to AWS Server..."

# Ensure .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️ Please edit .env with your production credentials."
fi

# Build and start all services
echo "📦 Building and starting containers..."
docker compose down || true
docker compose build --pull
docker compose up -d

echo ""
echo "📊 Checking service status:"
docker compose ps

echo ""
echo "✅ Deployment complete! Check logs with: docker compose logs -f"
