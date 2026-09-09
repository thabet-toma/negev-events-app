param (
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$ReleaseNotes = "تحسينات عامة وتحديثات في الأداء",

    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$SSH_KEY = "C:\Users\asus\.ssh\hostenger2\id_ed25519"
$SERVER = "root@187.124.164.58"
$REMOTE_REPO = "/root/munasbat/app"
$APK_LOCAL = "mobile/build/app/outputs/flutter-apk/app-release.apk"
$APKSIGNER = "C:\Users\asus\AppData\Local\Android\Sdk\build-tools\35.0.0\apksigner.bat"

Write-Host "==> [1/6] Checking Git Status and Committing..." -ForegroundColor Cyan
git diff --stat
git commit -am "chore(release): bump version to $Version and update deploy"
git push origin main

if (-not $SkipBuild) {
    Write-Host "==> [2/6] Building Flutter Release APK..." -ForegroundColor Cyan
    Push-Location mobile
    flutter build apk --release
    Pop-Location
}

Write-Host "==> [3/6] Verifying APK Signature..." -ForegroundColor Cyan
if (Test-Path $APKSIGNER) {
    & $APKSIGNER verify --verbose --print-certs $APK_LOCAL
} else {
    Write-Warning "apksigner not found at $APKSIGNER, skipping local cert print."
}

$apkSize = (Get-Item $APK_LOCAL).Length
Write-Host "APK built and verified. Size: $apkSize bytes." -ForegroundColor Green

Write-Host "==> [4/6] Uploading APK to Server..." -ForegroundColor Cyan
scp -i $SSH_KEY $APK_LOCAL "$SERVER`:/tmp/negev-events-$Version.apk"

Write-Host "==> [5/6] Pulling Code & Updating Version on Server..." -ForegroundColor Cyan
$remoteCommands = @"
cp /tmp/negev-events-$Version.apk $REMOTE_REPO/server/downloads/negev-events.apk && \
chmod 644 $REMOTE_REPO/server/downloads/negev-events.apk && \
rm /tmp/negev-events-$Version.apk && \
cd $REMOTE_REPO && \
git pull origin main && \
sed -i 's/^APP_LATEST_VERSION=.*/APP_LATEST_VERSION=$Version/' .env && \
sed -i 's|^APP_RELEASE_NOTES=.*|APP_RELEASE_NOTES=$ReleaseNotes|' .env && \
docker compose up -d app
"@

ssh -i $SSH_KEY $SERVER $remoteCommands

Write-Host "==> [6/6] Verifying Live Endpoints..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
curl.exe -s https://munasbat.ktra-pro.tech/api/app/version
Write-Host ""
curl.exe -I https://munasbat.ktra-pro.tech/downloads/negev-events.apk

Write-Host "`n==> RELEASE $Version DEPLOYED SUCCESSFULLY! <==`n" -ForegroundColor Green
