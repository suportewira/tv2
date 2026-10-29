@echo off
rem Clique duas vezes neste arquivo para publicar os videos da pasta "videos".
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publicar.ps1"
echo.
pause
