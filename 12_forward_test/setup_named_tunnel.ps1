# =====================================================================
# setup_named_tunnel.ps1 — one-time setup of a PERMANENT Cloudflare named
# tunnel for the forward-test logger (stable URL that survives restarts).
#
# REQUIRES: a domain you control, added to your (free) Cloudflare account.
#   (Named tunnels route DNS on your zone — that's the only way to get a
#    stable cloudflare hostname. No domain? Use the ngrok option instead.)
#
# Run once, in YOUR PowerShell (it needs an interactive browser login):
#   powershell -ExecutionPolicy Bypass -File setup_named_tunnel.ps1 -Hostname nqbot.yourdomain.com
# Then start it anytime by double-clicking run_named_tunnel.bat.
# =====================================================================
param(
  [Parameter(Mandatory=$true)][string]$Hostname,   # e.g. nqbot.yourdomain.com (a subdomain on YOUR Cloudflare zone)
  [string]$TunnelName = "nq-forward"
)
$ErrorActionPreference = "Stop"
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue)
if (-not $cf) { $cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
$cfDir = Join-Path $env:USERPROFILE ".cloudflared"
New-Item -ItemType Directory -Force -Path $cfDir | Out-Null

# 1) Login (browser) — skipped if already authorized (cert.pem present)
if (-not (Test-Path (Join-Path $cfDir "cert.pem"))) {
  Write-Host "==> A browser will open. Log in to Cloudflare and AUTHORIZE the domain that contains '$Hostname'." -ForegroundColor Cyan
  & $cf tunnel login
} else { Write-Host "Already logged in (cert.pem found)." -ForegroundColor Green }

# 2) Create the tunnel (idempotent)
$existing = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $TunnelName }
if (-not $existing) {
  Write-Host "==> Creating tunnel '$TunnelName'..." -ForegroundColor Cyan
  & $cf tunnel create $TunnelName
  $existing = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $TunnelName }
} else { Write-Host "Tunnel '$TunnelName' already exists (id $($existing.id))." -ForegroundColor Green }
$id = $existing.id
$creds = Join-Path $cfDir "$id.json"

# 3) Route the hostname to this tunnel (creates the DNS CNAME on your zone)
Write-Host "==> Routing $Hostname -> tunnel $TunnelName ..." -ForegroundColor Cyan
& $cf tunnel route dns $TunnelName $Hostname

# 4) Write config.yml (maps the tunnel to the local logger on :8787)
$config = @"
tunnel: $TunnelName
credentials-file: $creds
ingress:
  - hostname: $Hostname
    service: http://localhost:8787
  - service: http_status:404
"@
$cfgPath = Join-Path $cfDir "config.yml"
$config | Out-File -FilePath $cfgPath -Encoding ascii
Write-Host "Wrote $cfgPath" -ForegroundColor Green

Write-Host "`n=====================================================================" -ForegroundColor Yellow
Write-Host " PERMANENT URL READY:  https://$Hostname" -ForegroundColor Yellow
Write-Host " TradingView alert webhooks:" -ForegroundColor Yellow
Write-Host "    https://$Hostname/p5    (NQ PDHL Breakout + CVD)"
Write-Host "    https://$Hostname/rev   (NQ Mean-Reversion sleeve)"
Write-Host " Start it anytime: double-click run_named_tunnel.bat  (logger + tunnel)."
Write-Host " This URL NEVER changes — set the alerts once and you're done."
Write-Host "=====================================================================" -ForegroundColor Yellow
