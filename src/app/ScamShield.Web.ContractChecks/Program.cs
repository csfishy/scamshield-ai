using System.Buffers.Binary;
using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using ScamShield.Web.Models;
using ScamShield.Web.Services;

const string mockJson = """
    {
      "riskScore": 88,
      "riskLevel": "high",
      "category": "phishing",
      "summary": "訊息以包裹配送失敗為由，要求立即開啟可疑連結付款",
      "signals": [
        {
          "type": "suspicious_link",
          "severity": "high",
          "reason": "網址與訊息宣稱的物流品牌不一致"
        },
        {
          "type": "urgency_or_threat",
          "severity": "medium",
          "reason": "訊息要求在短時間內完成補繳費用"
        },
        {
          "type": "payment_request",
          "severity": "high",
          "reason": "要求透過訊息內連結支付額外費用"
        }
      ],
      "recommendations": [
        "不要開啟訊息中的連結",
        "不要輸入信用卡或個人資料",
        "直接前往物流公司官方網站查詢包裹"
      ]
    }
    """;

var repositoryRoot = FindRepositoryRoot();
var webRoot = Path.Combine(repositoryRoot, "src", "app", "ScamShield.Web", "wwwroot");
var expectedIcons = new Dictionary<string, int>(StringComparer.Ordinal)
{
    ["apple-touch-icon.png"] = 180,
    ["icon-192.png"] = 192,
    ["icon-512.png"] = 512,
    ["icon-maskable-512.png"] = 512
};

foreach (var (fileName, expectedSize) in expectedIcons)
{
    AssertPngIcon(Path.Combine(webRoot, fileName), expectedSize);
}

using (var manifest = JsonDocument.Parse(
    await File.ReadAllTextAsync(Path.Combine(webRoot, "manifest.webmanifest"))))
{
    var icons = manifest.RootElement.GetProperty("icons").EnumerateArray().ToArray();
    Assert(icons.Length == 3, "Manifest must declare two any icons and one maskable icon.");
    AssertManifestIcon(icons[0], "icon-192.png", "192x192", "any");
    AssertManifestIcon(icons[1], "icon-512.png", "512x512", "any");
    AssertManifestIcon(icons[2], "icon-maskable-512.png", "512x512", "maskable");
}

var indexHtml = await File.ReadAllTextAsync(Path.Combine(webRoot, "index.html"));
Assert(
    indexHtml.Contains(
        "<link rel=\"apple-touch-icon\" sizes=\"180x180\" type=\"image/png\" href=\"apple-touch-icon.png\" />",
        StringComparison.Ordinal),
    "The 180x180 Apple touch icon metadata is missing.");

var publishedWorker = await File.ReadAllTextAsync(
    Path.Combine(webRoot, "service-worker.published.js"));
Assert(
    publishedWorker.Contains("event.request.method === 'GET'", StringComparison.Ordinal),
    "Published service worker must only read from its cache for GET requests.");

Assert(
    ImageFileValidator.DetectContentType("sample.jpg", [0xFF, 0xD8, 0xFF]) == "image/jpeg",
    "JPEG signature validation failed.");
Assert(
    ImageFileValidator.DetectContentType(
        "sample.png",
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) == "image/png",
    "PNG signature validation failed.");
AssertThrows<ImageValidationException>(
    () => ImageFileValidator.DetectContentType("sample.gif", [0x47, 0x49, 0x46]),
    "Unsupported image format was accepted.");
AssertThrows<ImageValidationException>(
    () => ImageFileValidator.EnsureValidSize(0),
    "Empty image was accepted.");
AssertThrows<ImageValidationException>(
    () => ImageFileValidator.EnsureValidSize(ImageFileValidator.MaximumImageSizeBytes + 1),
    "Oversized image was accepted.");

