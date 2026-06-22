# ============================================================
#  eod_report.ps1 - after-close forward-test report capture.
#  Runs forward_report.js, saves a dated snapshot to reports\, and toasts
#  "results ready" so you know to ask Claude to pull/analyze them.
#  Scheduled weekdays ~16:15 ET (after RTH close + webhook settle).
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'
$dir     = $PSScriptRoot
$repDir  = Join-Path $dir 'reports'
if (-not (Test-Path $repDir)) { New-Item -ItemType Directory -Path $repDir | Out-Null }
$today   = (Get-Date).ToString('yyyy-MM-dd')
$outFile = Join-Path $repDir "report_$today.txt"

# run the report (node must be on PATH)
$report = & node (Join-Path $dir 'forward_report.js') 2>&1 | Out-String
$report | Set-Content $outFile -Encoding ascii

# pull a one-line summary (the PORTFOLIO line if present, else event count)
$summary = ($report -split "`n" | Where-Object { $_ -match 'PORTFOLIO|total events' } | Select-Object -First 1)
if (-not $summary) { $summary = "report saved" }

function Notify([string]$title, [string]$text) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    $tmpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $n = $tmpl.GetElementsByTagName('text')
    $n.Item(0).AppendChild($tmpl.CreateTextNode($title)) | Out-Null
    $n.Item(1).AppendChild($tmpl.CreateTextNode($text))  | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($tmpl)
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  } catch { try { & msg.exe * "$title - $text" } catch {} }
}
Notify "NQ Forward results ready ($today)" ("$($summary.Trim()) - ask Claude to pull them")
