@echo off
REM ============================================================
REM  Track B launcher: logger + IB execution bridge + ngrok (stable domain).
REM  Chain:  TV alert -> ngrok -> forward_logger.js -> ib_bridge.py -> IBKR paper.
REM  Bridge starts in whatever mode config.json says (dry_run=true ships SAFE).
REM  Requires IB Gateway running + logged into the PAPER account before going live.
REM ============================================================
cd /d "%~dp0"
title NQ Track B (logger + IB bridge + ngrok)

set FT=%~dp0..\12_forward_test
set BRIDGE_PORT=8799

REM --- free ports 8787 (logger) + 8799 (bridge) and kill stale ngrok ---
powershell -NoProfile -Command "foreach($p in 8787,8799){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 1 >nul

if not exist "%FT%\ngrok_domain.txt" (echo [!] run setup_ngrok.ps1 first & pause & exit /b)
set /p NGDOM=<"%FT%\ngrok_domain.txt"

where python >nul 2>nul || (echo [ERROR] python not found & pause & exit /b)
echo Starting IB BRIDGE (mode per config.json)...
start "IB Bridge (leave open)" cmd /k "cd /d "%~dp0" && python -u ib_bridge.py"
timeout /t 2 >nul

where node >nul 2>nul || (echo [ERROR] node not found & pause & exit /b)
echo Starting LOGGER (forwarding to bridge)...
start "Forward Logger (leave open)" cmd /k "cd /d "%FT%" && set BRIDGE_URL=http://127.0.0.1:%BRIDGE_PORT% && node forward_logger.js"
timeout /t 2 >nul

where ngrok >nul 2>nul || (echo [ERROR] ngrok not found & pause & exit /b)
echo Starting NGROK on %NGDOM% ...
start "ngrok tunnel (leave open)" cmd /k "ngrok http --url=https://%NGDOM% 8787"
echo.
echo Track B is up on https://%NGDOM%  (/p5 and /rev). Leave all three windows open during RTH.
echo Bridge status: http://127.0.0.1:%BRIDGE_PORT%/status   Orders log: orders.csv