var deserialized = ContractJson.DeserializeResult(mockJson);
Assert(deserialized.RiskScore == 88, "riskScore did not deserialize.");
Assert(deserialized.RiskLevel == RiskLevel.High, "riskLevel did not deserialize.");
Assert(deserialized.Category == ScamCategory.Phishing, "category did not deserialize.");
Assert(deserialized.Signals.Count == 3, "signals did not deserialize.");
Assert(deserialized.Recommendations.Count == 3, "recommendations did not deserialize.");

var serialized = JsonSerializer.Serialize(deserialized, ContractJson.Options);
Assert(serialized.Contains("\"riskScore\":88", StringComparison.Ordinal), "riskScore is not camelCase.");
Assert(serialized.Contains("\"riskLevel\":\"high\"", StringComparison.Ordinal), "riskLevel is not lower snake_case.");
Assert(serialized.Contains("\"urgency_or_threat\"", StringComparison.Ordinal), "signal type is not lower snake_case.");

var stopwatch = Stopwatch.StartNew();
var mockService = new MockScamAnalysisService();
var mockResult = await mockService.AnalyzeAsync(
    new MemoryStream([0xFF, 0xD8, 0xFF]),
    "sample.jpg",
    "image/jpeg");
stopwatch.Stop();
Assert(mockResult.RiskScore == 88, "Mock service returned an unexpected result.");
Assert(stopwatch.ElapsedMilliseconds >= 500, "Mock service did not expose a visible loading delay.");

var successHandler = new StubHttpMessageHandler(async request =>
{
    Assert(request.Method == HttpMethod.Post, "Remote service did not use POST.");
    Assert(request.RequestUri?.AbsolutePath == "/analyze", "Remote service used the wrong endpoint.");
    Assert(request.Content is MultipartFormDataContent, "Remote service did not use multipart/form-data.");

    var parts = ((MultipartFormDataContent)request.Content!).ToList();
    Assert(parts.Count == 3, "Remote request must contain exactly three fields.");
    Assert(GetPartName(parts[0]) == "image", "image field is missing.");
    Assert(GetPartName(parts[1]) == "source", "source field is missing.");
    Assert(GetPartName(parts[2]) == "language", "language field is missing.");
    Assert(await parts[1].ReadAsStringAsync() == "screenshot", "source must be screenshot.");
    Assert(await parts[2].ReadAsStringAsync() == "zh-TW", "language must be zh-TW.");

    return JsonResponse(HttpStatusCode.OK, mockJson);
});
var remoteService = new RemoteScamAnalysisService(
    new HttpClient(successHandler) { BaseAddress = new Uri("https://example.test/") },
    TimeSpan.FromSeconds(2));
var remoteResult = await remoteService.AnalyzeAsync(
    new MemoryStream([0x89, 0x50, 0x4E, 0x47]),
    "sample.png",
    "image/png");
Assert(remoteResult.RiskLevel == RiskLevel.High, "Remote result did not deserialize.");

const string errorJson = """
    {
      "error": {
        "code": "provider_unavailable",
        "message": "Analysis service is temporarily unavailable.",
        "retryable": true
      }
    }
    """;
var errorService = new RemoteScamAnalysisService(
    new HttpClient(new StubHttpMessageHandler(_ =>
        Task.FromResult(JsonResponse(HttpStatusCode.ServiceUnavailable, errorJson))))
    {
        BaseAddress = new Uri("https://example.test/")
    },
    TimeSpan.FromSeconds(2));

try
{
    await errorService.AnalyzeAsync(
        new MemoryStream([0x89, 0x50, 0x4E, 0x47]),
        "sample.png",
        "image/png");
    throw new InvalidOperationException("Remote error response was not surfaced.");
}
catch (ScamAnalysisServiceException exception)
{
    Assert(exception.Code == "provider_unavailable", "API error code was not preserved.");
    Assert(exception.Retryable, "API retryable flag was not preserved.");
}

var timeoutService = new RemoteScamAnalysisService(
    new HttpClient(new TimeoutHttpMessageHandler())
    {
        BaseAddress = new Uri("https://example.test/")
    },
    TimeSpan.FromMilliseconds(20));

