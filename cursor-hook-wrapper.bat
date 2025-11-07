@echo off
REM Wrapper for Cursor hook to set environment variables properly

REM Log that hook was called
echo [%date% %time%] Hook triggered >> C:\Users\97254\.vibe-log\hook-trigger.log

REM Set environment and run hook
set VIBE_LOG_OUTPUT=C:\Users\97254\.vibe-log\cursor-hook.log
node "C:\vibelog\vibe-log-cli\dist\index.js" cursor-hook-pushup

REM Log completion
echo [%date% %time%] Hook completed >> C:\Users\97254\.vibe-log\hook-trigger.log
