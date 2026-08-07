@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CtrLoja - Geracao do instalador completo

REM ===================================================================
REM  CtrLoja - Build do instalador COMPLETO
REM  A.R.L.S. Uniao Fraternal Rolandense n 141 - UFR / GLP
REM
REM  Gera um instalador autonomo: o computador de destino NAO precisa de
REM  Node.js, nem de Chrome, nem de nada instalado antes. Vai tudo dentro:
REM  aplicativo, banco de dados e a integracao com o WhatsApp (Baileys).
REM
REM  Uso:
REM    build.bat            -> processo completo (recomendado)
REM    build.bat app        -> apenas empacota o aplicativo
REM    build.bat setup      -> apenas compila o instalador
REM    build.bat limpar     -> remove dist, node_modules e saidas
REM ===================================================================

cd /d "%~dp0"

set "ACAO=%~1"
if "%ACAO%"=="" set "ACAO=tudo"

echo.
echo ===================================================================
echo   CtrLoja - Instalador completo
echo   Acao: %ACAO%
echo ===================================================================
echo.

if /i "%ACAO%"=="limpar" goto :LIMPAR
if /i "%ACAO%"=="setup"  goto :INSTALADOR

REM ------------------------------------------------------------------
REM  1. Node.js
REM ------------------------------------------------------------------
set "NODEDIR="
where node >nul 2>&1
if not errorlevel 1 goto :NODE_OK

call :ACHARNODE "%ProgramFiles%\nodejs"
call :ACHARNODE "%ProgramW6432%\nodejs"
call :ACHARNODE "%SystemDrive%\Program Files (x86)\nodejs"
call :ACHARNODE "%LOCALAPPDATA%\Programs\nodejs"
call :ACHARNODE "%ProgramData%\chocolatey\lib\nodejs\tools"
call :ACHARNODE "%USERPROFILE%\scoop\apps\nodejs\current"
call :ACHARNODE "%NVM_SYMLINK%"

if not defined NODEDIR (
  echo [ERRO] Node.js nao encontrado neste computador.
  echo        Instale a versao LTS em https://nodejs.org
  echo        ou execute:  winget install OpenJS.NodeJS.LTS
  goto :FALHA
)
set "PATH=%NODEDIR%;%PATH%"

:NODE_OK
for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODEV=%%v"
echo [1/7] Node.js !NODEV!

REM ------------------------------------------------------------------
REM  2. Icone do aplicativo
REM ------------------------------------------------------------------
if not exist "build\icon.ico" (
  echo [ERRO] build\icon.ico nao encontrado.
  echo        Este e o icone do aplicativo, do instalador e do atalho.
  goto :FALHA
)
echo [2/7] Icone: build\icon.ico  ^(esquadro e compasso, fundo azul^)

REM ------------------------------------------------------------------
REM  3. Dependencias COMPLETAS (inclusive a integracao com o WhatsApp)
REM ------------------------------------------------------------------
echo [3/7] Instalando TODAS as dependencias...
echo       ^(inclui o Baileys - integracao com o WhatsApp^)
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERRO] Falha na instalacao das dependencias.
  goto :FALHA
)

if not exist "node_modules\baileys" (
  echo.
  echo [ERRO] A biblioteca "baileys" nao foi instalada.
  echo        Sem ela o instalador sairia sem a integracao com o WhatsApp.
  echo        Verifique a conexao com a internet e rode novamente.
  goto :FALHA
)
echo       OK: node_modules\baileys presente.

REM  Marcadores dos modos de desenvolvimento ficam obsoletos apos este build
if exist ".instalado-interface" del /q ".instalado-interface" >nul 2>&1
echo. > ".instalado-completo"

REM ------------------------------------------------------------------
REM  4. Modulo nativo (opcional - ha alternativa embutida)
REM ------------------------------------------------------------------
echo [4/7] Preparando o modulo nativo better-sqlite3...
call npx electron-builder install-app-deps >nul 2>&1
if errorlevel 1 (
  echo       [AVISO] Nao foi possivel compilar o better-sqlite3.
  echo               Sem problema: o aplicativo usa o SQLite embutido no
  echo               Electron ^(node:sqlite^) automaticamente.
) else (
  echo       OK.
)

