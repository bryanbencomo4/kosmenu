$ErrorActionPreference = 'Stop'

# Daily dump of production (kosmenú / qqhberaayhohxlbbhdyi).
# Restore drill (do this on PREVIEW, never on prod):
#   1. Create or reset preview project gsfxqzvmyzjjgpigrste
#   2. npx supabase db execute --project-ref gsfxqzvmyzjjgpigrste -f backups/prod-STAMP/schema.sql
#   3. npx supabase db execute --project-ref gsfxqzvmyzjjgpigrste -f backups/prod-STAMP/data.sql
#   4. Confirm a known comercio slug loads in preview and Auth users can sign in
# Keep at least the last 7 dumps locally; Supabase Pro also retains PITR.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $repoRoot "backups\prod-$stamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $repoRoot
try {
  npx --yes supabase db dump --linked -f (Join-Path $outDir 'data.sql')
  npx --yes supabase db dump --linked --schema-only -f (Join-Path $outDir 'schema.sql')
  Write-Host "Backup written to $outDir"
  Get-ChildItem $outDir | ForEach-Object { "{0} {1} bytes" -f $_.Name, $_.Length }
}
finally {
  Pop-Location
}
