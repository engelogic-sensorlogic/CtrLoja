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
echo       Pasta: %CD%

git rev-parse --is-inside-work-tree >nul 2>"%TEMP%\ctrloja-git-erro.txt"
if not errorlevel 1 goto :REPO_OK

REM ------------------------------------------------------------------
REM  O Git recusa repositorios cujo dono seja outro usuario. Isso ocorre
REM  sempre que a pasta esta em unidade de rede/mapeada, como o Z:.
REM  A mensagem e "detected dubious ownership".
REM ------------------------------------------------------------------
findstr /i /c:"dubious ownership" /c:"safe.directory" "%TEMP%\ctrloja-git-erro.txt" >nul 2>&1
if errorlevel 1 goto :REPO_ERRO

echo.
echo       O Git bloqueou a pasta por estar em unidade de rede
echo       ^(verificacao de propriedade do repositorio^).
echo       Liberando esta pasta especifica...

set "PASTA=%CD%"
set "PASTABARRA=%PASTA:\=/%"
git config --global --add safe.directory "%PASTA%"       >nul 2>&1
git config --global --add safe.directory "%PASTABARRA%"  >nul 2>&1
git config --global --add safe.directory "%~dp0."        >nul 2>&1

git rev-parse --is-inside-work-tree >nul 2>"%TEMP%\ctrloja-git-erro.txt"
if errorlevel 1 goto :REPO_ERRO

echo       Liberado. Seguindo.
goto :REPO_OK

:REPO_ERRO
echo.
echo [ERRO] O Git nao conseguiu abrir esta pasta como repositorio.
echo.
echo   Mensagem do Git:
type "%TEMP%\ctrloja-git-erro.txt" 2>nul
echo.
if not exist ".git" (
  echo   A pasta .git nao existe aqui - o repositorio nao foi inicializado
  echo   nesta pasta. Confirme que o publicar-github.bat esta na raiz do
  echo   projeto, junto do package.json.
)
echo.
pause
exit /b 1

:REPO_OK
del /q "%TEMP%\ctrloja-git-erro.txt" >nul 2>&1

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
  REM  O prompt vai num ECHO separado de proposito.
  REM  Com a pagina de codigo UTF-8 (chcp 65001), o cmd.exe NAO mostra o
  REM  texto do proprio SET /P - ele fica esperando a resposta com a tela
  REM  em branco, como se tivesse travado. Escrevendo a pergunta antes,
  REM  com ECHO, ela aparece sempre.
  echo       Descreva o que mudou. Exemplo:
  echo         Lista de presenca, cargos com senha e tela inicial publica
  echo.
  echo       ^(deixe em branco e tecle ENTER para cancelar^)
  echo.
  set "MSG="
  set /p "MSG=      Mensagem do commit: "
  if "!MSG!"=="" (
    echo.
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
