@echo off
chcp 65001 >nul
setlocal
start "" "%~dp0..\project\index.html"
endlocal
