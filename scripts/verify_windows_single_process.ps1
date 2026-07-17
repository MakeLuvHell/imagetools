param(
    [Parameter(Mandatory = $true)]
    [string]$Msi,

    [Parameter(Mandatory = $true)]
    [string]$PortableZip
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Resolve-RequiredFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Description does not exist or is not a file: $Path"
    }
    return (Get-Item -LiteralPath $Path).FullName
}

function Invoke-MsiExec {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [Parameter(Mandatory = $true)]
        [string]$Operation
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = Join-Path $env:SystemRoot "System32\msiexec.exe"
    $startInfo.UseShellExecute = $false
    foreach ($argument in $Arguments) {
        $startInfo.ArgumentList.Add($argument)
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Unable to start msiexec.exe for $Operation."
    }
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    $process.Dispose()

    if ($exitCode -notin @(0, 3010)) {
        throw "msiexec.exe failed during $Operation with exit code $exitCode."
    }
}

function Get-UninstallEntries {
    $registryPaths = @(
        "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "Registry::HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "Registry::HKEY_CURRENT_USER\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($registryPath in $registryPaths) {
        foreach ($entry in @(Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue)) {
            $displayNameProperty = $entry.PSObject.Properties["DisplayName"]
            if ($null -eq $displayNameProperty -or $displayNameProperty.Value -cne "Image Tools") {
                continue
            }

            $installLocationProperty = $entry.PSObject.Properties["InstallLocation"]
            $displayIconProperty = $entry.PSObject.Properties["DisplayIcon"]
            [pscustomobject]@{
                DisplayName = [string]$displayNameProperty.Value
                InstallLocation = if ($null -eq $installLocationProperty) { $null } else { [string]$installLocationProperty.Value }
                DisplayIcon = if ($null -eq $displayIconProperty) { $null } else { [string]$displayIconProperty.Value }
                RegistryPath = [string]$entry.PSPath
            }
        }
    }
}

function Get-DisplayIconPath {
    param([AllowNull()][string]$DisplayIcon)

    if ([string]::IsNullOrWhiteSpace($DisplayIcon)) {
        return $null
    }

    $value = $DisplayIcon.Trim()
    if ($value -match '^"([^"]+)"(?:,\s*-?\d+)?$') {
        return $Matches[1]
    }
    return ($value -replace ',\s*-?\d+$', '')
}

function Resolve-InstalledExecutable {
    param([Parameter(Mandatory = $true)][object]$Entry)

    $candidates = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($Entry.InstallLocation)) {
        $candidates.Add((Join-Path $Entry.InstallLocation "Image Tools.exe"))
    }
    $displayIconPath = Get-DisplayIconPath -DisplayIcon $Entry.DisplayIcon
    if (-not [string]::IsNullOrWhiteSpace($displayIconPath)) {
        $candidates.Add($displayIconPath)
    }

    $existing = @(
        $candidates |
            ForEach-Object {
                if (Test-Path -LiteralPath $_ -PathType Leaf) {
                    Get-Item -LiteralPath $_
                }
            } |
            Where-Object { $_.Name -ceq "Image Tools.exe" } |
            Select-Object -ExpandProperty FullName -Unique
    )
    if ($existing.Count -ne 1) {
        throw "Unable to resolve exactly one installed 'Image Tools.exe' from InstallLocation or DisplayIcon in $($Entry.RegistryPath)."
    }
    return $existing[0]
}

function Get-ProcessesAtPath {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath)

    $comparisonPath = [System.IO.Path]::GetFullPath($ExecutablePath)
    return @(
        Get-CimInstance -ClassName Win32_Process -Filter "Name = 'Image Tools.exe'" |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace($_.ExecutablePath) -and
                [string]::Equals(
                    [System.IO.Path]::GetFullPath($_.ExecutablePath),
                    $comparisonPath,
                    [System.StringComparison]::OrdinalIgnoreCase
                )
            }
    )
}

function Wait-ForMainWindow {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            throw "$Label exited before opening its main window."
        }
        $process.Refresh()
        if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
            return $process
        }
        Start-Sleep -Milliseconds 200
    }
    throw "$Label did not open a main window within 30 seconds."
}

function Assert-NoNewBackendProcesses {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$BaselineProcessIds)

    $newBackendProcesses = @(
        Get-Process -Name "imagetools-backend" -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -notin $BaselineProcessIds }
    )
    if ($newBackendProcesses.Count -ne 0) {
        throw "Image Tools started an unexpected imagetools-backend process: $($newBackendProcesses.Id -join ', ')."
    }
}