REM ------------------------------------------------------------------
REM  5. Testes automatizados
REM ------------------------------------------------------------------
echo [5/7] Executando os testes automatizados...
call node test\teste-calendario.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes do calendario falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
call node --no-warnings test\teste-integracao.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes de integracao falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
call node --no-warnings test\teste-sincronizacao.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes de sincronizacao falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
call node --no-warnings test\teste-cripto.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes de criptografia falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
call node --no-warnings test\teste-mobile.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes do app de celular falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
call node --no-warnings test\teste-rotina.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes da rotina falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
call node --no-warnings test\teste-telas-celular.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes das telas do celular falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
call node --no-warnings test\teste-presenca.js >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Testes da lista de presenca falharam. Build interrompido.
  echo        Rode "rodar.bat testes" para ver os detalhes.
  goto :FALHA
)
echo       OK: todos os testes passaram.

REM ------------------------------------------------------------------
REM  6. Empacotamento
REM ------------------------------------------------------------------
echo [6/7] Empacotando o aplicativo...
if exist "dist\win-unpacked" rmdir /s /q "dist\win-unpacked"
call npx electron-builder --win --x64 --dir
if errorlevel 1 goto :FALHA

if not exist "dist\win-unpacked\CtrLoja.exe" (
  echo [ERRO] O empacotamento nao gerou dist\win-unpacked\CtrLoja.exe
  goto :FALHA
)

REM  Confere o conteudo do pacote lendo o cabecalho do app.asar.
REM  A leitura e feita por um script proprio, sem ferramenta externa:
REM  depender do "npx asar" gerava falso negativo em maquina sem internet.
call node "ferramentas\verificar-pacote.js"
if errorlevel 1 (
  echo [ERRO] O pacote gerado esta incompleto - veja a lista acima.
  goto :FALHA
)

REM  Logotipos e icone junto do executavel
for %%L in (Logo1 Logo2) do (
  for %%E in (png jpg jpeg webp svg) do (
    if exist "%%L.%%E" copy /y "%%L.%%E" "dist\win-unpacked\%%L.%%E" >nul
  )
)
if not exist "dist\win-unpacked\build" mkdir "dist\win-unpacked\build"
copy /y "build\icon.ico" "dist\win-unpacked\CtrLoja.ico" >nul

echo       OK: dist\win-unpacked\CtrLoja.exe

if /i "%ACAO%"=="app" goto :SUCESSO

REM ------------------------------------------------------------------
REM  7. Instalador Inno Setup
REM ------------------------------------------------------------------
:INSTALADOR
echo [7/7] Gerando o instalador com o Inno Setup...

if not exist "dist\win-unpacked\CtrLoja.exe" (
  echo [ERRO] Aplicativo nao empacotado. Rode "build.bat" sem parametros.
  goto :FALHA
)

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
  echo.
  echo [AVISO] ISCC.exe ^(Inno Setup^) nao encontrado.
  echo         Instale o Inno Setup 7 em https://jrsoftware.org/isdl.php
  echo         Depois rode:  build.bat setup
  goto :SUCESSO
)

echo       Usando: !ISCC!
"!ISCC!" "installer\CtrLoja.iss"
if errorlevel 1 goto :FALHA
goto :SUCESSO

REM ------------------------------------------------------------------
:LIMPAR
echo Removendo dist, node_modules e saidas do instalador...
if exist "dist" rmdir /s /q "dist"
if exist "node_modules" rmdir /s /q "node_modules"
if exist "installer\Output" rmdir /s /q "installer\Output"
if exist ".instalado-completo" del /q ".instalado-completo" >nul 2>&1
if exist ".instalado-interface" del /q ".instalado-interface" >nul 2>&1
echo Limpeza concluida.
goto :FIM

REM ------------------------------------------------------------------
:ACHARNODE
if defined NODEDIR exit /b 0
if "%~1"=="" exit /b 0
if exist "%~1\node.exe" set "NODEDIR=%~1"
exit /b 0

REM ------------------------------------------------------------------
:SUCESSO
echo.
echo ===================================================================
echo   BUILD CONCLUIDO
echo ===================================================================
echo.
echo   Aplicativo : dist\win-unpacked\CtrLoja.exe
for %%F in ("installer\Output\CtrLoja-Setup-*.exe") do (
  echo   Instalador : %%~fF
  echo   Tamanho    : %%~zF bytes
)
echo.
echo   O instalador e autonomo: leva o aplicativo, o banco de dados e a
echo   integracao com o WhatsApp. O computador de destino nao precisa de
echo   Node.js nem de navegador instalado.
echo.
goto :FIM

:FALHA
echo.
echo ===================================================================
echo   BUILD INTERROMPIDO - verifique as mensagens acima
echo ===================================================================
endlocal
pause
exit /b 1

:FIM
endlocal
pause
exit /b 0
