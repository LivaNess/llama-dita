[Setup]
AppName=Llama-dita
AppVersion=0.21.3C
AppPublisher=Llama-dita
AppPublisherURL=https://llamadita.com.ar
DefaultDirName={localappdata}\Llama-dita
DefaultGroupName=Llama-dita
OutputBaseFilename=Llama-dita-Setup
OutputDir=installer
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\Llama-dita.exe
SetupIconFile=desktop\resources\icons\app.ico

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "desktop\dist\Llama-dita\Llama-dita-win_x64.exe"; DestDir: "{app}"; DestName: "Llama-dita.exe"; Flags: ignoreversion
Source: "desktop\dist\Llama-dita\resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "desktop\dist\Llama-dita\abrir-enlace.cmd"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
; El enlace del mail (llamadita://) abre la app
Root: HKCU; Subkey: "Software\Classes\llamadita"; ValueType: string; ValueName: ""; ValueData: "URL:Llama-dita"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\llamadita"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
; Apunta al script, no al ejecutable: abrir una segunda copia de la app falla.
Root: HKCU; Subkey: "Software\Classes\llamadita\shell\open\command"; ValueType: string; ValueName: ""; ValueData: "cmd /c """"{app}\abrir-enlace.cmd"" ""%1"""""

[Icons]
Name: "{group}\Llama-dita"; Filename: "{app}\Llama-dita.exe"
Name: "{group}\Desinstalar Llama-dita"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Llama-dita"; Filename: "{app}\Llama-dita.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Llama-dita.exe"; Description: "{cm:LaunchProgram,Llama-dita}"; Flags: nowait postinstall skipifsilent