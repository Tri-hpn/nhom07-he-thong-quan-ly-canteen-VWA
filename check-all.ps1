# =====================================================================
# CHECK-ALL.PS1 - Kiem tra toan dien du an Frontend Vite + React
# Khong dau tieng Viet de tranh loi encoding
# =====================================================================

$ErrorActionPreference = "Continue"
$root = "E:\canteengo1\canteengo1\Canteengo"
Set-Location $root

$report = "check-report.txt"
"==================================================" | Out-File $report -Encoding UTF8
"  BAO CAO KIEM TRA DU AN - $(Get-Date)" | Out-File $report -Append -Encoding UTF8
"==================================================" | Out-File $report -Append -Encoding UTF8

function Log($msg, $color = "White") {
    Write-Host $msg -ForegroundColor $color
    $msg | Out-File $report -Append -Encoding UTF8
}

# ---------- 1. LIET KE TOAN BO FILE ----------
Log "`n[1] DANH SACH TOAN BO FILE (bo node_modules, .git, dist)" "Cyan"
$allFiles = Get-ChildItem -Recurse -File | Where-Object {
    $_.FullName -notmatch 'node_modules|\\\.git\\|\\dist\\|\\build\\|\.log$'
}
Log "Tong so file: $($allFiles.Count)"
$allFiles | ForEach-Object { $_.FullName.Replace("$root\", "") } | Out-File $report -Append -Encoding UTF8

# ---------- 2. THONG KE THEO LOAI ----------
Log "`n[2] THONG KE FILE THEO LOAI" "Cyan"
$allFiles | Group-Object Extension | Sort-Object Count -Descending | ForEach-Object {
    Log ("  {0,-10} : {1}" -f $_.Name, $_.Count)
}

# ---------- 3. KIEM TRA CU PHAP ----------
Log "`n[3] KIEM TRA CU PHAP TOAN BO FILE CODE" "Cyan"
$codeFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx,*.ts,*.tsx | Where-Object {
    $_.FullName -notmatch 'node_modules|\\dist\\|\\build\\'
}
Log "So file code can kiem tra: $($codeFiles.Count)"

$eslintCheck = Test-Path "node_modules\.bin\eslint.cmd"
if ($eslintCheck) {
    Log "`n--- ESLint toan du an ---" "Yellow"
    $eslintOut = npx eslint . --ext .js,.jsx,.ts,.tsx 2>&1
    if ($LASTEXITCODE -eq 0) {
        Log "[OK] ESLint: KHONG CO LOI" "Green"
    } else {
        Log "[FAIL] ESLint: CO LOI" "Red"
        $eslintOut | Out-File $report -Append -Encoding UTF8
        $eslintOut | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    }
} else {
    Log "[SKIP] ESLint chua cai" "Yellow"
}

if (Test-Path "tsconfig.json") {
    Log "`n--- TypeScript check ---" "Yellow"
    $tscOut = npx tsc --noEmit 2>&1
    if ($LASTEXITCODE -eq 0) {
        Log "[OK] TypeScript: KHONG CO LOI" "Green"
    } else {
        Log "[FAIL] TypeScript: CO LOI" "Red"
        $tscOut | Out-File $report -Append -Encoding UTF8
        $tscOut | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    }
}

# ---------- 4. TIM IMPORT SAI ----------
Log "`n[4] KIEM TRA IMPORT SAI" "Cyan"
$importErrors = @()
foreach ($f in $codeFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $mList = [regex]::Matches($content, 'from\s+[''"](\.[^''"]+)[''"]')
    foreach ($m in $mList) {
        $importPath = $m.Groups[1].Value
        $dir = Split-Path $f.FullName -Parent
        $fullImport = [System.IO.Path]::GetFullPath((Join-Path $dir $importPath))
        $found = $false
        foreach ($ext in @("", ".js", ".jsx", ".ts", ".tsx", ".json", ".css", ".scss", "\index.js", "\index.jsx", "\index.ts", "\index.tsx")) {
            if (Test-Path "$fullImport$ext") { $found = $true; break }
        }
        if (-not $found) {
            $msg = "[X] $($f.Name) : import '$importPath' KHONG TIM THAY"
            $importErrors += $msg
            Log $msg "Red"
        }
    }
}
if ($importErrors.Count -eq 0) { Log "[OK] Khong phat hien import sai" "Green" }

# ---------- 5. TIM FILE THIEU EXPORT ----------
Log "`n[5] TIM FILE THIEU EXPORT" "Cyan"
$noExport = @()
foreach ($f in $codeFiles) {
    if ($f.Name -match '^(main|index|vite\.config|eslint|.*\.config)') { continue }
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -and $content -notmatch '\bexport\b') {
        $msg = "[!] $($f.FullName.Replace($root+'\','')) : KHONG CO EXPORT"
        $noExport += $msg
        Log $msg "Yellow"
    }
}
if ($noExport.Count -eq 0) { Log "[OK] Tat ca file deu co export" "Green" }

# ---------- 6. TIM NGOAC LECH ----------
Log "`n[6] KIEM TRA NGOAC LECH" "Cyan"
$bracketErrors = @()
foreach ($f in $codeFiles) {
    $c = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $c) { continue }
    $openC = ([regex]::Matches($c, '\{')).Count
    $closeC = ([regex]::Matches($c, '\}')).Count
    $openP = ([regex]::Matches($c, '\(')).Count
    $closeP = ([regex]::Matches($c, '\)')).Count
    if ($openC -ne $closeC -or $openP -ne $closeP) {
        $msg = "[!] $($f.FullName.Replace($root+'\','')) : {} = $openC/$closeC , () = $openP/$closeP"
        $bracketErrors += $msg
        Log $msg "Yellow"
    }
}
if ($bracketErrors.Count -eq 0) { Log "[OK] Khong co ngoac lech" "Green" }

