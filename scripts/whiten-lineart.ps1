$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Convert-LineartToWhite {
  param([string]$InputPath, [string]$OutputPath, [int]$Threshold = 35)

  $bmp = [System.Drawing.Bitmap]::FromFile($InputPath)
  try {
    for ($y = 0; $y -lt $bmp.Height; $y++) {
      for ($x = 0; $x -lt $bmp.Width; $x++) {
        $c = $bmp.GetPixel($x, $y)
        $L = 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B
        if ($L -gt $Threshold) {
          $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 255, 255, 255))
        }
        else {
          $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, 0, 0, 0))
        }
      }
    }
    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $bmp.Dispose()
  }
}

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  $root = $PSScriptRoot + '\..'
}

$base = (Resolve-Path (Join-Path $root '.')).Path
$inputs = @(
  (Join-Path $base 'meo_diff (2).png'),
  (Join-Path $base 'meo_ngu (2).png')
)

foreach ($p in $inputs) {
  if (-not (Test-Path $p)) {
    Write-Error "Missing file: $p"
  }
  $out = $p -replace ' \(2\)\.png$', '_white.png'
  Convert-LineartToWhite -InputPath $p -OutputPath $out
  Write-Host "Wrote $out"
}
