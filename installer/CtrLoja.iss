; ===================================================================
;  CtrLoja - Script de instalacao (Inno Setup 7)
;  A.R.L.S. Uniao Fraternal Rolandense n 141 - UFR / GLP
;
;  Instalador COMPLETO e autonomo: leva o aplicativo, o banco de dados
;  e a integracao com o WhatsApp (Baileys). O computador de destino nao
;  precisa de Node.js, navegador ou qualquer outro pre-requisito.
;
;  Compile com:  ISCC.exe installer\CtrLoja.iss
;  ou execute o build.bat na raiz do projeto.
; ===================================================================

#define AppName        "CtrLoja"
#define AppVersion     "1.0.0"
#define AppPublisher   "Engelogic / SensorLogic"
#define AppURL         "https://github.com/engelogic-sensorlogic/CtrLoja"
#define AppExeName     "CtrLoja.exe"
#define IconName       "CtrLoja.ico"
#define SourceDir      "..\dist\win-unpacked"
#define ProjectDir     ".."

[Setup]
AppId={{8F3C1A72-6E5B-4C0D-9A31-5D4E7B2F1C88}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
LicenseFile={#ProjectDir}\LICENSE
OutputDir=Output
OutputBaseFilename=CtrLoja-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

; ---- Icone: esquadro e compasso com fundo azul ----
; Aparece no proprio arquivo do instalador, na janela do aplicativo,
; nos atalhos e na lista de programas instalados do Windows.
SetupIconFile={#ProjectDir}\build\icon.ico
UninstallDisplayIcon={app}\{#IconName}
UninstallDisplayName={#AppName} - Agenda Maconica

VersionInfoDescription=CtrLoja - Gestor de Agenda e Comunicacao Maconica
VersionInfoCompany={#AppPublisher}
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Area de Trabalho"; GroupDescription: "Atalhos:"
; Marcada por padrao: o disparo automatico exige o aplicativo aberto no horario
Name: "startupicon"; Description: "Iniciar o CtrLoja junto com o Windows (recomendado para o disparo automatico)"; GroupDescription: "Inicializacao:"

[Files]
; Aplicativo empacotado pelo electron-builder (inclui a integracao WhatsApp)
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Icone usado pelos atalhos e pela lista de programas
Source: "{#ProjectDir}\build\icon.ico"; DestDir: "{app}"; DestName: "{#IconName}"; Flags: ignoreversion

; Logotipos da Loja (opcionais - ficam na raiz da instalacao)
Source: "{#ProjectDir}\Logo1.png"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#ProjectDir}\Logo2.png"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#ProjectDir}\Logo1.jpg"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#ProjectDir}\Logo2.jpg"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Documentacao
Source: "{#ProjectDir}\README.md"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#ProjectDir}\docs\TESTE-WHATSAPP.md"; DestDir: "{app}\docs"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#IconName}"
Name: "{group}\Desinstalar {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\{#IconName}"; Comment: "Agenda e comunicacao da Loja UFR n 141"; Tasks: desktopicon
; Na inicializacao do Windows o aplicativo abre minimizado, sem atrapalhar
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Parameters: "--minimizado"; IconFilename: "{app}\{#IconName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Executar o {#AppName} agora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\resources\app.asar.unpacked"
Type: filesandordirs; Name: "{app}\locales"

[Code]
// Impede a instalacao com o aplicativo em execucao
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM {#AppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Resposta: Integer;
  Pasta: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    Pasta := ExpandConstant('{userappdata}\CtrLoja');
    if DirExists(Pasta) then
    begin
      Resposta := MsgBox('Deseja remover tambem o banco de dados, a sessao do WhatsApp e os registros?' + #13#10 +
                         'Se pretende reinstalar o CtrLoja, escolha Nao para preservar os dados.',
                         mbConfirmation, MB_YESNO);
      if Resposta = IDYES then
        DelTree(Pasta, True, True, True);
    end;
  end;
end;
