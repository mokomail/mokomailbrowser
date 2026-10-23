# Build script for the Android port of MokomailBrowser.
#
# Usage:
#   .\build.ps1                       # release APK (signed with the debug key)
#   .\build.ps1 -Task :app:assembleDebug
#
# Tool paths can be overridden with environment variables:
#   MOKOMAIL_JDK, MOKOMAIL_ANDROID_SDK, MOKOMAIL_GRADLE

param(
    [string]$Jdk = $env:MOKOMAIL_JDK,
    [string]$Sdk = $env:MOKOMAIL_ANDROID_SDK,
    [string]$Gradle = $env:MOKOMAIL_GRADLE,
    [string]$Task = ":app:assembleRelease"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $Jdk) { $Jdk = Join-Path $env:TEMP "opencode\android\jdk\jdk-17.0.20.1+1" }
if (-not $Sdk) { $Sdk = Join-Path $env:TEMP "opencode\android\sdk" }
if (-not $Gradle) { $Gradle = Join-Path $env:TEMP "opencode\android\gradle\gradle-8.7\bin\gradle.bat" }

if (-not (Test-Path $Jdk)) { throw "JDK not found: $Jdk" }
if (-not (Test-Path $Sdk)) { throw "Android SDK not found: $Sdk" }
if (-not (Test-Path $Gradle)) { throw "Gradle not found: $Gradle" }

$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk

Write-Output "JDK:    $Jdk"
Write-Output "SDK:    $Sdk"
Write-Output "Gradle: $Gradle"
Write-Output "Task:   $Task"

& $Gradle --no-daemon -p $here $Task

$apkDir = Join-Path $here "apk"
New-Item -ItemType Directory -Force -Path $apkDir | Out-Null
$release = Join-Path $here "app\build\outputs\apk\release\app-release.apk"
$debug = Join-Path $here "app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $release) { Copy-Item $release (Join-Path $apkDir "MokomailBrowser-release.apk") -Force }
if (Test-Path $debug) { Copy-Item $debug (Join-Path $apkDir "MokomailBrowser-debug.apk") -Force }
Write-Output "Done. APK folder: $apkDir"
