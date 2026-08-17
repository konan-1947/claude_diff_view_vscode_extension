# simulate_cli_edit.ps1
#
# Giả lập một AI CLI ghi đè file bằng line ending LF (nhiều CLI làm vậy trên Windows),
# trong khi file gốc trên đĩa đang là CRLF (trạng thái sau git checkout với autocrlf=true).
#
# Dùng để tái hiện bug #15: sửa 1 dòng nhưng diff view tô đỏ/xanh cả file.
#
#   Dùng:  powershell -File code_to_test\simulate_cli_edit.ps1            # ghi LF  (kỳ vọng: diff SAI, cả file)
#          powershell -File code_to_test\simulate_cli_edit.ps1 -Eol crlf  # ghi CRLF (kỳ vọng: diff ĐÚNG, 1 hunk)
#          powershell -File code_to_test\simulate_cli_edit.ps1 -Reset     # trả file về CRLF nguyên bản

param(
  [ValidateSet('lf', 'crlf')]
  [string]$Eol = 'lf',
  [switch]$Reset
)

$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot 'long_sample_crlf.js'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$text = [IO.File]::ReadAllText($target)
$lf = $text -replace "`r`n", "`n"
$lines = [System.Collections.ArrayList]@($lf -split "`n")

if ($Reset) {
  # Gỡ các dòng đã chèn, trả MAX_RETRIES về 3, ghi lại bằng CRLF
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '^const (JITTER_MS|MAX_QUEUE|VERBOSE) =') { $lines.RemoveAt($i) }
  }
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^const MAX_RETRIES') { $lines[$i] = 'const MAX_RETRIES = 3;' }
  }
  [IO.File]::WriteAllText($target, (($lines -join "`n") -replace "`n", "`r`n"), $utf8NoBom)
  Write-Host "Reset xong -> CRLF, MAX_RETRIES = 3"
  exit 0
}

# --- Sửa nhỏ: đổi 1 dòng, thêm 3 dòng (giống mức thay đổi mà AI CLI báo cáo) ---
$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^const MAX_RETRIES') { $idx = $i; break }
}
if ($idx -lt 0) { throw "Khong tim thay dong 'const MAX_RETRIES' trong $target" }

$current = [int]($lines[$idx] -replace '\D', '')
$next = $current + 1
$lines[$idx] = "const MAX_RETRIES = $next;"
if ($lines[$idx + 1] -notmatch '^const JITTER_MS') {
  $lines.InsertRange($idx + 1, [string[]]@(
    'const JITTER_MS = 40;',
    'const MAX_QUEUE = 128;',
    'const VERBOSE = false;'
  ))
}

$joined = if ($Eol -eq 'crlf') { ($lines -join "`n") -replace "`n", "`r`n" } else { $lines -join "`n" }
[IO.File]::WriteAllText($target, $joined, $utf8NoBom)

# --- Báo cáo kiểu AI CLI ---
$bytes = [IO.File]::ReadAllBytes($target)
$lfCount = 0; $crlfCount = 0
for ($i = 0; $i -lt $bytes.Length; $i++) {
  if ($bytes[$i] -eq 10) { $lfCount++; if ($i -gt 0 -and $bytes[$i - 1] -eq 13) { $crlfCount++ } }
}
$eolLabel = if ($crlfCount -eq $lfCount) { 'CRLF' } elseif ($crlfCount -eq 0) { 'LF' } else { 'MIXED' }

Write-Host ""
Write-Host "Update(code_to_test/long_sample_crlf.js)"
Write-Host "  Added 3 lines, removed 0 lines  (MAX_RETRIES: $current -> $next)"
Write-Host "  EOL tren dia sau khi ghi: $eolLabel   (tong dong = $lfCount)"
Write-Host ""
Write-Host "Bay gio nhin sang tab diff cua file nay."
if ($eolLabel -eq 'LF') {
  Write-Host "Ky vong bug #15: CA FILE bi to do/xanh thay vi chi 1 hunk."
} else {
  Write-Host "Ky vong: chi 1 hunk nho quanh dong MAX_RETRIES."
}
