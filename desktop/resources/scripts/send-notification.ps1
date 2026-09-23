param(
    [string]$PayloadFile
)
$ErrorActionPreference = 'Stop'

try {
    if (-not (Test-Path $PayloadFile)) {
        throw "Payload file not found: $PayloadFile"
    }
    
    $raw = [System.IO.File]::ReadAllText($PayloadFile, [System.Text.Encoding]::UTF8)
    $data = $raw | ConvertFrom-Json

    $title = if ($data.title) { $data.title } else { "Llamadita" }
    $body = if ($data.body) { $data.body } else { "" }
    $avatarUrl = $data.avatarUrl
    $launchUri = if ($data.launchUri) { $data.launchUri } else { "llamadita://focus" }
    $appId = $data.appId

    # 1. Resolve AppId
    if (-not $appId) {
        $startApp = Get-StartApps | Where-Object { $_.Name -like "*Llamadita*" } | Select-Object -First 1
        if ($startApp -and $startApp.AppID) {
            $appId = $startApp.AppID
        } else {
            $appId = "C:\Users\juand\.gemini\antigravity\scratch\llamadita\desktop\dist\Llamadita\Llamadita-win_x64.exe"
        }
    }

    # 2. Download avatar if URL provided
    $localAvatarPath = ""
    if ($avatarUrl -and $avatarUrl -match "^https?://") {
        $cacheDir = Join-Path $env:TEMP "llamadita_cache"
        if (-not (Test-Path $cacheDir)) {
            New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
        }
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $hashBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($avatarUrl))
        $hash = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").Substring(0, 16)
        $targetFile = Join-Path $cacheDir "avatar_$hash.webp"
        
        if (-not (Test-Path $targetFile)) {
            try {
                Invoke-WebRequest -Uri $avatarUrl -OutFile $targetFile -UseBasicParsing -TimeoutSec 4
            } catch {
                $targetFile = ""
            }
        }
        if ($targetFile -and (Test-Path $targetFile)) {
            $localAvatarPath = $targetFile
        }
    } elseif ($avatarUrl -and (Test-Path $avatarUrl)) {
        $localAvatarPath = $avatarUrl
    }

    # 3. Build Toast XML
    $escTitle = [System.Security.SecurityElement]::Escape($title)
    $escBody = [System.Security.SecurityElement]::Escape($body)
    $escLaunch = [System.Security.SecurityElement]::Escape($launchUri)

    $imgTag = ""
    if ($localAvatarPath) {
        $escImg = [System.Security.SecurityElement]::Escape($localAvatarPath)
        $imgTag = "<image placement=`"appLogoOverride`" hint-crop=`"circle`" src=`"$escImg`"/>"
    }

    $xml = @"
<toast activationType="protocol" launch="$escLaunch">
  <visual>
    <binding template="ToastGeneric">
      <text>$escTitle</text>
      <text>$escBody</text>
      $imgTag
    </binding>
  </visual>
</toast>
"@

    # 4. Show Notification
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $xmlDoc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xmlDoc.LoadXml($xml)
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xmlDoc
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)

    Write-Output "SUCCESS: Notification displayed for $title"
} catch {
    Write-Error "ERROR: $_"
    exit 1
}
