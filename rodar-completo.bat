@echo off
setlocal
chcp 65001 >nul
title CtrLoja - Modo Completo (com WhatsApp)

REM ===================================================================
REM  CtrLoja - Atalho para o MODO COMPLETO
REM  A.R.L.S. Uniao Fraternal Rolandense n 141 - UFR / GLP
REM
REM  Instala TODAS as dependencias, inclusive a integracao com o
REM  WhatsApp, e abre o aplicativo.
REM
REM  Na primeira execucao o download e demorado (varios minutos).
REM  Nas proximas vezes a abertura e imediata.
REM
REM  Equivale a executar:  rodar.bat completo
REM ===================================================================

echo.
echo ===================================================================
echo   CtrLoja - MODO COMPLETO (com integracao WhatsApp)
echo ===================================================================
echo.
echo   Requisitos:
echo     - Google Chrome ou Microsoft Edge instalado
echo     - Internet no computador
echo     - Celular com o WhatsApp da Loja por perto (leitura do QR Code)
echo.
echo   O projeto e copiado para o disco local antes de abrir.
echo   Rodar de unidade de rede deixa o aplicativo MUITO lento.
echo   Seus dados nao mudam de lugar: continuam em %%APPDATA%%\CtrLoja.
echo.
echo   Na primeira vez o download leva alguns minutos. Aguarde.
echo.

call "%~dp0rodar.bat" local-completo
set "SAIDA=%ERRORLEVEL%"

endlocal & exit /b %SAIDA%
