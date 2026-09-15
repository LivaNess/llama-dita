[Setup]
AppName=Toki Podcast
AppVersion=1.1.0
AppPublisher=Toki Podcast
AppPublisherURL=https://github.com/LivaNess/toki-podcast
DefaultDirName={localappdata}\TokiPodcast
DefaultGroupName=Toki Podcast
OutputBaseFilename=TokiPodcast-Setup
OutputDir=installer_output
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\TokiPodcast.exe

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "C:\Users\juand\.gemini\antigravity\scratch\toki-desktop\dist\TokiPodcast\TokiPodcast-win_x64.exe"; DestDir: "{app}"; DestName: "TokiPodcast.exe"; Flags: ignoreversion
Source: "C:\Users\juand\.gemini\antigravity\scratch\toki-desktop\dist\TokiPodcast\resources.neu"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Toki Podcast"; Filename: "{app}\TokiPodcast.exe"
Name: "{group}\Desinstalar Toki Podcast"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Toki Podcast"; Filename: "{app}\TokiPodcast.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\TokiPodcast.exe"; Description: "{cm:LaunchProgram,Toki Podcast}"; Flags: nowait postinstall skipifsilent