function Assert-NoListeningTcpSocket {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $netTcpCommand = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($null -ne $netTcpCommand) {
        try {
            $listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $ProcessId -ErrorAction Stop)
        }
        catch {
            Write-Verbose "Get-NetTCPConnection could not complete; falling back to netstat: $($_.Exception.Message)"
            $listeners = $null
        }
        if ($null -ne $listeners) {
            if ($listeners.Count -ne 0) {
                throw "$Label process $ProcessId owns a listening TCP socket."
            }
            return
        }
    }

    $netstatOutput = @(& netstat.exe -ano -p tcp)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect listening TCP sockets with Get-NetTCPConnection or netstat."
    }
    foreach ($line in $netstatOutput) {
        if ($line -match '^\s*TCP\s+\S+\s+\S+\s+LISTENING\s+(\d+)\s*$' -and [int]$Matches[1] -eq $ProcessId) {
            throw "$Label process $ProcessId owns a listening TCP socket."
        }
    }
}

function Wait-ForExecutableExit {
    param(
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (@(Get-ProcessesAtPath -ExecutablePath $ExecutablePath).Count -eq 0) {
            return
        }
        Start-Sleep -Milliseconds 200
    }
    $remaining = @(Get-ProcessesAtPath -ExecutablePath $ExecutablePath)
    throw "$Label left Image Tools process IDs running after $TimeoutSeconds seconds: $($remaining.ProcessId -join ', ')."
}

