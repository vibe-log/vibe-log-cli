@echo off
echo Testing standup command with debug output...
echo.

REM Run the standup command with debug logging
set DEBUG=vibe-log:*
node dist\index.js standup

echo.
echo Test complete. Check the output above.
pause