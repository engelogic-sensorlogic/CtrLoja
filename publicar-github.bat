@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CtrLoja - Publicar no GitHub

REM ===================================================================
REM  Envia os commits e as tags para o repositorio no GitHub:
REM  https://github.com/engelogic-sensorlogic/CtrLoja
REM
REM  Na primeira vez o Windows abre uma janela pedindo para entrar na
REM  sua conta do GitHub. Depois disso a credencial fica guardada.
REM ===================================================================

cd /d "%~dp0"

echo.
echo ===================================================================
echo   CtrLoja - Publicar no GitHub
echo ===================================================================
echo.

REM ------------------------------------------------------------------
REM  Git instalado?
REM ------------------------------------------------------------------
set "GITDIR="
where git >nul 2>&1
if not errorlevel 1 goto :GIT_OK

for %%D in (
  "%ProgramFiles%\Git\cmd"
  "%ProgramFiles(x86)%\Git\cmd"
  "%LOCALAPPDATA%\Programs\Git\cmd"
) do (
  if exist "%%~D\git.exe" if not defined GITDIR set "GITDIR=%%~D"
)

if not defined GITDIR (
  echo [ERRO] Git nao encontrado neste computador.
  echo.
  echo   COMO RESOLVER:
  echo     1^) Baixe em  https://git-scm.com/download/win
  echo     2^) Instale aceitando as opcoes padrao
  echo     3^) FECHE esta janela e execute o publicar-github.bat novamente
  echo.
  echo   Alternativa pelo terminal:
  echo        winget install Git.Git
  echo.
  pause
  exit /b 1
)
set "PATH=%GITDIR%;%PATH%"

:GIT_OK
for /f "tokens=*" %%v in ('git --version 2^>nul') do set "GITV=%%v"
echo [1/4] !GITV!

REM ------------------------------------------------------------------
REM  Situacao do repositorio
REM ------------------------------------------------------------------
echo [2/4] Conferindo o repositorio...

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Esta pasta nao e um repositorio Git.
  pause
  exit /b 1
)

for /f "tokens=*" %%r in ('git config --get remote.origin.url 2^>nul') do set "ORIGEM=%%r"
if not defined ORIGEM (
  echo       Nenhum remote configurado. Configurando...
  git remote add origin https://github.com/engelogic-sensorlogic/CtrLoja.git
  set "ORIGEM=https://github.com/engelogic-sensorlogic/CtrLoja.git"
)
echo       Destino: !ORIGEM!

REM  Alteracoes ainda nao commitadas?
git diff --quiet --exit-code
set "SUJO1=%ERRORLEVEL%"
git diff --cached --quiet --exit-code
set "SUJO2=%ERRORLEVEL%"

if "%SUJO1%%SUJO2%" NEQ "00" (
  echo.
  echo       Ha alteracoes ainda nao commitadas:
  git status --short
  echo.
  set /p "MSG=      Mensagem do commit (ENTER cancela): "
  if "!MSG!"=="" (
    echo       Cancelado. Nada foi enviado.
    pause
    exit /b 0
  )
  git add -A
  git commit -m "!MSG!"
  if errorlevel 1 (
    echo [ERRO] Falha ao criar o commit.
    pause
    exit /b 1
  )
)

REM ------------------------------------------------------------------
REM  O que sera enviado
REM ------------------------------------------------------------------
echo [3/4] Commits a publicar:
git log --oneline -5
echo.

REM ------------------------------------------------------------------
REM  Envio
REM ------------------------------------------------------------------
echo [4/4] Enviando para o GitHub...
echo       ^(se aparecer uma janela de login, entre com a sua conta^)
echo.

git push -u origin main
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao enviar.
  echo.
  echo   Causas comuns:
  echo     - Login cancelado ou credencial invalida
  echo     - Repositorio ainda nao criado no GitHub
  echo       ^(crie em https://github.com/new com o nome CtrLoja^)
  echo     - Sem permissao de escrita na conta engelogic-sensorlogic
  echo.
  pause
  exit /b 1
)

git push origin --tags
if errorlevel 1 echo       [AVISO] Commits enviados, mas houve falha ao enviar as tags.

echo.
echo ===================================================================
echo   PUBLICADO COM SUCESSO
echo ===================================================================
echo.
echo   https://github.com/engelogic-sensorlogic/CtrLoja
echo.
pause
endlocal
exit /b 0
