@echo off
REM ============================================================
REM  Market-open auto-start: forward-test logger + ngrok (stable domain).
REM  Kills any stale logger/ngrok first (avoids "8787 in use" / ngrok 1-session).
REM  Used by the scheduled task "NQ Forward Test - Market Open" and as a manual launcher.
REM ============================================================
cd /d "%~dp0"
title NQ Forward-Test (auto)

REM free port 8787 (old logger) + kill any running ngrok
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 1 >nul

if not exist "ngrok_domain.txt" (echo [!] run setup_ngrok.ps1 first & pause & exit /b)
set /p NGDOM=<ngrok_domain.txt

where node >nul 2>nul || (echo [ERROR] node not found & pause & exit /b)
echo Starting LOGGER...
start "Forward Logger (leave open)" cmd /k "cd /d "%~dp0" && node forward_logger.js"
timeout /t 2 >nul

where ngrok >nul 2>nul || (echo [ERROR] ngrok not found & pause & exit /b)
echo Starting NGROK on %NGDOM% ...
start "ngrok tunnel (leave open)" cmd /k "ngrok http --url=https://%NGDOM% 8787"
echo.
echo Forward test is up on https://%NGDOM%  (/p5 and /rev). Leave both windows open during RTH.
