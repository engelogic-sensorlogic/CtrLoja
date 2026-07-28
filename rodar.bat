@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CtrLoja - Execucao para testes

REM ===================================================================
REM  CtrLoja - Executa o aplicativo direto do codigo-fonte
REM
REM  Uso:
REM    rodar.bat              -> MODO INTERFACE (rapido)
REM                              instala so o essencial, sem modulo nativo
REM                              e sem baixar o Chromium do WhatsApp.
REM                              Toda a interface, o banco, a agenda e os
REM                              modelos funcionam. O envio pelo WhatsApp
REM                              fica indisponivel.
REM
REM    rodar.bat completo     -> MODO COMPLETO
REM                              instala tudo, inclusive a integracao com
REM                              o WhatsApp (download maior na 1a vez).
REM
REM    rodar.bat testes       -> roda apenas os testes automatizados
REM ===================================================================

cd /d "%~dp0"

set "MODO=%~1"
if "%MODO%"=="" set "MODO=interface"

echo.
echo ===================================================================
echo   CtrLoja - A.R.L.S. Uniao Fraternal Rolandense n 141
echo   Modo: %MODO%
echo ===================================================================
echo.

REM ------------------------------------------------------------------
REM  Ambiente
REM ------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo        Baixe a versao LTS em https://nodejs.org e reinicie o prompt.
  goto :FALHA
)
for /f "tokens=*" %%v in ('node -v') do set "NODEV=%%v"
echo [1/3] Node.js !NODEV!

if /i "%MODO%"=="testes" goto :TESTES

REM ------------------------------------------------------------------
REM  Dependencias
REM ------------------------------------------------------------------
if /i "%MODO%"=="completo" (
  set "MARCA=.instalado-completo"
  set "CMDINSTALL=npm install --no-audit --no-fund"
) else (
  set "MARCA=.instalado-interface"
  set "CMDINSTALL=npm install --omit=optional --no-audit --no-fund"
)

if exist "node_modules" if exist "!MARCA!" (
  echo [2/3] Dependencias ja instaladas neste modo.
  goto :EXECUTAR
)

echo [2/3] Instalando dependencias...
echo       ^(pode demorar alguns minutos na primeira vez^)
echo.
call !CMDINSTALL!
if errorlevel 1 (
  echo.
  echo [ERRO] Falha na instalacao das dependencias.
  echo        Verifique a conexao com a internet e tente novamente.
  goto :FALHA
)

if /i "%MODO%"=="completo" (
  echo.
  echo       Recompilando o modulo nativo better-sqlite3 para o Electron...
  call npx electron-rebuild -f -w better-sqlite3
  if errorlevel 1 (
    echo       [AVISO] Falha ao recompilar o better-sqlite3.
    echo               Sem problema: o aplicativo usara o SQLite embutido
    echo               no Electron ^(node:sqlite^) automaticamente.
  )
)

echo. > "!MARCA!"

:EXECUTAR
echo [3/3] Abrindo o CtrLoja...
echo.
if /i "%MODO%"=="completo" (
  call npx electron .
) else (
  call npx electron . --dev
)
goto :FIM

REM ------------------------------------------------------------------
:TESTES
echo [2/3] Executando os testes automatizados...
echo.
call node test\teste-calendario.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-integracao.js
if errorlevel 1 goto :FALHA
echo.
echo [3/3] Todos os testes passaram.
goto :FIM

REM ------------------------------------------------------------------
:FALHA
echo.
pause
endlocal
exit /b 1

:FIM
echo.
echo Aplicativo encerrado.
pause
endlocal
exit /b 0
