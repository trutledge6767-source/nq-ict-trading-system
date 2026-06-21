@echo off
REM Permanent-URL forward-test launcher (ngrok static domain).
REM Run setup_ngrok.ps1 ONCE first. Then double-click this anytime.
cd /d "%~dp0"
title Forward-Test (stable ngrok)

where node >nul 2>nul || (echo [ERROR] node not found. & pause & exit /b)
if not exist "ngrok_domain.txt" (
  echo [!] Not configured. Run first:
  echo     powershell -ExecutionPolicy Bypass -File setup_ngrok.ps1 -AuthToken ^<token^> -Domain ^<your.ngrok-free.app^>
  pause & exit /b
)
set /p NGDOM=<ngrok_domain.txt

echo Starting LOGGER...
start "Forward Logger (leave open)" cmd /k "cd /d "%~dp0" && node forward_logger.js"
timeout /t 2 >nul

where ngrok >nul 2>nul || (echo [ERROR] ngrok not found. & pause & exit /b)
echo Starting NGROK on stable domain %NGDOM% ...
start "ngrok tunnel (leave open)" cmd /k "ngrok http --url=https://%NGDOM% 8787"
echo.
echo PERMANENT webhook URLs (never change):
echo    https://%NGDOM%/p5    (NQ PDHL Breakout + CVD)
echo    https://%NGDOM%/rev   (NQ Mean-Reversion sleeve)
pause
