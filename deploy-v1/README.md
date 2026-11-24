# 🚀 AuthGuard Deployment Architecture Guide: V0 vs V1

This directory (`deploy-v1/`) contains the modernized **V1 CI/CD & Container Registry** deployment architecture.
The root directory files (`deploy.sh`, `release.ps1`, `docker-compose.yml`) are preserved as **V0 (Legacy Reference)**.

---

## 📊 Quick Comparison: V0 vs V1

| Feature | 🔴 V0 (Legacy Local Build) | 🟢 V1 (Modern GHCR Registry) |
| :--- | :--- | :--- |
| **Branch** | `prod` (polluted with binary commits) | `release/v1` (clean, source-only) |
| **Where Frontend Builds** | Local Windows laptop (`npm run build`) | GitHub Actions Runner (7GB RAM cloud VM) |
| **Where Docker Builds** | EC2 server (`docker compose --build`) | GitHub Actions Runner (`docker buildx`) |
| **EC2 CPU & RAM Load** | 100% CPU Spike / RAM crash risk | **0% build load** (Instant `docker pull`) |
| **Image Tagging** | Untagged / `:latest` only | **`v1.0.<run_number>-sha-<hash>`** |
| **Rollback Capability** | Impossible / Re-run local build script | **100% Automatic** (Restores previous tag on failure) |
| **Release Trigger** | Local `release.ps1` script | Push to `release/v1` |

---

## 🏷️ Versioning & Auto-Rollback Engine

1. **Tag Generation:**
   Every build produces an immutable tag: `v1.0.<run_number>-sha-<hash>` (e.g. `v1.0.6-sha-9f20156`).
2. **Current Tag State:**
   The working version is tracked on EC2 in `.current_v1_tag`.
3. **Automated Rollback:**
   If a newly deployed container fails health verification within 18 seconds, `deploy.sh` automatically aborts, pulls the previous tag from `.current_v1_tag`, and restarts the stable containers.
