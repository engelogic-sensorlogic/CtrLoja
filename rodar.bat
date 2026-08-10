@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CtrLoja - Execucao para testes

REM ===================================================================
REM  CtrLoja - Executa o aplicativo direto do codigo-fonte
REM
REM  Uso:
REM    rodar.bat              -> MODO PADRAO
REM                              instala tudo, inclusive a integracao com
REM                              o WhatsApp (Baileys), sem compilar o
REM                              modulo nativo do banco. Usa o SQLite
REM                              embutido no Electron.
REM
REM    rodar.bat completo     -> MODO COMPLETO
REM                              o mesmo, tentando ainda compilar o
REM                              better-sqlite3 (banco um pouco mais rapido).
REM
REM    rodar.bat local        -> COPIA o projeto para uma pasta local do
REM                              usuario e roda de la.
REM
REM    rodar.bat rede         -> forca a execucao a partir da pasta atual,
REM                              mesmo fora do disco C:. Use so para teste:
REM                              o Electron costuma nao abrir assim.
REM
REM    rodar.bat testes       -> roda apenas os testes automatizados
REM
REM  IMPORTANTE: estando o projeto fora do disco C: (Z:, unidade de rede),
REM  a copia local e usada AUTOMATICAMENTE - o Electron nao consegue criar
REM  a janela de la. Os dados nao mudam de lugar: %APPDATA%\CtrLoja.
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
    REM  Com chcp 65001 o cmd.exe nao mostra o texto do SET /P: a pergunta
    REM  vai antes, num ECHO, senao a tela parece travada.
    echo   Instalar o Node.js LTS agora? [S/N]
    set "RESP="
    set /p "RESP=   Sua resposta: "
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
if /i "%MODO%"=="rede" set "MODO=interface" & goto :DEPENDENCIAS

REM ------------------------------------------------------------------
REM  Projeto fora do disco C:? Roda da copia local, sempre.
REM
REM  O Chromium que vem dentro do Electron NAO consegue criar a janela
REM  a partir de unidade mapeada ou de rede neste computador: o processo
REM  morre antes de desenhar, sem mensagem nenhuma. Ja tentamos desligar
REM  a aceleracao grafica e os contornos so mudaram o sintoma - janela
REM  vazia, ou janela que nao aparece.
REM
REM  Entao a copia local deixou de ser contorno e virou o padrao. O
REM  codigo-fonte continua aqui, no Z:, e SEUS DADOS tambem nao mudam
REM  de lugar - ficam sempre em %APPDATA%\CtrLoja.
REM
REM  Para forcar a execucao daqui mesmo:  rodar.bat rede
REM ------------------------------------------------------------------
if /i not "%~d0"=="C:" (
  echo.
  echo       O projeto esta na unidade %~d0 e o aplicativo sera executado
  echo       a partir de uma copia no disco local ^(mais rapido e estavel^).
  echo       Seus dados continuam em %%APPDATA%%\CtrLoja.
  echo.
  set "LOCALMODO=%MODO%"
  goto :COPIALOCAL
)

:DEPENDENCIAS

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
  call :PRECISAINSTALAR "!MARCA!"
  if not errorlevel 1 (
    echo [2/3] Dependencias ja instaladas neste modo.
    goto :EXECUTAR
  )
  echo [2/3] O package.json mudou desde a ultima instalacao. Atualizando...
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

REM  ------------------------------------------------------------------
REM  Diz ao aplicativo onde fica o PROJETO DE VERDADE.
REM
REM  A copia local e descartavel e nao tem o .git - ela existe so para o
REM  Electron conseguir abrir a janela. Publicar dentro dela seria jogar
REM  o pacote fora: na proxima abertura o robocopy apagaria tudo, e o
REM  publicar-github.bat nem repositorio encontraria.
REM
REM  Com esta variavel, o botao "Publicar para o celular" grava na pasta
REM  original e o envio ao GitHub acontece onde o repositorio esta.
REM  ------------------------------------------------------------------
set "CTRLOJA_PROJETO=%~dp0"

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

if exist "node_modules" if exist "!MARCA!" (
  call :PRECISAINSTALAR "!MARCA!"
  if not errorlevel 1 goto :EXECUTARLOCAL
  echo       O package.json mudou: atualizando as dependencias...
)

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

REM  Os dois testes de tela usam o jsdom - centenas de arquivos. Lidos
REM  de unidade mapeada, ou por VPN, o require sozinho leva minutos e
REM  parece travamento. Fora do disco C: eles se declaram pulados.
if /i not "%~d0"=="C:" (
  set "CTRLOJA_SEM_JSDOM=1"
  echo       [NOTA] Projeto em %~d0 - os testes de tela serao pulados.
  echo              Rode a bateria do disco local para inclui-los.
)
echo.
REM  Primeiro o driver: nao adianta testar regra de negocio se o banco
REM  esta entregando as linhas de um jeito que o programa nao espera.
call node --no-warnings test\teste-driver.js
if errorlevel 1 goto :FALHA
call node test\teste-calendario.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-integracao.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-rotina.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-mobile.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-cripto.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-sincronizacao.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-presenca.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-financeiro.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-publicacao.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-convite.js
if errorlevel 1 goto :FALHA
call node --no-warnings test\teste-telas-pc.js
if errorlevel 1 goto :FALHA
REM  Telas do celular: so roda se o jsdom estiver instalado; senao ele
REM  mesmo avisa e passa adiante, sem reprovar nada.
call node --no-warnings test\teste-telas-celular.js
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
REM  Sub-rotina: o package.json e mais novo que o marcador de instalacao?
REM  errorlevel 1 = precisa reinstalar   |   errorlevel 0 = esta em dia
REM ------------------------------------------------------------------
:PRECISAINSTALAR
node -e "const fs=require('fs');let p=0,m=0;try{p=fs.statSync('package.json').mtimeMs}catch{};try{m=fs.statSync(process.argv[1]).mtimeMs}catch{};process.exit(p>m?1:0)" "%~1"
exit /b %ERRORLEVEL%

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
