@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CtrLoja - Teste do aplicativo do celular no PC

REM ===================================================================
REM  CtrLoja - Abre o aplicativo do CELULAR aqui no computador
REM
REM  Serve a pasta do projeto em http://localhost:8123/mobile/ e abre
REM  o navegador. Como e localhost, o navegador libera a criptografia
REM  e o botao Sincronizar funciona igual ao GitHub Pages.
REM
REM  Nao mexe em nada do aplicativo de desktop.
REM
REM  Uso:  testar-celular.bat  [porta]
REM ===================================================================

cd /d "%~dp0"

set "PORTA=%~1"
if "%PORTA%"=="" set "PORTA=8123"

echo.
echo ===================================================================
echo   CtrLoja - aplicativo do celular, rodando no PC
echo ===================================================================
echo.

REM ------------------------------------------------------------------
REM  Ambiente - procura o Node.js no PATH e nos locais mais comuns
REM ------------------------------------------------------------------
set "NODEDIR="

where node >nul 2>&1
if not errorlevel 1 goto :NODE_OK

echo Node.js nao esta no PATH. Procurando nas pastas usuais...

call :ACHAR "%ProgramFiles%\nodejs"
call :ACHAR "%ProgramW6432%\nodejs"
call :ACHAR "%SystemDrive%\Program Files (x86)\nodejs"
call :ACHAR "%LOCALAPPDATA%\Programs\nodejs"
call :ACHAR "%LOCALAPPDATA%\Programs\node"
call :ACHAR "%ProgramData%\chocolatey\lib\nodejs\tools"
call :ACHAR "%USERPROFILE%\scoop\apps\nodejs\current"
call :ACHAR "%NVM_SYMLINK%"

if not defined NODEDIR if exist "%ProgramData%\nvm" (
  for /d %%V in ("%ProgramData%\nvm\v*") do call :ACHAR "%%~V"
)
if not defined NODEDIR if exist "%APPDATA%\nvm" (
  for /d %%V in ("%APPDATA%\nvm\v*") do call :ACHAR "%%~V"
)

if not defined NODEDIR (
  echo.
  echo [ERRO] Node.js nao esta instalado neste computador.
  echo        Instale a versao LTS em https://nodejs.org e tente de novo.
  goto :FALHA
)

set "PATH=%NODEDIR%;%PATH%"

:NODE_OK
if not exist "mobile\dados\agenda.enc" (
  echo [AVISO] Ainda nao existe pacote de dados publicado.
  echo         Rode o publicar-dados.bat antes, senao o Sincronizar
  echo         nao vai encontrar nada.
  echo.
)

node "ferramentas\servidor-celular.js" %PORTA%
goto :FIM

REM ------------------------------------------------------------------
:ACHAR
if defined NODEDIR exit /b 0
if "%~1"=="" exit /b 0
if exist "%~1\node.exe" set "NODEDIR=%~1"
exit /b 0

REM ------------------------------------------------------------------
:FALHA
echo.
pause
endlocal
exit /b 1

:FIM
echo.
echo Servidor encerrado.
pause
endlocal
exit /b 0
