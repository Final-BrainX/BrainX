$TotalErrors = 0

function Print-Line {
    Write-Host "=====================================" -ForegroundColor Cyan
}

function Get-EnvKeys {
    param (
        [string]$FilePath
    )

    $keys = @()

    Get-Content $FilePath | ForEach-Object {
        $line = $_.Trim()

        if ([string]::IsNullOrWhiteSpace($line)) {
            return
        }

        if ($line.StartsWith("#")) {
            return
        }

        $commentIndex = $line.IndexOf("#")
        if ($commentIndex -ge 0) {
            $line = $line.Substring(0, $commentIndex).Trim()
        }

        if ([string]::IsNullOrWhiteSpace($line)) {
            return
        }

        if ($line -notmatch "=") {
            return
        }

        $key = $line.Split("=", 2)[0].Trim()

        if (-not [string]::IsNullOrWhiteSpace($key)) {
            $keys += $key
        }
    }

    return $keys
}

function Check-Pair {
    param (
        [string]$ExampleFile,
        [string]$RealFile
    )

    $fileErrors = 0

    Write-Host ""
    Write-Host "[CHECK]" -ForegroundColor Blue
    Write-Host "   example : $ExampleFile" -ForegroundColor Cyan
    Write-Host "   real    : $RealFile" -ForegroundColor Cyan

    if (!(Test-Path $ExampleFile)) {
        Write-Host "[ERROR] example file not found" -ForegroundColor Red
        $script:TotalErrors += 1
        return
    }

    if (!(Test-Path $RealFile)) {
        Write-Host "[ERROR] env file not found" -ForegroundColor Red
        Write-Host "Create required: $RealFile" -ForegroundColor Yellow
        $script:TotalErrors += 1
        return
    }

    $exampleKeys = Get-EnvKeys -FilePath $ExampleFile
    $realKeys = Get-EnvKeys -FilePath $RealFile

    foreach ($key in $exampleKeys) {
        if ($realKeys -notcontains $key) {
            Write-Host "[MISSING] " -NoNewline -ForegroundColor Red
            Write-Host $key -ForegroundColor Yellow
            $fileErrors += 1
        }
    }

    if ($fileErrors -eq 0) {
        Write-Host "[OK]" -ForegroundColor Green
    }
    else {
        Write-Host "[NEED UPDATE] $RealFile / missing $fileErrors" -ForegroundColor Red
        $script:TotalErrors += $fileErrors
    }
}

Print-Line
Write-Host " BrainX ENV check start" -ForegroundColor White
Print-Line

Check-Pair `
    -ExampleFile "brainx-next/.env.example" `
    -RealFile "brainx-next/.env.local"

Check-Pair `
    -ExampleFile "brainX_back/.env.example" `
    -RealFile "brainX_back/.env"

Get-ChildItem "brainX_back/env/*.env.example" | ForEach-Object {
    $exampleFile = $_.FullName
    $realFile = $exampleFile -replace "\.example$", ""

    Check-Pair `
        -ExampleFile $exampleFile `
        -RealFile $realFile
}

Get-ChildItem "brainX_back/env/*.env" | ForEach-Object {
    if ($_.Name.EndsWith(".env.example")) {
        return
    }

    $envFile = $_.FullName
    $exampleFile = "$envFile.example"

    if (!(Test-Path $exampleFile)) {
        Write-Host ""
        Write-Host "[CHECK]" -ForegroundColor Blue
        Write-Host "   env     : $envFile" -ForegroundColor Cyan
        Write-Host "   example : $exampleFile" -ForegroundColor Cyan
        Write-Host "[ERROR] matching example file not found" -ForegroundColor Red
        $script:TotalErrors += 1
    }
}

Write-Host ""
Print-Line

if ($TotalErrors -eq 0) {
    Write-Host "[SUCCESS] All environment variables are valid" -ForegroundColor Green
    Print-Line
    exit 0
}
else {
    Write-Host "[FAILED] Environment variable check failed" -ForegroundColor Red
    Write-Host "Total issues: $TotalErrors" -ForegroundColor Yellow
    Write-Host "Add the missing variables shown above to each env file." -ForegroundColor Yellow
    Print-Line
    exit 1
}