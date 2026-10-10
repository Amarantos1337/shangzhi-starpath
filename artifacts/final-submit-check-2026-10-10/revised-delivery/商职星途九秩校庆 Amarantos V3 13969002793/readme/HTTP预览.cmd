@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
python -c "import sys;sys.exit(0 if sys.version_info >= (3,9) else 1)" >nul 2>nul
if not errorlevel 1 goto usepython
py -3 -c "import sys;sys.exit(0 if sys.version_info >= (3,9) else 1)" >nul 2>nul
if not errorlevel 1 goto usepy
echo 未找到Python 3.9+。请使用“一键启动.cmd”直接体验，或自行安装Python后重试。
pause
exit /b 1
:usepython
echo 预览：http://127.0.0.1:8765/  Ctrl+C停止。
start "" "http://127.0.0.1:8765/"
python -m http.server 8765 --bind 127.0.0.1 --directory project
goto end
:usepy
echo 预览：http://127.0.0.1:8765/  Ctrl+C停止。
start "" "http://127.0.0.1:8765/"
py -3 -m http.server 8765 --bind 127.0.0.1 --directory project
:end
endlocal
