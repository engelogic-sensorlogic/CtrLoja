@echo off
setlocal EnableExtensions
chcp 65001 >nul
title CtrLoja - Sincronizar modelos de mensagem

REM ===================================================================
REM  Traz os modelos de mensagem editados no aplicativo de volta para o
REM  codigo-fonte, para que o instalador ja saia com os textos atuais.
REM
REM  Uso:
REM    sincronizar-modelos.bat
REM    sincronizar-modelos.bat "C:\caminho\backup.ctrloja"
REM ===================================================================

cd /d "%~dp0"

set "NODEDIR="
where node >nul 2>&1
if not errorlevel 1 goto :OK

for %%D in ("%ProgramFiles%\nodejs" "%LOCALAPPDATA%\Programs\nodejs") do (
  if exist "%%~D\node.exe" if not defined NODEDIR set "NODEDIR=%%~D"
)
if not defined NODEDIR (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)
set "PATH=%NODEDIR%;%PATH%"

:OK
node "ferramentas\sincronizar-modelos.js" %1
echo.
pause
endlocal
