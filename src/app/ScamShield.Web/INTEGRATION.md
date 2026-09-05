# ScamShield Web / PWA Integration Notes

> **Legacy implementation guide — 2026-09-04.** This file describes the existing
> .NET 10 Blazor client and its v1 behavior (including the 10 MiB client limit).
> The target architecture is now Next.js + TypeScript + Vercel, but that migration
> has not been implemented. Use the [SDD](../../../docs/sdd.md),
> [API contract v2](../../../docs/api-contract.md), and
> [deployment runbook](../../../docs/deployment-runbook.md) for new development.
> These instructions remain valid only for the current Blazor source; the current
> `vercel.json` and `wwwroot/appsettings.json` have not been migrated.

## Runtime and installation

ScamShield Web is a standalone .NET 10 Blazor WebAssembly PWA. It runs entirely
in a browser and can be installed to a supported mobile device's home screen.
The published service worker caches the application shell for offline startup;
live Remote analysis still requires network access. Mock mode remains available
for an offline demo.

## Mode and API URL

Edit `wwwroot/appsettings.json` before publishing:

```json
{
  "ScamShield": {
    "AnalysisMode": "Remote",
    "ApiBaseUrl": "https://your-scamshield-api.example/"
  }
}
```

`AnalysisMode` accepts only `Mock` or `Remote`. The default is visibly labelled
Mock / Demo Mode. A Remote failure never silently falls back to Mock data.

The API URL is public client configuration, not a secret. Never place an AI
provider key, Backend credential, or other secret in the PWA bundle.

## Remote request

`RemoteScamAnalysisService` sends `POST /analyze` as `multipart/form-data` with
exactly these fields:

```text
image=<one JPEG or PNG file>
source=screenshot
language=zh-TW
```

It deserializes the original v1 success and error schemas (available in Git
history before the Next.js documentation migration). The current
`docs/api-contract.md` describes target v2 and is not fully implemented by this
client. The UI displays Backend `riskLevel` directly and never
derives a different level from `riskScore`.

## Browser networking and CORS

- The Backend must allow the deployed PWA origin through CORS, including `POST`
  and `Content-Type` for the multipart request.
- A phone browser resolves `localhost` to the phone, not the development PC.
  Use an HTTPS host name or a LAN address reachable by the phone.
- A production PWA and API should both use HTTPS. An HTTPS page cannot call an
  HTTP API because browsers block mixed content.
- The browser sends the selected image only when the user explicitly starts an
  analysis. The PWA does not persist the image to local storage.

## Development

```bash
dotnet run --project src/app/ScamShield.Web/ScamShield.Web.csproj
```

Then open the HTTPS launch URL shown by `dotnet run`. PWA installation and the
production offline service worker should be validated from published output:

```bash
dotnet publish src/app/ScamShield.Web/ScamShield.Web.csproj -c Release
```

## Vercel static deployment

The root `vercel.json` is intended for a Vercel project whose Root Directory
remains the repository root. It installs the .NET 10 SDK in Vercel's Amazon
Linux build image, runs the Release publish command above, and serves this
verified static output directory:

```text
src/app/ScamShield.Web/bin/Release/net10.0/publish/wwwroot
```

Vercel checks for a real static file before applying the SPA fallback. Existing
files such as `/_framework/*`, CSS, icons, the manifest, and service-worker
assets are therefore served directly; an unknown client route is rewritten to
`/index.html` so browser refresh continues through Blazor routing.

The checked-in configuration remains in Mock mode and does not require a
Backend URL. To enable Remote mode later, set `AnalysisMode` and the public
`ApiBaseUrl` in `wwwroot/appsettings.json` before the static publish step. A
standalone static WebAssembly app doesn't automatically read Vercel runtime
environment variables in the browser, so any environment-driven value must be
materialized into this public JSON file during the build. Never place secrets
in it; the Backend must keep provider credentials and allow the deployed Vercel
origin through CORS.

## Contract checks

```bash
dotnet run --project src/app/ScamShield.Web.ContractChecks/ScamShield.Web.ContractChecks.csproj
```

The checks cover JSON naming/enums, Mock loading, JPEG/PNG signatures, size
limits, multipart fields, success deserialization, API errors, and timeout.
