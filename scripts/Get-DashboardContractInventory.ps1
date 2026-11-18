# Read-only inventory for G11SERVER. Writes JSON only to stdout.
# No network calls, service changes, environment reads, or source-body output.
[CmdletBinding()]
param(
  [string[]]$SourceRoot = @(
    'C:\ZohoAmarco\app',
    'C:\ZohoAmarco\scripts\zohoamarco-public-gateway'
  ),
  [ValidateRange(1, 20000)][int]$MaxEntries = 5000
)
$ErrorActionPreference = 'Stop'
$skip = @('node_modules', '.git', '.pnpm', '.npm', 'logs', 'data', 'backups', 'coverage')
$extensions = @('.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.md', '.ps1')
$marker = '/api/dashboard|dashboard:read|dashboard:operate|DASHBOARD_[A-Z_]+|dashboard-data-routes|requireSession|Bearer'
$results = foreach ($root in $SourceRoot) {
  if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    [pscustomobject]@{ root = $root; exists = $false; files = @() }
    continue
  }
  $resolved = (Resolve-Path -LiteralPath $root).Path
  $queue = [System.Collections.Generic.Queue[string]]::new()
  $queue.Enqueue($resolved)
  $entries = 0
  $files = [System.Collections.Generic.List[object]]::new()
  $unreadableDirectories = 0
  while ($queue.Count -gt 0 -and $entries -lt $MaxEntries) {
    $directory = $queue.Dequeue()
    try { $children = @(Get-ChildItem -LiteralPath $directory -Force) }
    catch { $unreadableDirectories++; continue }
    foreach ($entry in $children) {
      $entries++
      if ($entries -gt $MaxEntries) { break }
      # Do not follow junctions/symlinks into unrelated directories.
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
      if ($entry.PSIsContainer) {
        if ($skip -notcontains $entry.Name) { $queue.Enqueue($entry.FullName) }
        continue
      }
      # Never inspect environment files, credentials, runtime configuration or logs.
      if ($extensions -notcontains $entry.Extension -or
          $entry.Name -match '(?i)(^\.env|secret|credential|token|appsettings|lock|log)') { continue }
      $relative = $entry.FullName.Substring($resolved.Length).TrimStart('\', '/')
      if ($relative -notmatch '(?i)(dashboard|gateway|auth|schema|contract|openapi|(^|[\\/])(app|server|index)\.[cm]?[jt]s$|package\.json$)') { continue }
      $markerHits = @()
      if ($entry.Length -le 2097152 -and $entry.Extension -ne '.json') {
        try {
          $markerHits = @(Select-String -LiteralPath $entry.FullName -Pattern $marker -AllMatches |
            ForEach-Object {
              [pscustomobject]@{
                line = $_.LineNumber
                markers = @($_.Matches | ForEach-Object { $_.Value } | Select-Object -Unique)
              }
            })
        } catch { }
      }
      # Only matched keywords and line numbers are emitted, never source lines.
      $files.Add([pscustomobject]@{
        path = $relative
        bytes = $entry.Length
        sha256 = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
        markers = $markerHits
      })
    }
  }
  $revision = $null
  if ((Test-Path -LiteralPath (Join-Path $resolved '.git')) -and
      (Get-Command git -ErrorAction SilentlyContinue)) {
    $head = & git -C $resolved rev-parse --verify HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $head -match '^[a-f0-9]{40,64}$') { $revision = $head }
  }
  [pscustomobject]@{
    root = $resolved
    exists = $true
    gitRevision = $revision
    truncated = ($queue.Count -gt 0 -or $entries -gt $MaxEntries)
    unreadableDirectories = $unreadableDirectories
    files = @($files.ToArray())
  }
}
[pscustomobject]@{
  generatedAt = [DateTime]::UtcNow.ToString('o')
  computer = [Environment]::MachineName
  roots = @($results)
} | ConvertTo-Json -Depth 8
