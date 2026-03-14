@echo off
title AgentForge Stop Script
echo Stopping AgentForge (Port 3456)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3456 ^| findstr LISTENING') do (
    echo Terminating PID: %%a...
    taskkill /f /pid %%a >nul 2>&1
)
echo.
echo Stopped cleanly.
pause
