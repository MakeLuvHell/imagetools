param(
    [Parameter(Mandatory = $true)]
    [string]$OldMsi,

    [Parameter(Mandatory = $true)]
    [string]$NewMsi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RequiredFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Description does not exist or is not a file: $Path"
    }
    return (Get-Item -LiteralPath $Path).FullName
}

function Invoke-MsiExec {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Operation,
        [switch]$AllowAbsentProduct
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

    $allowedExitCodes = [System.Collections.Generic.List[int]]::new()
    $allowedExitCodes.Add(0)
    $allowedExitCodes.Add(3010)
    if ($AllowAbsentProduct) {
        $allowedExitCodes.Add(1605)
    }
    if ($exitCode -notin $allowedExitCodes) {
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
            $displayName = $entry.PSObject.Properties["DisplayName"]
            if ($null -eq $displayName -or $displayName.Value -cne "Image Tools") {
                continue
            }
            $installLocation = $entry.PSObject.Properties["InstallLocation"]
            $displayIcon = $entry.PSObject.Properties["DisplayIcon"]
            $displayVersion = $entry.PSObject.Properties["DisplayVersion"]
            [pscustomobject]@{
                DisplayName = [string]$displayName.Value
                DisplayVersion = if ($null -eq $displayVersion) { "" } else { [string]$displayVersion.Value }
                InstallLocation = if ($null -eq $installLocation) { "" } else { [string]$installLocation.Value }
                DisplayIcon = if ($null -eq $displayIcon) { "" } else { [string]$displayIcon.Value }
                RegistryPath = [string]$entry.PSPath
            }
        }
    }
}

function Get-DisplayIconPath {
    param([AllowEmptyString()][string]$DisplayIcon)

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
    param(
        [Parameter(Mandatory = $true)][object]$Entry,
        [string[]]$ExpectedNames = @("Image Tools.exe")
    )

    $candidates = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($Entry.InstallLocation)) {
        foreach ($expectedName in $ExpectedNames) {
            $candidates.Add((Join-Path $Entry.InstallLocation $expectedName))
        }
    }
    $displayIconPath = Get-DisplayIconPath -DisplayIcon $Entry.DisplayIcon
    if (-not [string]::IsNullOrWhiteSpace($displayIconPath)) {
        $candidates.Add($displayIconPath)
    }

    $existing = @(
        $candidates |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            ForEach-Object { (Get-Item -LiteralPath $_).FullName } |
            Where-Object { $ExpectedNames -ccontains (Split-Path -Leaf $_) } |
            Select-Object -Unique
    )
    if ($existing.Count -ne 1) {
        throw "Unable to resolve exactly one expected Image Tools executable from InstallLocation or DisplayIcon."
    }
    return $existing[0]
}

