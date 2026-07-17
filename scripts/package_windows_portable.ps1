param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,

    [Parameter(Mandatory = $true)]
    [string]$Output
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$temporaryRoot = $null
$archive = $null

try {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
        throw "Portable executable does not exist or is not a file: $Executable"
    }

    $executableItem = Get-Item -LiteralPath $Executable
    if ($executableItem.Name -cne "Image Tools.exe") {
        throw "Portable input filename must be exactly 'Image Tools.exe'."
    }

    $resolvedExecutable = $executableItem.FullName
    $resolvedOutput = [System.IO.Path]::GetFullPath($Output)
    if ([System.IO.Path]::GetExtension($resolvedOutput) -cne ".zip") {
        throw "Portable output must have the .zip extension: $Output"
    }
    if ([string]::Equals($resolvedExecutable, $resolvedOutput, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Portable output cannot overwrite the input executable."
    }
    $outputParent = Split-Path -Parent $resolvedOutput
    if ([string]::IsNullOrWhiteSpace($outputParent)) {
        throw "Portable output must have a parent directory: $Output"
    }

    [System.IO.Directory]::CreateDirectory($outputParent) | Out-Null
    $temporaryRoot = Join-Path $outputParent (".image-tools-portable-" + [guid]::NewGuid().ToString("N"))
    $stagingDirectory = Join-Path $temporaryRoot "payload"
    $temporaryZip = Join-Path $temporaryRoot "portable.zip"
    [System.IO.Directory]::CreateDirectory($stagingDirectory) | Out-Null

    $stagedExecutable = Join-Path $stagingDirectory "Image Tools.exe"
    Copy-Item -LiteralPath $resolvedExecutable -Destination $stagedExecutable
    Compress-Archive -LiteralPath $stagedExecutable -DestinationPath $temporaryZip -CompressionLevel Optimal

    $archive = [System.IO.Compression.ZipFile]::OpenRead($temporaryZip)
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    $expectedEntries = @("Image Tools.exe")
    if (
        $entryNames.Count -ne $expectedEntries.Count -or
        $entryNames[0] -cne $expectedEntries[0]
    ) {
        throw "Portable ZIP must contain exactly one entry named 'Image Tools.exe'; found: $($entryNames -join ', ')."
    }

    $archive.Dispose()
    $archive = $null

    [System.IO.File]::Move($temporaryZip, $resolvedOutput, $true)
    Write-Host "Created verified portable archive: $resolvedOutput"
}
finally {
    if ($null -ne $archive) {
        $archive.Dispose()
    }
    if ($null -ne $temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
