@echo off
set VIBELOG_DEBUG=true
node dist/index.js cursor-upload --dry --date-range=all
pause
