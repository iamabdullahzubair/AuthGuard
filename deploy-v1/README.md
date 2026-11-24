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
| **Rollback Capability** | Impossible / Re-run local build script | **Instant** (`IMAGE_TAG=v1.0.X ./deploy.sh`) |
| **Release Trigger** | Local `release.ps1` script | Pull Request merge into `release/v1` |

---

## 🏷️ Versioning Formula

Every time code is merged into `release/v1`, GitHub Actions generates a unique, immutable version tag:

$$\text{Version Tag} = \text{v1.0.}[\text{GitHub Run Number}] - \text{sha}-[\text{Short Git Commit Hash}]$$

*Example:* `v1.0.1-sha-7e60813`

Additionally, a secondary tag `v1-latest` is updated to point to the newest stable build.

---

## ⏪ Instant Rollback Procedure

If a deployed version has a critical issue, there is **no need to re-compile or push code**. 
Simply SSH into the EC2 instance and specify the previous working tag:

```bash
cd ~/AuthGuard
IMAGE_TAG="v1.0.1-sha-7e60813" ./deploy-v1/deploy.sh
```

Within **5 seconds**, the previous stable container is running!
