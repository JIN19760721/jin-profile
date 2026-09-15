# setup_scheduler.ps1
# Register auto-trade task in Windows Task Scheduler
#
# Usage:
#   Dry-run:  powershell -ExecutionPolicy Bypass -File setup_scheduler.ps1
#   Live:     powershell -ExecutionPolicy Bypass -File setup_scheduler.ps1 -Live
#   Remove:   powershell -ExecutionPolicy Bypass -File setup_scheduler.ps1 -Remove
#
param(
    [switch]$Live,
    [switch]$Remove
)

$TaskName  = "KabuAutoTrader"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchFile = Join-Path $ScriptDir "run_trade_auto.bat"
$LogDir    = Join-Path $ScriptDir "logs"

# Remove task
if ($Remove) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "[OK] Task '$TaskName' removed."
    } else {
        Write-Host "[INFO] Task '$TaskName' does not exist."
    }
    exit 0
}

# Check batch file exists
if (-not (Test-Path $BatchFile)) {
    Write-Host "[ERROR] Batch file not found: $BatchFile"
    exit 1
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# Action
$ArgList = if ($Live) { "/c `"$BatchFile`" --live" } else { "/c `"$BatchFile`"" }

$Action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument $ArgList `
    -WorkingDirectory $ScriptDir

# Trigger: weekdays at 07:55
$Trigger = New-ScheduledTaskTrigger `
    -Weekly `
    -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
    -At "07:55"

# Settings
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 9) `
    -RestartCount 0 `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[INFO] Overwriting existing task."
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -RunLevel Highest `
    -Force | Out-Null

$ModeLabel = if ($Live) { "LIVE (real orders)" } else { "DRY-RUN (simulation)" }

Write-Host ""
Write-Host "============================================================"
Write-Host "  Task Scheduler Registration Complete"
Write-Host "============================================================"
Write-Host "  Task     : $TaskName"
Write-Host "  Schedule : Weekdays at 07:55"
Write-Host "  Mode     : $ModeLabel"
Write-Host "  Log      : $LogDir\trade_YYYYMMDD.log"
Write-Host "  Timeout  : 9h (engine self-terminates at 15:20)"
Write-Host ""
Write-Host "  Check  : Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Run now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Remove : .\setup_scheduler.ps1 -Remove"
Write-Host "============================================================"