function Stop-TestProcess {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$ExecutablePath
    )

    $process = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (
        $null -ne $process -and
        -not [string]::IsNullOrWhiteSpace($process.ExecutablePath) -and
        [string]::Equals(
            [System.IO.Path]::GetFullPath($process.ExecutablePath),
            [System.IO.Path]::GetFullPath($ExecutablePath),
            [System.StringComparison]::OrdinalIgnoreCase
        )
    ) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Test-AppRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][string]$DataDirectory,
        [Parameter(Mandatory = $true)][string]$ConfigDirectory,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$BackendBaseline,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$StartedProcesses
    )

    if (@(Get-ProcessesAtPath -ExecutablePath $ExecutablePath).Count -ne 0) {
        throw "$Label executable is already running; refusing to interact with a pre-existing process: $ExecutablePath"
    }

    [System.IO.Directory]::CreateDirectory($DataDirectory) | Out-Null
    [System.IO.Directory]::CreateDirectory($ConfigDirectory) | Out-Null
    [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_DATA_DIR", $DataDirectory, "Process")
    [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_CONFIG_DIR", $ConfigDirectory, "Process")

    $started = Start-Process -FilePath $ExecutablePath -PassThru
    $StartedProcesses.Add([pscustomobject]@{ ProcessId = $started.Id; ExecutablePath = $ExecutablePath }) | Out-Null
    $windowProcess = Wait-ForMainWindow -ProcessId $started.Id -Label $Label

    $matchingProcesses = @(Get-ProcessesAtPath -ExecutablePath $ExecutablePath)
    if ($matchingProcesses.Count -ne 1 -or $matchingProcesses[0].ProcessId -ne $started.Id) {
        throw "$Label must have exactly one Image Tools.exe process at its full path; found IDs: $($matchingProcesses.ProcessId -join ', ')."
    }
    Assert-NoNewBackendProcesses -BaselineProcessIds $BackendBaseline
    Assert-NoListeningTcpSocket -ProcessId $started.Id -Label $Label

    if (-not $windowProcess.CloseMainWindow()) {
        throw "$Label main window did not accept a close request."
    }
    Wait-ForExecutableExit -ExecutablePath $ExecutablePath -TimeoutSeconds 10 -Label $Label
}

$resolvedMsi = $null
$resolvedPortableZip = $null
$temporaryRoot = $null
$installedExecutable = $null
$installedProduct = $false
$startedProcesses = [System.Collections.Generic.List[object]]::new()
$originalDataDirectory = [System.Environment]::GetEnvironmentVariable("IMAGE_TOOLS_DATA_DIR", "Process")
$originalConfigDirectory = [System.Environment]::GetEnvironmentVariable("IMAGE_TOOLS_CONFIG_DIR", "Process")

try {
    $resolvedMsi = Resolve-RequiredFile -Path $Msi -Description "MSI"
    $resolvedPortableZip = Resolve-RequiredFile -Path $PortableZip -Description "Portable ZIP"
    if ([System.IO.Path]::GetExtension($resolvedMsi) -cne ".msi") {
        throw "MSI input must have the .msi extension: $resolvedMsi"
    }
    if ([System.IO.Path]::GetExtension($resolvedPortableZip) -cne ".zip") {
        throw "Portable input must have the .zip extension: $resolvedPortableZip"
    }

    $preExistingEntries = @(Get-UninstallEntries)
    if ($preExistingEntries.Count -ne 0) {
        throw "An Image Tools installation already exists; refusing to modify pre-existing user state."
    }

    $backendBaseline = @(Get-Process -Name "imagetools-backend" -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    if ($backendBaseline.Count -ne 0) {
        throw "An imagetools-backend process already exists; the single-process assertion cannot be established safely."
    }
    $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("image-tools-windows-verification-" + [guid]::NewGuid().ToString("N"))
    $portableRoot = Join-Path $temporaryRoot "portable"
    $administrativeRoot = Join-Path $temporaryRoot "msi-administrative"
    [System.IO.Directory]::CreateDirectory($portableRoot) | Out-Null
    [System.IO.Directory]::CreateDirectory($administrativeRoot) | Out-Null

    $portableArchive = [System.IO.Compression.ZipFile]::OpenRead($resolvedPortableZip)
    try {
        $portableEntries = @($portableArchive.Entries | ForEach-Object { $_.FullName })
        if ($portableEntries.Count -ne 1 -or $portableEntries[0] -cne "Image Tools.exe") {
            throw "Portable ZIP entries must be exactly @('Image Tools.exe'); found: $($portableEntries -join ', ')."
        }
    }
    finally {
        $portableArchive.Dispose()
    }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($resolvedPortableZip, $portableRoot)
    $portableExecutable = Join-Path $portableRoot "Image Tools.exe"
    if (-not (Test-Path -LiteralPath $portableExecutable -PathType Leaf)) {
        throw "Portable ZIP did not extract Image Tools.exe."
    }

    Invoke-MsiExec -Operation "administrative extraction" -Arguments @(
        "/a",
        $resolvedMsi,
        "/qn",
        "/norestart",
        "TARGETDIR=$administrativeRoot"
    )
    $administrativeExecutables = @(Get-ChildItem -LiteralPath $administrativeRoot -Recurse -File -Filter "*.exe")
    if ($administrativeExecutables.Count -ne 1 -or $administrativeExecutables[0].Name -cne "Image Tools.exe") {
        throw "MSI administrative payload must contain exactly one executable named 'Image Tools.exe'; found: $($administrativeExecutables.FullName -join ', ')."
    }
    $forbiddenPayload = @(
        Get-ChildItem -LiteralPath $administrativeRoot -Recurse -File |
            Where-Object { $_.FullName -match '(?i)(imagetools-backend|python)' }
    )
    if ($forbiddenPayload.Count -ne 0) {
        throw "MSI payload contains forbidden backend or Python files: $($forbiddenPayload.FullName -join ', ')."
    }

    Invoke-MsiExec -Operation "silent installation" -Arguments @(
        "/i",
        $resolvedMsi,
        "/qn",
        "/norestart"
    )
    $installedProduct = $true

    $registryDeadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $installedEntries = @(Get-UninstallEntries)
        if ($installedEntries.Count -eq 1) {
            break
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $registryDeadline)
    if ($installedEntries.Count -ne 1) {
        throw "Expected exactly one Image Tools uninstall registry record after installation; found $($installedEntries.Count)."
    }
    $installedExecutable = Resolve-InstalledExecutable -Entry $installedEntries[0]

    Test-AppRuntime `
        -Label "Installed Image Tools" `
        -ExecutablePath $installedExecutable `
        -DataDirectory (Join-Path $temporaryRoot "installed-data") `
        -ConfigDirectory (Join-Path $temporaryRoot "installed-config") `
        -BackendBaseline $backendBaseline `
        -StartedProcesses $startedProcesses

    Test-AppRuntime `
        -Label "Portable Image Tools" `
        -ExecutablePath $portableExecutable `
        -DataDirectory (Join-Path $temporaryRoot "portable-data") `
        -ConfigDirectory (Join-Path $temporaryRoot "portable-config") `
        -BackendBaseline $backendBaseline `
        -StartedProcesses $startedProcesses

    Write-Host "Windows MSI and portable single-process verification passed."
}
finally {
    try {
        foreach ($startedProcess in $startedProcesses) {
            Stop-TestProcess -ProcessId $startedProcess.ProcessId -ExecutablePath $startedProcess.ExecutablePath
        }

        if ($installedProduct -and $null -ne $resolvedMsi) {
            Invoke-MsiExec -Operation "silent uninstallation" -Arguments @(
                "/x",
                $resolvedMsi,
                "/qn",
                "/norestart"
            )
            $uninstallDeadline = [DateTime]::UtcNow.AddSeconds(10)
            do {
                $installedExecutableExists = $null -ne $installedExecutable -and (Test-Path -LiteralPath $installedExecutable)
                $installedRegistryEntries = @(Get-UninstallEntries)
                if (-not $installedExecutableExists -and $installedRegistryEntries.Count -eq 0) {
                    break
                }
                Start-Sleep -Milliseconds 200
            } while ([DateTime]::UtcNow -lt $uninstallDeadline)

            if ($null -ne $installedExecutable -and (Test-Path -LiteralPath $installedExecutable)) {
                throw "Silent uninstall left the installed executable behind: $installedExecutable"
            }
            $remainingInstalledEntries = @(Get-UninstallEntries)
            if ($remainingInstalledEntries.Count -ne 0) {
                throw "Silent uninstall left Image Tools uninstall registry records behind."
            }
        }
    }
    finally {
        [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_DATA_DIR", $originalDataDirectory, "Process")
        [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_CONFIG_DIR", $originalConfigDirectory, "Process")
        if ($null -ne $temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
            Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
        }
    }
}
