@echo off
REM Permanent-URL forward-test launcher (Cloudflare NAMED tunnel).
REM Run setup_named_tunnel.ps1 ONCE first. Then double-click this anytime.
cd /d "%~dp0"
title Forward-Test (named tunnel)

where node >nul 2>nul || (echo [ERROR] node not found. & pause & exit /b)

echo Starting LOGGER...
start "Forward Logger (leave open)" cmd /k "cd /d "%~dp0" && node forward_logger.js"
timeout /t 2 >nul

where cloudflared >nul 2>nul || (echo [ERROR] cloudflared not found. & pause & exit /b)
if not exist "%USERPROFILE%\.cloudflared\config.yml" (
  echo [!] No named tunnel configured yet. Run first:
  echo     powershell -ExecutionPolicy Bypass -File setup_named_tunnel.ps1 -Hostname nqbot.yourdomain.com
  pause & exit /b
)

echo Starting NAMED TUNNEL (stable URL)...
start "Cloudflare Named Tunnel (leave open)" cmd /k "cloudflared tunnel run nq-forward"
echo.
echo Both windows opened. Your PERMANENT webhook URL is the hostname you configured,
echo with /p5 and /rev. It does NOT change between restarts.
pause
