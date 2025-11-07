@echo off
REM Test cursor hook with logging enabled

set VIBE_LOG_OUTPUT=C:\Users\97254\.vibe-log\cursor-hook.log

echo Testing hook with logging...
echo {"text": "You are absolutely right about that!", "hook_event_name": "afterAgentResponse"} | node dist\index.js cursor-hook-pushup

timeout /t 1 /nobreak >nul

if exist "C:\Users\97254\.vibe-log\cursor-hook.log" (
    echo.
    echo === Log file found! ===
    type "C:\Users\97254\.vibe-log\cursor-hook.log"
) else (
    echo.
    echo Log file not created - check if VIBE_LOG_OUTPUT is working
)