try
{
    await timeoutService.AnalyzeAsync(
        new MemoryStream([0xFF, 0xD8, 0xFF]),
        "sample.jpg",
        "image/jpeg");
    throw new InvalidOperationException("Remote timeout was not surfaced.");
}
catch (ScamAnalysisServiceException exception)
{
    Assert(exception.Code == "provider_unavailable", "Timeout used the wrong error code.");
    Assert(exception.Retryable, "Timeout must be retryable.");
}

try
{
    ContractJson.DeserializeResult(mockJson.Replace("\"high\"", "\"critical\"", StringComparison.Ordinal));
    throw new InvalidOperationException("Unknown enum value was accepted.");
}
catch (JsonException)
{
}

Console.WriteLine(
    "Contract and PWA checks passed: icons, manifest, Apple metadata, JSON, image validation, mock delay, multipart request, API errors, and timeout.");

static string FindRepositoryRoot()
{
    foreach (var startingPath in new[] { Environment.CurrentDirectory, AppContext.BaseDirectory })
    {
        for (var directory = new DirectoryInfo(startingPath); directory is not null; directory = directory.Parent)
        {
            var webRoot = Path.Combine(directory.FullName, "src", "app", "ScamShield.Web", "wwwroot");
            if (Directory.Exists(webRoot))
            {
                return directory.FullName;
            }
        }
    }

    throw new DirectoryNotFoundException("Could not locate the repository root.");
}

static void AssertManifestIcon(JsonElement icon, string src, string sizes, string purpose)
{
    Assert(icon.GetProperty("src").GetString() == src, $"Manifest is missing {src}.");
    Assert(icon.GetProperty("type").GetString() == "image/png", $"{src} must be PNG.");
    Assert(icon.GetProperty("sizes").GetString() == sizes, $"{src} has the wrong size.");
    Assert(icon.GetProperty("purpose").GetString() == purpose, $"{src} has the wrong purpose.");
}

static void AssertPngIcon(string path, int expectedSize)
{
    var bytes = File.ReadAllBytes(path);
    ReadOnlySpan<byte> pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    Assert(bytes.AsSpan(0, 8).SequenceEqual(pngSignature), $"{path} is not a PNG file.");
    Assert(Encoding.ASCII.GetString(bytes, 12, 4) == "IHDR", $"{path} has no IHDR chunk.");
    Assert(BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4)) == (uint)expectedSize, $"{path} has the wrong width.");
    Assert(BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4)) == (uint)expectedSize, $"{path} has the wrong height.");
    Assert(bytes[25] == 2, $"{path} must use opaque RGB pixels without alpha.");

    var hasSrgbProfile = false;
    for (var offset = 8; offset + 12 <= bytes.Length;)
    {
        var length = checked((int)BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4)));
        var type = Encoding.ASCII.GetString(bytes, offset + 4, 4);
        hasSrgbProfile |= type is "sRGB" or "iCCP";
        offset = checked(offset + length + 12);
    }

    Assert(hasSrgbProfile, $"{path} must declare sRGB colour data.");
}

static string? GetPartName(HttpContent content)
{
    return content.Headers.ContentDisposition?.Name?.Trim('"');
}

static HttpResponseMessage JsonResponse(HttpStatusCode statusCode, string json)
{
    return new HttpResponseMessage(statusCode)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };
}

static void Assert(bool condition, string message)
{
    if (!condition)
    {
        throw new InvalidOperationException(message);
    }
}

static void AssertThrows<TException>(Action action, string message)
    where TException : Exception
{
    try
    {
        action();
    }
    catch (TException)
    {
        return;
    }

    throw new InvalidOperationException(message);
}

file sealed class StubHttpMessageHandler(
    Func<HttpRequestMessage, Task<HttpResponseMessage>> handler) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        return handler(request);
    }
}

file sealed class TimeoutHttpMessageHandler : HttpMessageHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
        throw new InvalidOperationException("The infinite delay completed unexpectedly.");
    }
}
