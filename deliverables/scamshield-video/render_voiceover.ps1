param(
    [string]$Voice = "Microsoft Zira Desktop",
    [int]$Rate = 1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$work = Join-Path $root "work"
$voiceDir = Join-Path $work "voice"
New-Item -ItemType Directory -Path $voiceDir -Force | Out-Null

$segments = Get-Content -LiteralPath (Join-Path $root "voiceover.json") -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$synth.Volume = 100

try {
    for ($index = 0; $index -lt $segments.Count; $index++) {
        $path = Join-Path $voiceDir ("voice-{0:D2}.wav" -f $index)
        $synth.SetOutputToWaveFile($path)
        $synth.Speak([string]$segments[$index].text)
        $synth.SetOutputToNull()
        Write-Output $path
    }
}
finally {
    $synth.Dispose()
}