# ---------- 7. XOA CACHE VITE ----------
Log "`n[7] XOA CACHE VITE" "Cyan"
if (Test-Path "node_modules\.vite") {
    Remove-Item -Recurse -Force "node_modules\.vite"
    Log "[OK] Da xoa node_modules\.vite" "Green"
} else {
    Log "[INFO] Khong co cache Vite" "Gray"
}

# ---------- 8. CHAY DEV SERVER VA BAT LOI ----------
Log "`n[8] CHAY DEV SERVER (BAT LOI TRANSFORM)" "Cyan"
Log "Dang chay npm run dev trong 20 giay de bat loi..." "Yellow"

$devLog = "dev-error.log"
if (Test-Path $devLog) { Remove-Item $devLog }

$job = Start-Job -ScriptBlock {
    Set-Location "E:\canteengo1\canteengo1\Canteengo"
    npm run dev 2>&1
}

$timeout = 20
$elapsed = 0
while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 1
    $elapsed++
    $output = Receive-Job $job
    if ($output -match 'error|Error|SyntaxError|Failed') { break }
}

$output = Receive-Job $job
Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job -Force -ErrorAction SilentlyContinue

$output | Out-File $devLog -Encoding UTF8

$errorLines = $output | Select-String -Pattern "error|Error|SyntaxError|Failed|Cannot|Unexpected"
if ($errorLines) {
    Log "`n[FAIL] PHAT HIEN LOI KHI CHAY DEV SERVER:" "Red"
    $errorLines | ForEach-Object { Log "  $_" "Red" }
} else {
    Log "`n[OK] Dev server khoi dong OK" "Green"
}

# ---------- 9. TOM TAT ----------
Log "`n==================================================" "Cyan"
Log "  TOM TAT KET QUA" "Cyan"
Log "==================================================" "Cyan"
Log "Tong file         : $($allFiles.Count)"
Log "File code         : $($codeFiles.Count)"
Log "Import sai        : $($importErrors.Count)"
Log "File thieu export : $($noExport.Count)"
Log "Ngoac lech        : $($bracketErrors.Count)"
Log "Log dev server    : $devLog"
Log "Bao cao day du    : $report"

Log "`n>> Mo file '$devLog' va '$report' de xem chi tiet loi." "Yellow"