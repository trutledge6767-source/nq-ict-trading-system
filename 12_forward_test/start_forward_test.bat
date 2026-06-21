@echo off
REM ============================================================
REM  Track A forward-test launcher — double-click to run.
REM  Opens (1) the webhook logger and (2) a Cloudflare quick tunnel.
REM  Paste the printed https URL into your TradingView alert webhooks,
REM  adding /p5 (breakout) and /rev (reversion).
REM ============================================================
cd /d "%~dp0"
title Forward-Test Launcher

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node not found. Install Node.js, then re-run this file.
  pause & exit /b
)

echo Starting the forward-test LOGGER window...
start "Forward Logger (leave open)" cmd /k "cd /d "%~dp0" && node forward_logger.js"

timeout /t 2 >nul

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] cloudflared not on PATH. Install once with:
  echo       winget install --id Cloudflare.cloudflared
  echo Then re-run this file. ^(Logger is already running.^)
  pause & exit /b
)

echo Starting the TUNNEL window...
start "Cloudflare Tunnel (leave open)" cmd /k "cloudflared tunnel --url http://localhost:8787"

echo.
echo ============================================================
echo  TWO windows opened — keep BOTH open while forward-testing.
echo.
echo  1) In the TUNNEL window, find the line:
echo        https://something.trycloudflare.com
echo  2) In TradingView, set each alert's Webhook URL to that URL plus:
echo        .../p5    for NQ PDHL Breakout + CVD
echo        .../rev   for NQ Mean-Reversion sleeve
echo  3) Check it's live: open  <that-url>/status  in a browser.
echo.
echo  Read results anytime:   node forward_report.js
echo  NOTE: the trycloudflare URL changes if you restart the tunnel —
echo        update the alert webhooks if you do.
echo ============================================================
pause
