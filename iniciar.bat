@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Piloto Dom Bosco

set PORTA=5173

where py >nul 2>nul
if %errorlevel%==0 (set PYTHON=py) else (set PYTHON=python)

rem Se ja existe um piloto aberto nesta porta, ele pode estar usando arquivos antigos.
netstat -ano | findstr /R /C:":%PORTA% .*LISTENING" >nul
if %errorlevel%==0 (
  echo.
  echo  O piloto ja esta aberto em outra janela preta.
  echo.
  echo  Feche essa janela preta antiga e rode este arquivo de novo.
  echo  Assim o navegador nao fica usando arquivos antigos.
  echo.
  pause
  exit /b
)

echo.
echo  Piloto Dom Bosco - dados ficticios, nada e salvo.
echo  Abrindo http://localhost:%PORTA% no navegador...
echo.
echo  Para encerrar o piloto, feche esta janela.
echo.

start "" /min cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORTA%"
%PYTHON% servidor.py %PORTA%
