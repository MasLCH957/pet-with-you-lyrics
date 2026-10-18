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
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

try {
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $manager = Await-WinRtOperation `
    ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
    ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
  Write-State @{ media = $null; error = 'Windows media session unavailable'; detail = $_.Exception.Message }
  exit 1
}

while ($true) {
  try {
    $session = $manager.GetCurrentSession()
    if ($null -eq $session) {
      Write-State @{ media = $null }
    } else {
      $properties = Await-WinRtOperation `
        ($session.TryGetMediaPropertiesAsync()) `
        ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $playback = $session.GetPlaybackInfo()
      $timeline = $session.GetTimelineProperties()

      Write-State @{
        media = @{
          title = [string]$properties.Title
          artist = [string]$properties.Artist
          album = [string]$properties.AlbumTitle
          playbackStatus = [string]$playback.PlaybackStatus
          positionMs = [double]$timeline.Position.TotalMilliseconds
          startMs = [double]$timeline.StartTime.TotalMilliseconds
          endMs = [double]$timeline.EndTime.TotalMilliseconds
          lastUpdatedAt = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
          sourceApp = [string]$session.SourceAppUserModelId
        }
      }
    }
  } catch {
    Write-State @{ media = $null; error = 'Media property read failed'; detail = $_.Exception.Message }
  }

  Start-Sleep -Milliseconds 750
}
