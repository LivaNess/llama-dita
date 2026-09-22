[Setup]
AppName=Llamadita
AppVersion=0.24.2Y
AppPublisher=Llamadita
AppPublisherURL=https://llamadita.com.ar
DefaultDirName={localappdata}\Llamadita
DefaultGroupName=Llamadita
OutputBaseFilename=Llamadita-Setup
OutputDir=installer
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\Llamadita.exe
SetupIconFile=desktop\resources\icons\app.ico

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "desktop\dist\Llamadita\Llamadita-win_x64.exe"; DestDir: "{app}"; DestName: "Llamadita.exe"; Flags: ignoreversion
Source: "desktop\dist\Llamadita\resources.neu"; DestDir: "{app}"; Flags: ignoreversion
Source: "desktop\dist\Llamadita\abrir-enlace.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "desktop\dist\Llamadita\abrir-enlace.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
; El enlace del mail (llamadita://) abre la app de forma silenciosa sin consola negra
Root: HKCU; Subkey: "Software\Classes\llamadita"; ValueType: string; ValueName: ""; ValueData: "URL:Llamadita"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\llamadita"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\llamadita\shell\open\command"; ValueType: string; ValueName: ""; ValueData: "wscript.exe //B //Nologo """"{app}\abrir-enlace.vbs"""" """"%1"""""; Flags: uninsdeletekey

[Icons]
Name: "{group}\Llamadita"; Filename: "{app}\Llamadita.exe"
Name: "{group}\Desinstalar Llamadita"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Llamadita"; Filename: "{app}\Llamadita.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Llamadita.exe"; Description: "{cm:LaunchProgram,Llamadita}"; Flags: nowait postinstall skipifsilent