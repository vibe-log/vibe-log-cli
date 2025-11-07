@echo off
set VIBE_LOG_OUTPUT=C:\Users\97254\.vibe-log\cursor-hook-manual-test.log
del C:\Users\97254\.vibe-log\cursor-hook-manual-test.log 2>nul

echo Testing hook manually with logging...
node dist\index.js cursor-hook-pushup

echo.
echo === Log file ===
type C:\Users\97254\.vibe-log\cursor-hook-manual-test.log
