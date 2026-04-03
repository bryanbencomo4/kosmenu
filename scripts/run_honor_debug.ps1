param(
	[string]$DeviceId = '',
	[switch]$Clean
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$sdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:PATH = "$env:JAVA_HOME\bin;$sdkRoot\platform-tools;$sdkRoot\cmdline-tools\latest\bin;$env:PATH"

if (-not $DeviceId) {
	$firstDevice = adb devices |
		Select-String 'device$' |
		ForEach-Object { ($_ -split "`t")[0].Trim() } |
		Select-Object -First 1

	if (-not $firstDevice) {
		throw 'No se encontro ningun dispositivo Android conectado.'
	}

	$DeviceId = $firstDevice
}

if ($Clean) {
	Push-Location android
	./gradlew clean
	Pop-Location
}

adb -s $DeviceId logcat -c | Out-Null

$logcatCommand = @(
	"adb -s $DeviceId logcat -v color ",
	'flutter:I Flutter:I Choreographer:W AndroidRuntime:E ',
	'*:S'
) -join ''

Start-Process powershell -ArgumentList @(
	'-NoExit',
	'-Command',
	$logcatCommand
) | Out-Null

fvm flutter run -d $DeviceId
