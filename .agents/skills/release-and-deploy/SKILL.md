---
name: release-and-deploy
description: >-
  Use this skill to build, sign, push, and deploy releases for the Negev Events (مناسبات النقب) platform.
  Covers building and verifying the signed Flutter release APK, pushing changes to GitHub, pulling on the
  remote production server (187.124.164.58), uploading the new APK to the public download path, bumping
  APP_LATEST_VERSION in the server .env, restarting Docker containers, and validating live deployment.
---

# Release and Deploy Runbook — منصة مناسبات النقب

This runbook outlines the exact procedure for building a signed mobile release APK, pushing source code to GitHub, deploying code to the production server via SSH, publishing the APK for user download, and announcing the new version.

---

## 1. Environment & Credentials Reference

| Component | Value / Location | Notes |
|---|---|---|
| **Production Server** | `root@187.124.164.58` | Accessible via SSH |
| **SSH Key** | `C:\Users\asus\.ssh\hostenger2\id_ed25519` | Use with `-i` flag for `ssh` and `scp` |
| **Keystore File** | `C:\Users\asus\negev-release.jks` | Official production signing keystore |
| **Keystore Alias** | `negev` | Configured in `mobile/android/key.properties` |
| **Certificate DN** | `CN=thabet toma, OU=thabet, O=thabet, L=tulkarem, ST=palestine, C=ps` | Must match for smooth user updates |
| **Remote Code Path** | `/root/munasbat/app` | Git repository on server |
| **Public APK Path** | `/root/munasbat/app/server/downloads/negev-events.apk` | Served statically to users |
| **Domain** | `https://munasbat.ktra-pro.tech` | Public platform URL |
| **Version API** | `https://munasbat.ktra-pro.tech/api/app/version` | Checked by mobile app on launch |

> [!CAUTION]
> **Safety Invariants**:
> - Never print, copy, or commit passwords or `.env` files.
> - Never modify `APP_MIN_VERSION` unless a forced-break update is explicitly demanded.
> - Always verify the APK is signed with `CN=thabet toma` before deploying. An unsigned or wrongly signed APK will prevent existing users from upgrading.

---

## 2. Low-Memory Build Preparation (Windows Host)

The development machine may have limited free RAM (< 1GB). To prevent Gradle OOM errors and infinite hanging:
1. Ensure `mobile/android/gradle.properties` contains:
   ```properties
   org.gradle.jvmargs=-Xmx1G -XX:MaxMetaspaceSize=512m
   ```
2. Stop any existing background Gradle daemons if needed:
   ```powershell
   cd mobile/android; ./gradlew --stop; cd ../..
   ```

---

## 3. Step-by-Step Deployment Workflow

### Step 1: Bump Mobile Version & Verify Code
1. Increment `version` in `mobile/pubspec.yaml`:
   ```yaml
   version: X.Y.Z+BUILD_NUMBER
   ```
2. Run tests to avoid regressions:
   - Backend/Web: `npm test` (inside `server/` or project root)
   - Mobile: `flutter test` (inside `mobile/`)
3. Read the complete `git diff` line-by-line to verify changes according to `AGENTS.md`.

---

### Step 2: Build and Sign the Release APK
Run the Flutter release build:
```powershell
cd mobile
flutter build apk --release
cd ..
```
*Expected Output*: `mobile/build/app/outputs/flutter-apk/app-release.apk`

---

### Step 3: Verify APK Signature (CRITICAL)
Verify that the output APK is signed with the official certificate using `apksigner`:
```powershell
& "C:\Users\asus\AppData\Local\Android\Sdk\build-tools\35.0.0\apksigner.bat" verify --verbose --print-certs "mobile/build/app/outputs/flutter-apk/app-release.apk"
```
Ensure:
- `Verified using v2 scheme (APK Signature Scheme v2): true`
- `Signer #1 certificate DN: CN=thabet toma, ...`

---

### Step 4: Commit and Push Code to GitHub
```powershell
git commit -am "feat/fix: <description> and release vX.Y.Z+<build>"
git push origin main
```

---

### Step 5: Upload APK to Production Server
Upload the new APK to a temporary path on the server:
```powershell
scp -i C:\Users\asus\.ssh\hostenger2\id_ed25519 "mobile/build/app/outputs/flutter-apk/app-release.apk" root@187.124.164.58:/tmp/negev-events-X.Y.Z.apk
```

---

### Step 6: Deploy on Server & Announce New Version
Execute the remote commands via SSH in a single call:
```powershell
ssh -i C:\Users\asus\.ssh\hostenger2\id_ed25519 root@187.124.164.58 @"
cp /tmp/negev-events-X.Y.Z.apk /root/munasbat/app/server/downloads/negev-events.apk && \
chmod 644 /root/munasbat/app/server/downloads/negev-events.apk && \
rm /tmp/negev-events-X.Y.Z.apk && \
cd /root/munasbat/app && \
git pull origin main && \
sed -i 's/^APP_LATEST_VERSION=.*/APP_LATEST_VERSION=X.Y.Z/' .env && \
sed -i 's|^APP_RELEASE_NOTES=.*|APP_RELEASE_NOTES=<Arabic release notes>|' .env && \
docker compose up -d app
"@
```

---

### Step 7: Live Verification
Verify that both the version endpoint and the static APK download respond correctly:

1. **Verify Version Endpoint**:
   ```bash
   curl -s https://munasbat.ktra-pro.tech/api/app/version
   ```
   *Expected Response*:
   ```json
   {
     "success": true,
     "latest_version": "X.Y.Z",
     "apk_url": "https://munasbat.ktra-pro.tech/downloads/negev-events.apk",
     "release_notes": "..."
   }
   ```

2. **Verify APK Download Headers**:
   ```bash
   curl -I https://munasbat.ktra-pro.tech/downloads/negev-events.apk
   ```
   *Expected Response*: `HTTP/1.1 200 OK`, `Content-Length` matches the size of the uploaded APK.
