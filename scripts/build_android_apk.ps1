$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$siteEnvPath = Join-Path $repoRoot 'site\.env.local'

function Read-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content -Path $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    if ($trimmed -notmatch "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") { continue }
    $raw = $Matches[1].Trim()
    if (
      ($raw.StartsWith('"') -and $raw.EndsWith('"')) -or
      ($raw.StartsWith("'") -and $raw.EndsWith("'"))
    ) {
      return $raw.Substring(1, $raw.Length - 2)
    }
    return $raw
  }
  return $null
}

$apiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL.Trim() } else { 'https://elmenuxfa.com' }
$supabaseUrl = if ($env:SUPABASE_URL) { $env:SUPABASE_URL.Trim() } else { Read-DotEnvValue $siteEnvPath 'NEXT_PUBLIC_SUPABASE_URL' }
$supabaseAnonKey = if ($env:SUPABASE_ANON_KEY) { $env:SUPABASE_ANON_KEY.Trim() } else { Read-DotEnvValue $siteEnvPath 'NEXT_PUBLIC_SUPABASE_ANON_KEY' }

if ([string]::IsNullOrWhiteSpace($supabaseUrl) -or $supabaseUrl -notmatch '^https://') {
  throw 'Missing SUPABASE_URL (env) or NEXT_PUBLIC_SUPABASE_URL in site/.env.local'
}
if ([string]::IsNullOrWhiteSpace($supabaseAnonKey) -or -not $supabaseAnonKey.StartsWith('eyJ')) {
  throw 'Missing SUPABASE_ANON_KEY (env) or NEXT_PUBLIC_SUPABASE_ANON_KEY in site/.env.local'
}

Push-Location $repoRoot
try {
  Write-Host "Building Android APK with dart-defines (API_BASE_URL=$apiBaseUrl, SUPABASE_URL=$supabaseUrl)"
  fvm flutter build apk --release --target-platform android-arm64 `
    "--dart-define=API_BASE_URL=$apiBaseUrl" `
    "--dart-define=SUPABASE_URL=$supabaseUrl" `
    "--dart-define=SUPABASE_ANON_KEY=$supabaseAnonKey"
  if ($LASTEXITCODE -ne 0) {
    throw "flutter build apk failed with exit code $LASTEXITCODE"
  }
  $apk = Join-Path $repoRoot 'build\app\outputs\flutter-apk\app-release.apk'
  Write-Host "Built $apk ($([math]::Round((Get-Item $apk).Length / 1MB, 2)) MB)"
}
finally {
  Pop-Location
}
