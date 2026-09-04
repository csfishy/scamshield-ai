# ScamShield Web / PWA Integration Notes

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

It deserializes the frozen success and error schemas from
`docs/api-contract.md`. The UI displays Backend `riskLevel` directly and never
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

## Contract checks

```bash
dotnet run --project src/app/ScamShield.Web.ContractChecks/ScamShield.Web.ContractChecks.csproj
```

The checks cover JSON naming/enums, Mock loading, JPEG/PNG signatures, size
limits, multipart fields, success deserialization, API errors, and timeout.
