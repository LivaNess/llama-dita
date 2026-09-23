Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\juand\.gemini\antigravity\scratch\llamadita\public\brand\logo.png"
$appIconPng = "C:\Users\juand\.gemini\antigravity\scratch\llamadita\desktop\resources\icons\appIcon.png"
$appIco = "C:\Users\juand\.gemini\antigravity\scratch\llamadita\desktop\resources\icons\app.ico"
$trayIcon = "C:\Users\juand\.gemini\antigravity\scratch\llamadita\desktop\resources\icons\trayIcon.png"

$src = [System.Drawing.Bitmap]::FromFile($srcPath)

function CreateSquircleIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Squircle / rounded rectangle fondo navy de la marca (#16203c)
    $radius = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $dia = $radius * 2

    $path.AddArc($rect.X, $rect.Y, $dia, $dia, 180, 90)
    $path.AddArc($rect.Right - $dia, $rect.Y, $dia, $dia, 270, 90)
    $path.AddArc($rect.Right - $dia, $rect.Bottom - $dia, $dia, $dia, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $dia, $dia, $dia, 90, 90)
    $path.CloseFigure()

    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 32, 60))
    $g.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()

    # Dibujar la llama centrada
    $padding = [int]($size * 0.08)
    $drawW = $size - ($padding * 2)
    $scale = $drawW / $src.Width
    $drawH = [int]($src.Height * $scale)
    if ($drawH -gt ($size - $padding)) {
        $scale = ($size - ($padding * 1.5)) / $src.Height
        $drawH = [int]($src.Height * $scale)
        $drawW = [int]($src.Width * $scale)
    }
    $x = [int](($size - $drawW) / 2)
    $y = [int]($size - $drawH) # apoyada abajo como en appIcon original

    $g.DrawImage($src, $x, $y, $drawW, $drawH)
    $g.Dispose()
    return $bmp
}

# 1. Generar appIcon.png (256x256)
$icon256 = CreateSquircleIcon 256
$icon256.Save($appIconPng, [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Generar trayIcon.png (32x32)
$icon32 = CreateSquircleIcon 32
$icon32.Save($trayIcon, [System.Drawing.Imaging.ImageFormat]::Png)
$icon32.Dispose()

# 3. Generar app.ico multi-resolución (256, 128, 64, 48, 32, 16)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngStreams = @()

foreach ($s in $sizes) {
    $b = CreateSquircleIcon $s
    $ms = New-Object System.IO.MemoryStream
    $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $b.Dispose()
    $pngStreams += $ms
}

$icoFile = [System.IO.File]::Open($appIco, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($icoFile)

# ICONDIR header
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type: 1 = ICO
$bw.Write([uint16]$sizes.Count) # Image count

$offset = 6 + (16 * $sizes.Count)

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $data = $pngStreams[$i].ToArray()
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s })) # Width (0 = 256)
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s })) # Height (0 = 256)
    $bw.Write([byte]0) # Color palette count
    $bw.Write([byte]0) # Reserved
    $bw.Write([uint16]1) # Color planes
    $bw.Write([uint16]32) # Bits per pixel
    $bw.Write([uint32]$data.Length) # Image size in bytes
    $bw.Write([uint32]$offset) # Image offset
    $offset += $data.Length
}

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $data = $pngStreams[$i].ToArray()
    $bw.Write($data)
    $pngStreams[$i].Dispose()
}

$bw.Flush()
$bw.Close()
$icoFile.Close()
$src.Dispose()
$icon256.Dispose()

Write-Output "Generated appIcon.png and app.ico successfully!"
