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
REM    rodar.bat local        -> COPIA o projeto para uma pasta local do
REM                              usuario e roda de la. Use quando o projeto
REM                              estiver em unidade de rede/mapeada e o
REM                              Electron reclamar do processo de GPU.
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
REM  Ambiente - procura o Node.js no PATH e nos locais mais comuns
REM ------------------------------------------------------------------
set "NODEDIR="

where node >nul 2>&1
if not errorlevel 1 goto :NODE_OK

echo [1/3] Node.js nao esta no PATH. Procurando nas pastas usuais...

call :ACHAR "%ProgramFiles%\nodejs"
call :ACHAR "%ProgramW6432%\nodejs"
call :ACHAR "%SystemDrive%\Program Files (x86)\nodejs"
call :ACHAR "%LOCALAPPDATA%\Programs\nodejs"
call :ACHAR "%LOCALAPPDATA%\Programs\node"
call :ACHAR "%ProgramData%\chocolatey\lib\nodejs\tools"
call :ACHAR "%USERPROFILE%\scoop\apps\nodejs\current"
call :ACHAR "%NVM_SYMLINK%"

REM  nvm-windows: pega a versao mais recente instalada
if not defined NODEDIR if exist "%ProgramData%\nvm" (
  for /d %%V in ("%ProgramData%\nvm\v*") do call :ACHAR "%%~V"
)
if not defined NODEDIR if exist "%APPDATA%\nvm" (
  for /d %%V in ("%APPDATA%\nvm\v*") do call :ACHAR "%%~V"
)

if not defined NODEDIR (
  echo.
  echo ===================================================================
  echo   [ERRO] Node.js nao esta instalado neste computador.
  echo ===================================================================
  echo.
  echo   O CtrLoja precisa do Node.js para rodar a partir do codigo-fonte.
  echo.
  echo   COMO RESOLVER:
  echo     1^) Acesse  https://nodejs.org
  echo     2^) Baixe a versao *LTS* para Windows ^(instalador .msi de 64 bits^)
  echo     3^) Instale aceitando todas as opcoes padrao
  echo        ^(deixe marcada a opcao "Add to PATH"^)
  echo     4^) FECHE esta janela e execute o rodar.bat novamente
  echo.
  where winget >nul 2>&1
  if not errorlevel 1 (
    echo   Este computador possui o winget: posso instalar automaticamente.
    echo.
    set /p "RESP=   Instalar o Node.js LTS agora? [S/N] "
    if /i "!RESP!"=="S" goto :INSTALARNODE
  )
  goto :FALHA
)

set "PATH=%NODEDIR%;%PATH%"
echo       Node.js localizado em: %NODEDIR%

:NODE_OK
for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODEV=%%v"
if not defined NODEV (
  echo [ERRO] Node.js encontrado, mas nao executou corretamente.
  goto :FALHA
)
echo [1/3] Node.js !NODEV!

REM  Aviso de versao antiga: o modo interface exige Node/Electron recente
set "NODEMAJOR=!NODEV:v=!"
for /f "tokens=1 delims=." %%m in ("!NODEMAJOR!") do set "NODEMAJOR=%%m"
if !NODEMAJOR! LSS 18 (
  echo       [AVISO] Versao antiga do Node.js detectada.
  echo               Recomendado: Node.js 20 LTS ou superior.
)

if /i "%MODO%"=="testes" goto :TESTES
if /i "%MODO%"=="local" set "LOCALMODO=interface" & goto :COPIALOCAL
if /i "%MODO%"=="local-completo" set "LOCALMODO=completo" & goto :COPIALOCAL

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
REM  Copia o projeto para uma pasta local e roda de la
REM ------------------------------------------------------------------
:COPIALOCAL
set "DESTINO=%LOCALAPPDATA%\CtrLoja-dev"
if not defined LOCALMODO set "LOCALMODO=interface"

if /i "%LOCALMODO%"=="completo" (
  set "MARCA=.instalado-completo"
  set "CMDINSTALL=npm install --no-audit --no-fund"
) else (
  set "MARCA=.instalado-interface"
  set "CMDINSTALL=npm install --omit=optional --no-audit --no-fund"
)

echo [2/3] Sincronizando o projeto com a pasta local...
echo       Origem : %~dp0
echo       Destino: %DESTINO%

REM  Copia apenas os arquivos alterados - rapido a partir da segunda vez
robocopy "%~dp0." "%DESTINO%" /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 ^
  /XD node_modules dist .git installer\Output ^
  /XF .instalado-interface .instalado-completo *.db
if errorlevel 8 (
  echo [ERRO] Falha ao copiar os arquivos.
  goto :FALHA
)
echo       Sincronizacao concluida.
echo.

pushd "%DESTINO%"

if exist "node_modules" if exist "!MARCA!" goto :EXECUTARLOCAL

echo       Instalando dependencias na pasta local...
echo       ^(so na primeira vez - pode demorar alguns minutos^)
echo.
call !CMDINSTALL!
if errorlevel 1 (
  popd
  goto :FALHA
)
echo. > "!MARCA!"

:EXECUTARLOCAL
echo [3/3] Abrindo o CtrLoja a partir do disco local...
echo.
call npx electron .
popd
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
REM ------------------------------------------------------------------
REM  Instalacao assistida do Node.js via winget
REM ------------------------------------------------------------------
:INSTALARNODE
echo.
echo   Instalando o Node.js LTS ^(aceite o prompt do Windows, se aparecer^)...
echo.
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
echo.
echo ===================================================================
echo   Instalacao finalizada.
echo   FECHE esta janela e execute o rodar.bat novamente para que o
echo   Windows reconheca o Node.js no PATH.
echo ===================================================================
echo.
pause
endlocal
exit /b 0

REM ------------------------------------------------------------------
REM  Sub-rotina: registra a pasta se houver node.exe dentro dela
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
echo Aplicativo encerrado.
pause
endlocal
exit /b 0
