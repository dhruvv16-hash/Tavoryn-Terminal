# Tavoryn Terminal Desktop Icon Generator
# Generates high-resolution CRT amber phosphor icons for desktop packaging

param (
    [string]$OutputDir = "D:\G_BLOOM\Tavoryn-Terminal\desktop\icons"
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

function Render-TavorynIcon([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Background CRT chassis: dark graphite
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 12, 13, 15))
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $cornerRad = [int]($size * 0.18)
    
    # Rounded rectangle path
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $cornerRad * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $g.FillPath($bgBrush, $path)

    # Outer bezel glow (amber/bronze border)
    $bezelPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 255, 176, 0), [float]($size * 0.025))
    $g.DrawPath($bezelPen, $path)

    # CRT scanline screen inner area
    $screenPad = [int]($size * 0.08)
    $screenSize = $size - ($screenPad * 2)
    $screenRect = New-Object System.Drawing.Rectangle($screenPad, $screenPad, $screenSize, $screenSize)
    $screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 18, 20, 24))
    $g.FillEllipse($screenBrush, $screenRect)

    # Ambient phosphor amber radial glow
    $glowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 255, 152, 0), [float]($size * 0.04))
    $g.DrawEllipse($glowPen, $screenRect)

    # Candlestick graphics in background
    $barWidth = [float]($size * 0.04)
    $barBrush1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 255, 176, 0))
    $wickPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 176, 0), [float]($size * 0.015))

    # Candlestick 1
    $g.DrawLine($wickPen, [float]($size * 0.28), [float]($size * 0.35), [float]($size * 0.28), [float]($size * 0.70))
    $g.FillRectangle($barBrush1, [float]($size * 0.26), [float]($size * 0.45), $barWidth, [float]($size * 0.18))

    # Candlestick 2
    $g.DrawLine($wickPen, [float]($size * 0.72), [float]($size * 0.25), [float]($size * 0.72), [float]($size * 0.65))
    $g.FillRectangle($barBrush1, [float]($size * 0.70), [float]($size * 0.32), $barWidth, [float]($size * 0.22))

    # Central glowing "T" - Tavoryn Phosphor Emblem
    $amberMain = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 184, 32))
    $amberGlow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 214, 102))

    # Top horizontal bar of T
    $tBarX = [float]($size * 0.22)
    $tBarY = [float]($size * 0.28)
    $tBarW = [float]($size * 0.56)
    $tBarH = [float]($size * 0.12)
    $g.FillRectangle($amberMain, $tBarX, $tBarY, $tBarW, $tBarH)

    # Center vertical stem of T
    $tStemX = [float]($size * 0.44)
    $tStemY = [float]($size * 0.38)
    $tStemW = [float]($size * 0.12)
    $tStemH = [float]($size * 0.42)
    $g.FillRectangle($amberMain, $tStemX, $tStemY, $tStemW, $tStemH)

    # Inner core highlight of T (high phosphor intensity)
    $g.FillRectangle($amberGlow, [float]($tBarX + ($size * 0.02)), [float]($tBarY + ($size * 0.025)), [float]($tBarW - ($size * 0.04)), [float]($size * 0.04))
    $g.FillRectangle($amberGlow, [float]($tStemX + ($size * 0.025)), [float]($tStemY), [float]($size * 0.05), [float]($tStemH - ($size * 0.03)))

    $g.Dispose()
    return $bmp
}

Write-Host "Generating Tavoryn Terminal icons in $OutputDir..."

# Primary 1024x1024 master icon
$master = Render-TavorynIcon 1024
$master.Save((Join-Path $OutputDir "app-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$master.Save((Join-Path $OutputDir "1024x1024.png"), [System.Drawing.Imaging.ImageFormat]::Png)

# Standard desktop PNG sizes
$sizes = @(32, 64, 128, 256, 512)
foreach ($s in $sizes) {
    $img = Render-TavorynIcon $s
    $img.Save((Join-Path $OutputDir "$($s)x$($s).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    if ($s -eq 128) {
        $img2x = Render-TavorynIcon 256
        $img2x.Save((Join-Path $OutputDir "128x128@2x.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $img2x.Dispose()
    }
    $img.Dispose()
}

# Windows app manifest tile logos
$tileSizes = @(
    @{ Name = "Square30x30Logo.png"; Size = 30 },
    @{ Name = "Square44x44Logo.png"; Size = 44 },
    @{ Name = "Square71x71Logo.png"; Size = 71 },
    @{ Name = "Square89x89Logo.png"; Size = 89 },
    @{ Name = "Square107x107Logo.png"; Size = 107 },
    @{ Name = "Square142x142Logo.png"; Size = 142 },
    @{ Name = "Square150x150Logo.png"; Size = 150 },
    @{ Name = "Square310x310Logo.png"; Size = 310 },
    @{ Name = "StoreLogo.png"; Size = 50 }
)

foreach ($tile in $tileSizes) {
    $img = Render-TavorynIcon $tile.Size
    $img.Save((Join-Path $OutputDir $tile.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
}

# Generate Windows multi-resolution icon.ico
$icoPath = Join-Path $OutputDir "icon.ico"
$iconSizes = @(16, 32, 48, 64, 128, 256)
$iconBitmaps = @()
foreach ($isize in $iconSizes) {
    $iconBitmaps += Render-TavorynIcon $isize
}

# Save .ico header and directory
$stream = [System.IO.File]::Create($icoPath)
$writer = New-Object System.IO.BinaryWriter($stream)

# ICONDIR header: idReserved (0), idType (1 for ICO), idCount
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$iconBitmaps.Count)

$pngStreams = @()
foreach ($b in $iconBitmaps) {
    $ms = New-Object System.IO.MemoryStream
    $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngStreams += $ms
}

$offset = 6 + (16 * $iconBitmaps.Count)
for ($i = 0; $i -lt $iconBitmaps.Count; $i++) {
    $w = $iconSizes[$i]
    $bWidth = if ($w -ge 256) { 0 } else { [byte]$w }
    $bHeight = if ($w -ge 256) { 0 } else { [byte]$w }
    $bytes = $pngStreams[$i].ToArray()
    
    $writer.Write([byte]$bWidth)
    $writer.Write([byte]$bHeight)
    $writer.Write([byte]0) # Color count
    $writer.Write([byte]0) # Reserved
    $writer.Write([uint16]1) # Color planes
    $writer.Write([uint16]32) # Bits per pixel
    $writer.Write([uint32]$bytes.Length) # Image size in bytes
    $writer.Write([uint32]$offset) # Offset
    $offset += $bytes.Length
}

for ($i = 0; $i -lt $iconBitmaps.Count; $i++) {
    $bytes = $pngStreams[$i].ToArray()
    $writer.Write($bytes)
    $pngStreams[$i].Dispose()
    $iconBitmaps[$i].Dispose()
}

$writer.Flush()
$writer.Close()
$stream.Close()
$master.Dispose()

Write-Host "Successfully generated all icons including icon.ico!"
