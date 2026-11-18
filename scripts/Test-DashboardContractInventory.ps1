$ErrorActionPreference='Stop'
$inventory=Join-Path $PSScriptRoot 'Get-DashboardContractInventory.ps1'
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('zoho-contract-fixture-'+[guid]::NewGuid())
$null=New-Item -ItemType Directory -Path $fixtureRoot
$null=New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'node_modules')
$source=Join-Path $fixtureRoot 'dashboard-routes.ts'
Set-Content -LiteralPath $source -Value 'const credential = "fixture-canary-never-emit"; // Bearer DASHBOARD_SERVICE_BEARER_TOKEN /api/dashboard'
Set-Content -LiteralPath (Join-Path $fixtureRoot '.env') -Value 'TOKEN=fixture-canary-never-emit'
Set-Content -LiteralPath (Join-Path $fixtureRoot 'auth-secrets.ts') -Value 'fixture-canary-never-emit'
Set-Content -LiteralPath (Join-Path $fixtureRoot 'node_modules\dashboard.ts') -Value 'fixture-canary-never-emit'
$before=(Get-FileHash -LiteralPath $source).Hash
$json=& $inventory -SourceRoot $fixtureRoot
if ($json -match 'fixture-canary-never-emit') {throw 'Inventory exposed source contents'}
$result=$json | ConvertFrom-Json
if (@($result.roots).Count -ne 1 -or @($result.roots[0].files).Count -ne 1) {throw 'Inventory exclusions failed'}
if ($result.roots[0].files[0].path -ne 'dashboard-routes.ts') {throw 'Wrong source file inventoried'}
if ($result.roots[0].files[0].markers[0].markers -notcontains 'DASHBOARD_SERVICE_BEARER_TOKEN') {throw 'Missing variable-name evidence'}
if ((Get-FileHash -LiteralPath $source).Hash -ne $before) {throw 'Inventory modified source'}
$missing=& $inventory -SourceRoot (Join-Path $fixtureRoot 'missing') | ConvertFrom-Json
if ($missing.roots[0].exists) {throw 'Missing directory handling failed'}
$bounded=& $inventory -SourceRoot $fixtureRoot -MaxEntries 1 | ConvertFrom-Json
if (-not $bounded.roots[0].truncated) {throw 'Bounded traversal did not report truncation'}
'PASS: inventory markers, exclusions, no source-body disclosure, read-only behavior, missing roots and bounded traversal.'

