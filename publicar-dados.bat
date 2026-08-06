@echo off
setlocal EnableExtensions
chcp 65001 >nul
title CtrLoja - Publicar dados para o celular

REM ===================================================================
REM  Gera o pacote CIFRADO com os dados da Loja para o aplicativo do
REM  celular e grava em mobile\dados\.
REM
REM  Depois disto, rode o publicar-github.bat para enviar ao repositorio.
REM  Os Irmaos veem a novidade ao tocar em Sincronizar.
REM
REM  A senha protege os dados no repositorio publico. Use sempre a MESMA
REM  senha combinada com os Irmaos.
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
node "ferramentas\publicar-dados.js" %*
echo.
pause
endlocal
