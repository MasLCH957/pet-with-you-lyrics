param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('previous', 'next', 'toggle')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  } |
  Select-Object -First 1)

function Await-WinRtOperation($Operation, [Type]$ResultType) {
  $task = $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Write-State($Value) {
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress -Depth 3))
  [Console]::Out.Flush()
}

try {
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $manager = Await-WinRtOperation `
    ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
    ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $session = $manager.GetCurrentSession()
} catch {
  Write-State @{ ok = $false; action = $Action; message = 'Windows media session unavailable' }
  exit 1
}

if ($null -eq $session) {
  Write-State @{ ok = $false; action = $Action; message = 'No active media session' }
  exit 1
}

try {
  $operation = switch ($Action) {
    'previous' { $session.TrySkipPreviousAsync() }
    'next' { $session.TrySkipNextAsync() }
    'toggle' { $session.TryTogglePlayPauseAsync() }
  }
  $accepted = Await-WinRtOperation $operation ([Boolean])
  $playbackStatus = [string]$session.GetPlaybackInfo().PlaybackStatus
  if (-not $accepted) {
    Write-State @{ ok = $false; action = $Action; playbackStatus = $playbackStatus; message = 'Player rejected the command' }
    exit 2
  }
  Write-State @{ ok = $true; action = $Action; playbackStatus = $playbackStatus }
} catch {
  Write-State @{ ok = $false; action = $Action; message = 'Media control failed' }
  exit 1
}
