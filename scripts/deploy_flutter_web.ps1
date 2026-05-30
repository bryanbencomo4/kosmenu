$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$buildOutput = Join-Path $repoRoot 'build\web'
$vercelConfigPath = Join-Path $buildOutput 'vercel.json'

$vercelConfig = @'
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
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
      "source": "/main.dart.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ]
}
'@

Push-Location $repoRoot
try {
  $flutter = Join-Path $repoRoot '.fvm\versions\stable\bin\flutter.bat'
  if (-not (Test-Path $flutter)) {
    $flutter = 'flutter'
  }

  & $flutter build web --release
  Set-Content -Path $vercelConfigPath -Value $vercelConfig -Encoding ascii

  Push-Location $buildOutput
  try {
    vercel deploy --prod --yes --force
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}


