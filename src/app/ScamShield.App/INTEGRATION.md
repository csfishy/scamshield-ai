# ScamShield App Integration Notes

## Default mode

The App starts in `Mock` mode so the complete image → loading → result flow works
without a Backend. The current mode is always visible on the main screen; remote
failures never silently fall back to Mock data.

Set these values in the App process environment before launch to switch modes:

```text
SCAMSHIELD_ANALYSIS_MODE=Remote
API_BASE_URL=https://your-scamshield-api.example/
```

`SCAMSHIELD_ANALYSIS_MODE` accepts only `Mock` or `Remote`. `API_BASE_URL` is not a
secret and must not contain provider credentials.

## Remote request

`RemoteScamAnalysisService` sends `POST /analyze` as `multipart/form-data` with
exactly these fields:

```text
image=<one JPEG or PNG file>
source=screenshot
language=zh-TW
```

It deserializes the frozen `ScamAnalysisResult` and error envelope from
`docs/api-contract.md`. The App displays the returned `riskLevel` and does not
derive it again from `riskScore`.

## Local networking

- Android Emulator treats `localhost` as the emulator itself. The development
  fallback is therefore `http://10.0.2.2:5000`.
- An Android physical device needs a Backend address reachable from the same
  network, such as an explicit LAN address.
- iOS Simulator can normally reach a host service through `localhost`; an iOS
  device needs a reachable LAN or HTTPS address.
- The Android manifest permits cleartext traffic only for the local hackathon
  fallback. Use HTTPS and disable cleartext traffic before any production build.
- Never assume one address works for emulator, device, and hosted environments.

## Contract check

The dependency-free check project validates JSON naming/enums, Mock loading,
JPEG/PNG signatures, size limits, multipart fields, success deserialization, and
API error handling:

```bash
dotnet run --project src/app/ScamShield.App.ContractChecks/ScamShield.App.ContractChecks.csproj
```

The MAUI project itself requires the .NET MAUI workload and an Android SDK. iOS
build and signing require a compatible Mac/Xcode environment.
