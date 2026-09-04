using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.Json;
using ScamShield.App.Models;
using ScamShield.App.Services;

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

try
{
    ContractJson.DeserializeResult(mockJson.Replace("\"high\"", "\"critical\"", StringComparison.Ordinal));
    throw new InvalidOperationException("Unknown enum value was accepted.");
}
catch (JsonException)
{
}

Console.WriteLine("Contract checks passed: JSON, mock delay, multipart request, and API errors.");

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
