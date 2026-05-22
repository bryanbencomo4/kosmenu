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
          "value": "no-cache"
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
    vercel deploy --prod --yes
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}