function Wait-ForInstalledVersion {
    param([Parameter(Mandatory = $true)][string]$ExpectedVersion)

    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        $entries = @(Get-UninstallEntries)
        if ($entries.Count -eq 1 -and $entries[0].DisplayVersion -ceq $ExpectedVersion) {
            return $entries[0]
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Expected exactly one Image Tools $ExpectedVersion uninstall registry entry."
}

function Wait-ForNoInstallation {
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        if (@(Get-UninstallEntries).Count -eq 0) {
            return
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Image Tools uninstall registry entries remain after uninstall."
}

function Get-ProcessesAtPath {
    param([Parameter(Mandatory = $true)][string]$ExecutablePath)

    $comparisonPath = [System.IO.Path]::GetFullPath($ExecutablePath)
    $processName = (Split-Path -Leaf $comparisonPath).Replace("'", "''")
    return @(
        Get-CimInstance -ClassName Win32_Process -Filter "Name = '$processName'" -ErrorAction SilentlyContinue |
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

function Test-PathWithinDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Directory
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd('\') + '\'
    return $fullPath.StartsWith($fullDirectory, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-TestBackendProcesses {
    param(
        [Parameter(Mandatory = $true)][string]$InstallDirectory,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$BaselineProcessIds
    )

    return @(
        Get-CimInstance -ClassName Win32_Process -Filter "Name = 'imagetools-backend.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ProcessId -notin $BaselineProcessIds -and
                -not [string]::IsNullOrWhiteSpace($_.ExecutablePath) -and
                (Test-PathWithinDirectory -Path $_.ExecutablePath -Directory $InstallDirectory)
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

function Wait-ForExecutableExit {
    param(
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Get-ProcessesAtPath -ExecutablePath $ExecutablePath).Count -eq 0) {
            return
        }
        Start-Sleep -Milliseconds 200
    }
    throw "$Label left Image Tools.exe running after $TimeoutSeconds seconds."
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

function Invoke-FixtureTool {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("create", "verify")][string]$Operation,
        [Parameter(Mandatory = $true)][string]$Workspace,
        [Parameter(Mandatory = $true)][string]$ScriptPath
    )

    & python $ScriptPath $Operation $Workspace
    if ($LASTEXITCODE -ne 0) {
        throw "Upgrade fixture $Operation failed with exit code $LASTEXITCODE."
    }
}

function Set-LegacyWorkspaceBootstrap {
    param(
        [Parameter(Mandatory = $true)][string]$BootstrapPath,
        [Parameter(Mandatory = $true)][string]$Workspace
    )

    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $BootstrapPath)) | Out-Null
    @{ active_data_dir = [System.IO.Path]::GetFullPath($Workspace) } |
        ConvertTo-Json |
        Set-Content -LiteralPath $BootstrapPath -Encoding utf8NoBOM
}

function Test-AppRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][string]$DataDirectory,
        [Parameter(Mandatory = $true)][string]$ConfigDirectory,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$BackendBaseline,
        [Parameter(Mandatory = $true)][bool]$AllowLegacyBackend,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$StartedProcesses
    )

    $resolvedDataDirectory = [System.IO.Path]::GetFullPath($DataDirectory)
    $resolvedConfigDirectory = [System.IO.Path]::GetFullPath($ConfigDirectory)
    if (-not [System.IO.Path]::IsPathFullyQualified($resolvedDataDirectory) -or
        -not [System.IO.Path]::IsPathFullyQualified($resolvedConfigDirectory)) {
        throw "$Label requires absolute isolated data and config directories."
    }
    if ((Get-ProcessesAtPath -ExecutablePath $ExecutablePath).Count -ne 0) {
        throw "$Label is already running at the test executable path."
    }

    [System.IO.Directory]::CreateDirectory($resolvedDataDirectory) | Out-Null
    [System.IO.Directory]::CreateDirectory($resolvedConfigDirectory) | Out-Null
    [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_DATA_DIR", $resolvedDataDirectory, "Process")
    [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_CONFIG_DIR", $resolvedConfigDirectory, "Process")

    $started = Start-Process -FilePath $ExecutablePath -PassThru
    $StartedProcesses.Add([pscustomobject]@{ ProcessId = $started.Id; ExecutablePath = $ExecutablePath }) | Out-Null
    $windowProcess = Wait-ForMainWindow -ProcessId $started.Id -Label $Label

    $matchingProcesses = Get-ProcessesAtPath -ExecutablePath $ExecutablePath
    if ($matchingProcesses.Count -ne 1 -or $matchingProcesses[0].ProcessId -ne $started.Id) {
        throw "$Label did not keep exactly one Image Tools.exe process at its installed path."
    }

    $installDirectory = Split-Path -Parent $ExecutablePath
    $testBackends = @(Get-TestBackendProcesses -InstallDirectory $installDirectory -BaselineProcessIds $BackendBaseline)
    foreach ($backend in $testBackends) {
        $StartedProcesses.Add([pscustomobject]@{
            ProcessId = [int]$backend.ProcessId
            ExecutablePath = [string]$backend.ExecutablePath
        }) | Out-Null
    }
    if (-not $AllowLegacyBackend -and $testBackends.Count -ne 0) {
        throw "$Label started an unexpected imagetools-backend process."
    }

    if (-not $windowProcess.CloseMainWindow()) {
        throw "$Label main window did not accept a close request."
    }
    Wait-ForExecutableExit -ExecutablePath $ExecutablePath -TimeoutSeconds 10 -Label $Label

    foreach ($backend in $testBackends) {
        Stop-TestProcess -ProcessId $backend.ProcessId -ExecutablePath $backend.ExecutablePath
    }
}

$resolvedOldMsi = $null
$resolvedNewMsi = $null
$temporaryRoot = $null
$legacyDataDirectory = Join-Path $env:APPDATA "com.imagetools.desktop"
$legacyConfigDirectory = Join-Path $env:LOCALAPPDATA "com.imagetools.desktop"
$legacyBootstrapPath = Join-Path $legacyConfigDirectory "storage-location.json"
$fixtureScript = Join-Path $PSScriptRoot "prepare_windows_upgrade_fixture.py"
$startedProcesses = [System.Collections.Generic.List[object]]::new()
$originalDataDirectory = [System.Environment]::GetEnvironmentVariable("IMAGE_TOOLS_DATA_DIR", "Process")
$originalConfigDirectory = [System.Environment]::GetEnvironmentVariable("IMAGE_TOOLS_CONFIG_DIR", "Process")
$legacyStateOwned = $false
$installationStarted = $false

try {
    $resolvedOldMsi = Resolve-RequiredFile -Path $OldMsi -Description "v0.2.3 MSI"
    $resolvedNewMsi = Resolve-RequiredFile -Path $NewMsi -Description "v0.3.0 MSI"
    if ([System.IO.Path]::GetExtension($resolvedOldMsi) -cne ".msi" -or
        [System.IO.Path]::GetExtension($resolvedNewMsi) -cne ".msi") {
        throw "OldMsi and NewMsi must both have the .msi extension."
    }
    if ([string]::Equals($resolvedOldMsi, $resolvedNewMsi, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "OldMsi and NewMsi must be different files."
    }
    if (-not (Test-Path -LiteralPath $fixtureScript -PathType Leaf)) {
        throw "Upgrade fixture tool is missing."
    }

    if (@(Get-UninstallEntries).Count -ne 0) {
        throw "An Image Tools installation already exists; refusing to modify pre-existing state."
    }
    $preExistingAppProcesses = @(
        Get-CimInstance -ClassName Win32_Process -Filter "Name = 'Image Tools.exe'" -ErrorAction SilentlyContinue
    )
    if ($preExistingAppProcesses.Count -ne 0) {
        throw "Image Tools.exe is already running; refusing to interact with it."
    }
    $backendBaseline = @(
        Get-CimInstance -ClassName Win32_Process -Filter "Name = 'imagetools-backend.exe'" -ErrorAction SilentlyContinue |
            ForEach-Object { [int]$_.ProcessId }
    )
    if ($backendBaseline.Count -ne 0) {
        throw "imagetools-backend is already running; test-owned legacy sidecars cannot be identified safely."
    }
    if ((Test-Path -LiteralPath $legacyDataDirectory) -or (Test-Path -LiteralPath $legacyConfigDirectory)) {
        throw "Legacy Image Tools data already exists; use a clean disposable Windows runner."
    }
    $legacyStateOwned = $true

    $temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("image-tools-upgrade-" + [guid]::NewGuid().ToString("N"))
    $fixtureWorkspace = Join-Path $temporaryRoot "fixture-workspace"
    $upgradeWorkspace = Join-Path $temporaryRoot "upgrade-workspace"
    $rollbackWorkspace = Join-Path $temporaryRoot "rollback-workspace"
    [System.IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null

    Invoke-FixtureTool -Operation "create" -Workspace $fixtureWorkspace -ScriptPath $fixtureScript
    Copy-Item -LiteralPath $fixtureWorkspace -Destination $upgradeWorkspace -Recurse
    Invoke-FixtureTool -Operation "verify" -Workspace $upgradeWorkspace -ScriptPath $fixtureScript

    $installationStarted = $true
    Invoke-MsiExec -Operation "v0.2.3 silent installation" -Arguments @(
        "/i", $resolvedOldMsi, "/qn", "/norestart"
    )
    $oldEntry = Wait-ForInstalledVersion -ExpectedVersion "0.2.3"
    $oldExecutable = Resolve-InstalledExecutable `
        -Entry $oldEntry `
        -ExpectedNames @("Image Tools.exe", "imagetools.exe")
    Set-LegacyWorkspaceBootstrap -BootstrapPath $legacyBootstrapPath -Workspace $upgradeWorkspace
    Test-AppRuntime `
        -Label "Image Tools 0.2.3 before upgrade" `
        -ExecutablePath $oldExecutable `
        -DataDirectory $upgradeWorkspace `
        -ConfigDirectory (Join-Path $temporaryRoot "old-config-before-upgrade") `
        -BackendBaseline $backendBaseline `
        -AllowLegacyBackend $true `
        -StartedProcesses $startedProcesses
    Invoke-FixtureTool -Operation "verify" -Workspace $upgradeWorkspace -ScriptPath $fixtureScript

    Invoke-MsiExec -Operation "v0.3.0 in-place upgrade" -Arguments @(
        "/i", $resolvedNewMsi, "/qn", "/norestart"
    )
    $newEntry = Wait-ForInstalledVersion -ExpectedVersion "0.3.0"
    $newExecutable = Resolve-InstalledExecutable -Entry $newEntry
    Test-AppRuntime `
        -Label "Image Tools 0.3.0 after upgrade" `
        -ExecutablePath $newExecutable `
        -DataDirectory $upgradeWorkspace `
        -ConfigDirectory (Join-Path $temporaryRoot "new-config-after-upgrade") `
        -BackendBaseline $backendBaseline `
        -AllowLegacyBackend $false `
        -StartedProcesses $startedProcesses
    Invoke-FixtureTool -Operation "verify" -Workspace $upgradeWorkspace -ScriptPath $fixtureScript
    Copy-Item -LiteralPath $upgradeWorkspace -Destination $rollbackWorkspace -Recurse

    Invoke-MsiExec -Operation "v0.3.0 silent uninstallation" -Arguments @(
        "/x", $resolvedNewMsi, "/qn", "/norestart"
    )
    Wait-ForNoInstallation
    Invoke-MsiExec -Operation "v0.2.3 rollback installation" -Arguments @(
        "/i", $resolvedOldMsi, "/qn", "/norestart"
    )
    $rollbackEntry = Wait-ForInstalledVersion -ExpectedVersion "0.2.3"
    $rollbackExecutable = Resolve-InstalledExecutable `
        -Entry $rollbackEntry `
        -ExpectedNames @("Image Tools.exe", "imagetools.exe")
    Set-LegacyWorkspaceBootstrap -BootstrapPath $legacyBootstrapPath -Workspace $rollbackWorkspace
    Test-AppRuntime `
        -Label "Image Tools 0.2.3 after rollback" `
        -ExecutablePath $rollbackExecutable `
        -DataDirectory $rollbackWorkspace `
        -ConfigDirectory (Join-Path $temporaryRoot "old-config-after-rollback") `
        -BackendBaseline $backendBaseline `
        -AllowLegacyBackend $true `
        -StartedProcesses $startedProcesses
    Invoke-FixtureTool -Operation "verify" -Workspace $rollbackWorkspace -ScriptPath $fixtureScript

    Write-Host "Windows v0.2.3 to v0.3.0 upgrade and rollback verification passed."
}
finally {
    try {
        foreach ($startedProcess in $startedProcesses) {
            Stop-TestProcess -ProcessId $startedProcess.ProcessId -ExecutablePath $startedProcess.ExecutablePath
        }
        if ($installationStarted -and $null -ne $resolvedNewMsi) {
            Invoke-MsiExec -Operation "v0.3.0 cleanup uninstall" -AllowAbsentProduct -Arguments @(
                "/x", $resolvedNewMsi, "/qn", "/norestart"
            )
        }
        if ($installationStarted -and $null -ne $resolvedOldMsi) {
            Invoke-MsiExec -Operation "v0.2.3 cleanup uninstall" -AllowAbsentProduct -Arguments @(
                "/x", $resolvedOldMsi, "/qn", "/norestart"
            )
        }
    }
    finally {
        [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_DATA_DIR", $originalDataDirectory, "Process")
        [System.Environment]::SetEnvironmentVariable("IMAGE_TOOLS_CONFIG_DIR", $originalConfigDirectory, "Process")
        if ($legacyStateOwned) {
            if (Test-Path -LiteralPath $legacyBootstrapPath -PathType Leaf) {
                Remove-Item -LiteralPath $legacyBootstrapPath -Force
            }
            if (Test-Path -LiteralPath $legacyDataDirectory) {
                Remove-Item -LiteralPath $legacyDataDirectory -Recurse -Force
            }
            if (Test-Path -LiteralPath $legacyConfigDirectory) {
                Remove-Item -LiteralPath $legacyConfigDirectory -Recurse -Force
            }
        }
        if ($null -ne $temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
            Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
        }
    }
}
