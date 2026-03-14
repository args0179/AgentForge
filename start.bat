@echo off
title AgentForge Start Script
echo Stopping any existing AgentForge on port 3456...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo Starting AgentForge...
echo.
node server.js
pause
