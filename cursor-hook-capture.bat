@echo off
REM Capture stdin from Cursor for debugging

REM Save stdin to file
set STDIN_FILE=C:\Users\97254\.vibe-log\cursor-stdin-capture.txt
echo [%date% %time%] === New hook call === >> %STDIN_FILE%

REM Read from stdin and save it
powershell -Command "$input | Out-File -Append -FilePath '%STDIN_FILE%'"

echo [%date% %time%] === End of stdin === >> %STDIN_FILE%
