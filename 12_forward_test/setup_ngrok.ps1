# =====================================================================
# setup_ngrok.ps1 — permanent URL WITHOUT owning a domain (ngrok free static).
# One-time setup. You need a free ngrok account, which gives:
#   - an authtoken (dashboard.ngrok.com -> Your Authtoken)
#   - one free static domain (dashboard -> Domains -> create, e.g. nq-bot.ngrok-free.app)
#
# Run once, in YOUR PowerShell:
#   powershell -ExecutionPolicy Bypass -File setup_ngrok.ps1 -AuthToken <token> -Domain nq-bot.ngrok-free.app
# Then double-click start_forward_test_stable.bat anytime (stable URL, never changes).
# =====================================================================
param(
  [Parameter(Mandatory=$true)][string]$AuthToken,
  [Parameter(Mandatory=$true)][string]$Domain   # your free static domain, e.g. nq-bot.ngrok-free.app
)
$ErrorActionPreference = "Stop"
$ng = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $ng) { $ng = "ngrok" }
& $ng config add-authtoken $AuthToken
$Domain | Out-File -FilePath (Join-Path $PSScriptRoot "ngrok_domain.txt") -Encoding ascii
Write-Host "`nngrok configured. PERMANENT URL: https://$Domain" -ForegroundColor Yellow
Write-Host "TradingView alert webhooks:  https://$Domain/p5   and   https://$Domain/rev"
Write-Host "Start anytime: double-click start_forward_test_stable.bat"
