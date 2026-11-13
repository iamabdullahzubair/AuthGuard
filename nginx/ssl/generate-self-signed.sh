#!/usr/bin/env bash
# Generates temporary self-signed SSL certs so Nginx can start immediately
set -e

SSL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
    echo "Generating temporary self-signed certificate in $SSL_DIR..."
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
        -keyout "$SSL_DIR/key.pem" \
        -out "$SSL_DIR/cert.pem" \
        -subj "/CN=localhost/O=AuthGuard/C=US"
    echo "Temporary certificate generated."
else
    echo "Certificate already exists in $SSL_DIR."
fi
