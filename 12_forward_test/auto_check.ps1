# ============================================================
#  auto_check.ps1 - hands-free forward-test watchdog.
#  Runs every 15 min during RTH (via Task Scheduler). It:
#    1. confirms the logger (localhost:8787) + public ngrok tunnel are reachable
#    2. watches events.csv for the FIRST live signal of the day
#    3. pops a Windows notification once for: first signal, OR a health problem
#    4. appends a heartbeat to auto_check.log and writes STATUS.txt
#  Notifies at most once per condition per day (state in auto_check_state.json).
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'
$dir       = $PSScriptRoot
$eventsCsv = Join-Path $dir 'events.csv'
$logFile   = Join-Path $dir 'auto_check.log'
$statusTxt = Join-Path $dir 'STATUS.txt'
$stateFile = Join-Path $dir 'auto_check_state.json'
$domainTxt = Join-Path $dir 'ngrok_domain.txt'

$now    = Get-Date
$today  = $now.ToString('yyyy-MM-dd')
$domain = (Get-Content $domainTxt -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()

# ---- notification helper: native Win toast, fallback to msg.exe ----
function Notify([string]$title, [string]$text) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $tmpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $nodes = $tmpl.GetElementsByTagName('text')
    $nodes.Item(0).AppendChild($tmpl.CreateTextNode($title)) | Out-Null
    $nodes.Item(1).AppendChild($tmpl.CreateTextNode($text))  | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($tmpl)
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  } catch {
    try { & msg.exe * "$title - $text" } catch {}
  }
}

# ---- load / reset daily state ----
$state = $null
if (Test-Path $stateFile) { $state = Get-Content $stateFile -Raw | ConvertFrom-Json }
if (-not $state -or $state.date -ne $today) {
  $state = [pscustomobject]@{ date = $today; notifiedSignal = $false; notifiedHealth = $false }
}

# ---- health checks ----
$loggerOk = $false; $tunnelOk = $false
try { $loggerOk = (Invoke-RestMethod "http://localhost:8787/status" -TimeoutSec 6).ok -eq $true } catch {}
if ($domain) {
  try { $tunnelOk = (Invoke-RestMethod "https://$domain/status" -Headers @{'ngrok-skip-browser-warning'='1'} -TimeoutSec 10).ok -eq $true } catch {}
}

# ---- count live signals today (data rows beyond header) ----
$rows = @(); $signalsToday = 0
if (Test-Path $eventsCsv) {
  $rows = @(Get-Content $eventsCsv | Where-Object { $_.Trim() -ne '' } | Select-Object -Skip 1)
  $signalsToday = @($rows | Where-Object { $_ -like "$today*" -or $_ -like "*$today*" }).Count
}

# ---- act: first live signal ----
if ($signalsToday -gt 0 -and -not $state.notifiedSignal) {
  Notify "NQ Forward Test: LIVE" "First signal logged today ($signalsToday so far). Chain is working."
  $state.notifiedSignal = $true
}

# ---- act: health problem during RTH (only after 09:35 ET grace) ----
$afterGrace = $now.TimeOfDay -gt ([TimeSpan]'09:35:00')
if ($afterGrace -and (-not $loggerOk -or -not $tunnelOk) -and -not $state.notifiedHealth) {
  $what = @(); if (-not $loggerOk) { $what += 'logger DOWN' }; if (-not $tunnelOk) { $what += 'tunnel DOWN' }
  Notify "NQ Forward Test: PROBLEM" ("$($what -join ', ') during RTH. Run 'Start Forward Test (stable)'.")
  $state.notifiedHealth = $true
}

# ---- persist state + heartbeat + status ----
$state | ConvertTo-Json | Set-Content $stateFile -Encoding ascii
$line = "{0}  logger={1} tunnel={2} signals_today={3}" -f $now.ToString('yyyy-MM-dd HH:mm:ss'), $loggerOk, $tunnelOk, $signalsToday
Add-Content $logFile $line
@(
  "NQ Forward-Test status  (updated $($now.ToString('yyyy-MM-dd HH:mm:ss')) ET)"
  "  logger reachable : $loggerOk"
  "  tunnel reachable : $tunnelOk   (https://$domain)"
  "  signals today    : $signalsToday"
) | Set-Content $statusTxt -Encoding ascii
