@echo off
setlocal
cd /d "%~dp0"
title Robo de Gols - Scanner

echo Iniciando o scannerbot...
echo.
python scannerbot.py

echo.
echo O robo foi encerrado ou ocorreu um erro.
pause
endlocal
