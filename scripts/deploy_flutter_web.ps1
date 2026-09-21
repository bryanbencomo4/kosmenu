$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$buildOutput = Join-Path $repoRoot 'build\web'
$vercelConfigPath = Join-Path $buildOutput 'vercel.json'
$siteEnvPath = Join-Path $repoRoot 'site\.env.local'

function Read-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )
  if (-not (Test-Path $Path)) {
    return $null
  }
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

$vercelConfig = @'
{
  "rewrites": [
    {
      "source": "/((?!assets/|canvaskit/|icons/|main\\.dart\\.js|flutter[^/]*\\.js|manifest\\.json|version\\.json|favicon\\.png|merchant-presence\\.html|.*\\.(?:png|jpg|jpeg|svg|webp|wasm|otf|ttf|woff2?)$).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/merchant-presence.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        },
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors https://elmenuxfa.com http://localhost:3000 http://127.0.0.1:3000"
        },
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow"
        }
      ]
    },
    {
      "source": "/flutter_service_worker.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/flutter_bootstrap.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/flutter.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/main.dart.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    {
      "source": "/canvaskit/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
'@

Push-Location $repoRoot
try {
  $flutterCandidates = @(
    (Join-Path $repoRoot '.fvm\versions\3.41.6\bin\flutter.bat'),
    (Join-Path $env:USERPROFILE 'fvm\versions\3.41.6\bin\flutter.bat'),
    (Join-Path $repoRoot '.fvm\flutter_sdk\bin\flutter.bat')
  )
  $flutter = $flutterCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $flutter) {
    throw 'Flutter 3.41.6 not found via FVM. Run `fvm use 3.41.6` in the repo. Do not use a global PATH flutter.'
  }

  Write-Host "Building Flutter web with dart-defines (API_BASE_URL=$apiBaseUrl, SUPABASE_URL=$supabaseUrl) using $flutter"

  & $flutter build web --release --no-wasm-dry-run `
    "--dart-define=API_BASE_URL=$apiBaseUrl" `
    "--dart-define=SUPABASE_URL=$supabaseUrl" `
    "--dart-define=SUPABASE_ANON_KEY=$supabaseAnonKey"

  if ($LASTEXITCODE -ne 0) {
    throw "flutter build web failed with exit code $LASTEXITCODE"
  }

  # Guardrail: production Supabase ref must be present in the compiled bundle.
  $mainJs = Join-Path $buildOutput 'main.dart.js'
  $mainJsText = Get-Content -Raw -Path $mainJs
  if ($mainJsText -notmatch [regex]::Escape('qqhberaayhohxlbbhdyi')) {
    throw 'Build guard failed: production Supabase project ref missing from main.dart.js (dart-defines not applied?)'
  }
  if ($mainJsText -match 'service_role') {
    throw 'Build guard failed: service_role leaked into main.dart.js'
  }

  Set-Content -Path $vercelConfigPath -Value $vercelConfig -Encoding ascii

  Push-Location $buildOutput
  try {
    npx vercel deploy --prod --yes --force
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}
