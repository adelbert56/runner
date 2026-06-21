Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root "site\assets"
$svgPath = Join-Path $assetsDir "favicon.svg"
$favicon32Path = Join-Path $assetsDir "favicon-32.png"
$appleTouchPath = Join-Path $assetsDir "apple-touch-icon.png"
$faviconIcoPath = Join-Path $root "site\favicon.ico"

function New-IconBitmap {
  param(
    [int]$Size
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 64.0
  $rect = [System.Drawing.RectangleF]::new(4 * $scale, 4 * $scale, 56 * $scale, 56 * $scale)
  $radius = 16 * $scale

  $rounded = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $rounded.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $rounded.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $rounded.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $rounded.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $rounded.CloseFigure()

  $bgStart = [System.Drawing.ColorTranslator]::FromHtml("#314a7a")
  $bgEnd = [System.Drawing.ColorTranslator]::FromHtml("#18253f")
  $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(12 * $scale, 10 * $scale),
    [System.Drawing.PointF]::new(54 * $scale, 56 * $scale),
    $bgStart,
    $bgEnd
  )
  $graphics.FillPath($bgBrush, $rounded)

  $routeBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(10 * $scale, 43 * $scale),
    [System.Drawing.PointF]::new(50 * $scale, 30 * $scale),
    [System.Drawing.ColorTranslator]::FromHtml("#f4c76a"),
    [System.Drawing.ColorTranslator]::FromHtml("#f39b4a")
  )
  $routePen = [System.Drawing.Pen]::new($routeBrush, 4 * $scale)
  $routePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $routePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  [System.Drawing.PointF[]]$routePoints = @(
    [System.Drawing.PointF]::new(13 * $scale, 44 * $scale),
    [System.Drawing.PointF]::new(19 * $scale, 37 * $scale),
    [System.Drawing.PointF]::new(26 * $scale, 35 * $scale),
    [System.Drawing.PointF]::new(33 * $scale, 40 * $scale),
    [System.Drawing.PointF]::new(43 * $scale, 42 * $scale),
    [System.Drawing.PointF]::new(53 * $scale, 39 * $scale)
  )
  $graphics.DrawCurve($routePen, $routePoints)

  $white = [System.Drawing.ColorTranslator]::FromHtml("#f7f9ff")
  $runnerPen = [System.Drawing.Pen]::new($white, 4 * $scale)
  $runnerPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $runnerPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $runnerPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $headBrush = [System.Drawing.SolidBrush]::new($white)
  $graphics.FillEllipse($headBrush, 22.75 * $scale, 12.75 * $scale, 10.5 * $scale, 10.5 * $scale)

  $torso = [System.Drawing.Drawing2D.GraphicsPath]::new()
  [System.Drawing.PointF[]]$torsoPoints = @(
    [System.Drawing.PointF]::new(30 * $scale, 25 * $scale),
    [System.Drawing.PointF]::new(22 * $scale, 33 * $scale),
    [System.Drawing.PointF]::new(32 * $scale, 37 * $scale),
    [System.Drawing.PointF]::new(39 * $scale, 29 * $scale)
  )
  $torso.AddLines($torsoPoints)
  $graphics.DrawPath($runnerPen, $torso)
  $graphics.DrawLine($runnerPen, 31 * $scale, 37 * $scale, 23 * $scale, 48 * $scale)
  $graphics.DrawLine($runnerPen, 33 * $scale, 37 * $scale, 45 * $scale, 47 * $scale)
  $graphics.DrawLine($runnerPen, 22 * $scale, 32 * $scale, 15 * $scale, 27 * $scale)

  $graphics.Dispose()
  $bgBrush.Dispose()
  $routeBrush.Dispose()
  $routePen.Dispose()
  $runnerPen.Dispose()
  $headBrush.Dispose()
  $rounded.Dispose()
  $torso.Dispose()

  return $bitmap
}

foreach ($entry in @(
  @{ Size = 32; Path = $favicon32Path },
  @{ Size = 180; Path = $appleTouchPath }
)) {
  $bitmap = New-IconBitmap -Size $entry.Size
  $bitmap.Save($entry.Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

function Convert-PngToIco {
  param(
    [string]$PngPath,
    [string]$IcoPath
  )

  [byte[]]$pngBytes = [System.IO.File]::ReadAllBytes($PngPath)
  $pngLength = $pngBytes.Length

  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream)

  $writer.Write([UInt16]0)   # reserved
  $writer.Write([UInt16]1)   # type = icon
  $writer.Write([UInt16]1)   # count
  $writer.Write([byte]32)    # width
  $writer.Write([byte]32)    # height
  $writer.Write([byte]0)     # color count
  $writer.Write([byte]0)     # reserved
  $writer.Write([UInt16]1)   # planes
  $writer.Write([UInt16]32)  # bit count
  $writer.Write([UInt32]$pngLength)
  $writer.Write([UInt32]22)  # header + entry size
  $writer.Write($pngBytes)
  $writer.Flush()

  [System.IO.File]::WriteAllBytes($IcoPath, $stream.ToArray())
  $writer.Dispose()
  $stream.Dispose()
}

Convert-PngToIco -PngPath $favicon32Path -IcoPath $faviconIcoPath

Write-Output "Built favicon assets from $svgPath"
