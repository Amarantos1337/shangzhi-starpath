@echo off
chcp 65001 >nul
setlocal
echo 网站基础功能无需安装，直接打开 project\index.html 即可。
echo 以下工具仅用于可选预览、Python实践和交付检查：
where node >nul 2>nul && node --version
where python >nul 2>nul && python --version
where py >nul 2>nul && py -3 --version
echo.
echo 可选工具不可用时，仍可双击“一键启动.cmd”。
pause
endlocal
