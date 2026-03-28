$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$sdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:PATH = "$env:JAVA_HOME\bin;$sdkRoot\platform-tools;$sdkRoot\cmdline-tools\latest\bin;$env:PATH"

Push-Location android
./gradlew clean
Pop-Location

fvm flutter run -d A76XUT5423002846
