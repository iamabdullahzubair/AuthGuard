# Production Deployment Guide: AWS EC2 / Lightsail (Docker + Nginx + SSL)

This guide walks you through deploying the AuthGuard Authenticator system on an AWS EC2 instance (or Lightsail) with automated Docker Compose, Nginx reverse proxy, and free Let's Encrypt SSL.

---

## 1. AWS Prerequisites

### A. Launch an EC2 Instance
- **AMI**: Ubuntu Server 24.04 LTS (HVM) or 22.04 LTS
- **Instance Type**: `t3.micro` or `t4g.small` (Free tier eligible)
- **Storage**: 15–20 GB gp3 SSD
- **Elastic IP**: Allocate and associate an Elastic IP with your instance (so your public IP never changes upon reboot).

### B. Configure Security Group (Firewall)
Under **Inbound Rules**, open the following ports:

| Type | Protocol | Port Range | Source | Purpose |
|---|---|---|---|---|
| **SSH** | TCP | 22 | My IP (or `0.0.0.0/0`) | Server terminal access |
| **HTTP** | TCP | 80 | `0.0.0.0/0` | Web traffic & ACME SSL verification |
| **HTTPS** | TCP | 443 | `0.0.0.0/0` | Secure SSL Web & PWA traffic |

---

## 2. Point Your Domain (DNS Setup)

In your DNS provider (Route 53, Cloudflare, GoDaddy, Namecheap):
- Create an **A Record**:
  - **Name**: `auth` (or `@` for root domain)
  - **Type**: `A`
  - **Value**: Your AWS EC2 **Elastic Public IP** (e.g. `3.85.120.45`)
  - **TTL**: Auto / 300 seconds

*Wait 2–5 minutes for DNS propagation.* You can verify with:
```bash
nslookup auth.yourdomain.com
```

---

## 3. Server Setup (SSH into EC2)

Connect to your EC2 instance via SSH:
```bash
ssh -i "your-key.pem" ubuntu@your-ec2-ip
```

### Install Docker & Docker Compose (Single Command):
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install official Docker engine
curl -fsSL https://get.docker.com | sudo sh

# Allow non-root user to run Docker
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker and Docker Compose
docker --version
docker compose version
```

---

## 4. Deploy AuthGuard Application

### A. Clone Repository to the Server
```bash
git clone <your-repository-url>
cd webPushNotification
```

### B. Configure Environment Variables
Create your production `.env` file:
```bash
cp .env.example .env
nano .env
```

Ensure the following variables are filled:
```env
PORT=3001
NODE_ENV=production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_strong_db_password_here
POSTGRES_DB=authenticator_db

# VAPID Keys (Can keep the ones in .env or generate new ones)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@yourdomain.com

# 32-byte AES key (64 hex characters) for database secret encryption
AES_SECRET_KEY=8f5df43872d0de9e7b542b37ebdf43fabd3dbe03185bc005490c01e25ccd18c9
SESSION_SECRET=505984ebbb464f7048af9d843eca0c2c48e97a79521c3b23cfd90091342d618c
```

---

## 5. Automated SSL Setup & Launch

Make the deployment scripts executable:
```bash
chmod +x init-letsencrypt.sh deploy.sh nginx/ssl/generate-self-signed.sh
```

### Run the 1-Click SSL Setup:
```bash
./init-letsencrypt.sh auth.yourdomain.com admin@yourdomain.com
```

### What this script does automatically:
1. Starts PostgreSQL, Node.js App, and Nginx.
2. Contacts Let's Encrypt using Certbot webroot mode.
3. Generates trusted 4096-bit RSA SSL certificates for `auth.yourdomain.com`.
4. Installs the certificates into Nginx and reloads the server.
5. Starts the Certbot background container which automatically renews certificates every 60 days!

---

## 6. Verification & Mobile Testing

Once the script completes, visit your domain:
- 🌐 **Website**: `https://auth.yourdomain.com/`
- 📱 **Authenticator PWA**: `https://auth.yourdomain.com/pwa/`

### Mobile Test:
1. Open `https://auth.yourdomain.com/pwa/` in mobile Chrome or Safari.
2. Tap **Install** or **Add to Home Screen**.
3. Scan the setup QR code from the website.
4. Log out on your computer and log back in — your phone receives native Web Push login approvals with 2-digit number matching anywhere in the world!

---

## 7. Useful Server Commands

```bash
# View live container logs
docker compose logs -f

# View application logs only
docker compose logs -f app

# Restart all services
docker compose restart

# Stop all services
docker compose down

# Check database contents
docker compose exec postgres psql -U postgres -d authenticator_db -c "\dt"
```
