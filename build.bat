@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CtrLoja - Compilacao e Empacotamento

REM ===================================================================
REM  CtrLoja - Script de build
REM  Loja Maconica Uniao Fraternal Rolandense - UFR / GLP
REM
REM  Uso:
REM    build.bat            -> instala dependencias, empacota e gera o instalador
REM    build.bat app        -> apenas empacota o aplicativo (dist\win-unpacked)
REM    build.bat setup      -> apenas compila o instalador com o Inno Setup
REM    build.bat limpar     -> remove dist, node_modules e saidas do instalador
REM ===================================================================

cd /d "%~dp0"

set "ACAO=%~1"
if "%ACAO%"=="" set "ACAO=tudo"

echo.
echo ===================================================================
echo   CtrLoja - Gestor de Agenda e Comunicacao Maconica
echo   Acao: %ACAO%
echo ===================================================================
echo.

if /i "%ACAO%"=="limpar" goto :LIMPAR
if /i "%ACAO%"=="setup"  goto :INSTALADOR

REM ------------------------------------------------------------------
REM  1. Verificacao do ambiente
REM ------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado no PATH.
  echo        Instale a versao LTS em https://nodejs.org
  goto :FALHA
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERRO] npm nao encontrado no PATH.
  goto :FALHA
)

for /f "tokens=*" %%v in ('node -v') do set "NODEV=%%v"
echo [1/5] Node.js !NODEV! encontrado.

REM ------------------------------------------------------------------
REM  2. Dependencias
REM ------------------------------------------------------------------
if not exist "node_modules" (
  echo [2/5] Instalando dependencias ^(npm install^)...
  call npm install
  if errorlevel 1 goto :FALHA
) else (
  echo [2/5] Dependencias ja instaladas. Use "build.bat limpar" para refazer.
)

REM ------------------------------------------------------------------
REM  3. Recompilacao do modulo nativo (better-sqlite3) para o Electron
REM ------------------------------------------------------------------
echo [3/5] Recompilando modulos nativos para o Electron...
call npx electron-builder install-app-deps
if errorlevel 1 (
  echo [AVISO] Falha ao recompilar modulos nativos. Tentando electron-rebuild...
  call npx electron-rebuild -f -w better-sqlite3
  if errorlevel 1 goto :FALHA
)

REM ------------------------------------------------------------------
REM  4. Empacotamento do aplicativo
REM ------------------------------------------------------------------
echo [4/5] Empacotando o aplicativo ^(electron-builder^)...
call npx electron-builder --win --x64 --dir
if errorlevel 1 goto :FALHA

if not exist "dist\win-unpacked\CtrLoja.exe" (
  echo [ERRO] Empacotamento nao gerou dist\win-unpacked\CtrLoja.exe
  goto :FALHA
)
echo       OK: dist\win-unpacked\CtrLoja.exe

REM Copia os logotipos para a pasta empacotada, se existirem
for %%L in (Logo1 Logo2) do (
  for %%E in (png jpg jpeg webp svg) do (
    if exist "%%L.%%E" copy /y "%%L.%%E" "dist\win-unpacked\%%L.%%E" >nul
  )
)

if /i "%ACAO%"=="app" goto :SUCESSO

REM ------------------------------------------------------------------
REM  5. Instalador Inno Setup
REM ------------------------------------------------------------------
:INSTALADOR
echo [5/5] Gerando o instalador com o Inno Setup...

set "ISCC="
for %%P in (
  "%ProgramFiles%\Inno Setup 7\ISCC.exe"
  "%ProgramFiles(x86)%\Inno Setup 7\ISCC.exe"
  "%ProgramFiles%\Inno Setup 6\ISCC.exe"
  "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
) do (
  if exist %%P set "ISCC=%%~P"
)

if "!ISCC!"=="" (
  echo [AVISO] ISCC.exe ^(Inno Setup^) nao encontrado.
  echo         Instale o Inno Setup 7 em https://jrsoftware.org/isdl.php
  echo         ou abra manualmente o arquivo installer\CtrLoja.iss.
  goto :SUCESSO
)

echo       Usando: !ISCC!
"!ISCC!" "installer\CtrLoja.iss"
if errorlevel 1 goto :FALHA

echo.
echo       Instalador gerado em: installer\Output\
goto :SUCESSO

REM ------------------------------------------------------------------
:LIMPAR
echo Removendo dist, node_modules e saidas do instalador...
if exist "dist" rmdir /s /q "dist"
if exist "node_modules" rmdir /s /q "node_modules"
if exist "installer\Output" rmdir /s /q "installer\Output"
echo Limpeza concluida.
goto :FIM

REM ------------------------------------------------------------------
:SUCESSO
echo.
echo ===================================================================
echo   BUILD CONCLUIDO COM SUCESSO
echo ===================================================================
echo   Aplicativo : dist\win-unpacked\CtrLoja.exe
echo   Instalador : installer\Output\CtrLoja-Setup-*.exe
echo.
goto :FIM

:FALHA
echo.
echo ===================================================================
echo   BUILD INTERROMPIDO - verifique as mensagens acima
echo ===================================================================
endlocal
exit /b 1

:FIM
endlocal
exit /b 0
