#!/bin/bash
# Generate a self-signed SSL certificate for the Honeypot Dashboard

CERTS_DIR="$(dirname "$0")/certs"
mkdir -p "$CERTS_DIR"

if [ -f "$CERTS_DIR/cert.pem" ]; then
    echo "SSL Certificate already exists in $CERTS_DIR"
    exit 0
fi

echo "Generating self-signed SSL certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/key.pem" \
    -out "$CERTS_DIR/cert.pem" \
    -subj "/C=TH/ST=Bangkok/L=Bangkok/O=Honeypot/OU=IT/CN=localhost"

echo "SSL Certificate generated successfully in $CERTS_DIR."
