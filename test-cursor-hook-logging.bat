@echo off
REM Test cursor hook with file logging

set VIBE_LOG_OUTPUT=C:\temp\cursor-hook.log
del C:\temp\cursor-hook.log 2>nul

echo Testing cursor hook with file logging...
echo {"text": "You are absolutely right about that!", "hook_event_name": "afterAgentResponse"} | node dist\index.js cursor-hook-pushup

echo.
echo === Log file contents ===
type C:\temp\cursor-hook.log
