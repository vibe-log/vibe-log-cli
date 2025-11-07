@echo off
setlocal

REM Set environment variable
set VIBE_LOG_OUTPUT=C:\Users\97254\.vibe-log\cursor-hook.log

REM Clean up old log
if exist "%VIBE_LOG_OUTPUT%" del "%VIBE_LOG_OUTPUT%"

REM Run the hook
echo {"text": "You are absolutely right about that!", "hook_event_name": "afterAgentResponse"} | node dist\index.js cursor-hook-pushup

REM Wait a moment for file to be written
timeout /t 1 /nobreak >nul

REM Check results
echo.
echo === Checking log file ===
if exist "%VIBE_LOG_OUTPUT%" (
    echo SUCCESS: Log file created!
    echo.
    echo === Log contents ===
    type "%VIBE_LOG_OUTPUT%"
) else (
    echo FAILED: Log file not created
    echo Expected location: %VIBE_LOG_OUTPUT%
)

endlocal
