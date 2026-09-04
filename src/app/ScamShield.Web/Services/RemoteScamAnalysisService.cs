using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using ScamShield.Web.Models;

namespace ScamShield.Web.Services;

public sealed class RemoteScamAnalysisService : IScamAnalysisService
{
    private static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(20);

    private readonly HttpClient _httpClient;
    private readonly TimeSpan _timeout;

    public RemoteScamAnalysisService(HttpClient httpClient)
        : this(httpClient, DefaultTimeout)
    {
    }

    public RemoteScamAnalysisService(HttpClient httpClient, TimeSpan timeout)
    {
        _httpClient = httpClient;
        _timeout = timeout;
    }

    public async Task<ScamAnalysisResult> AnalyzeAsync(
        Stream image,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(image);

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(_timeout);

        try
        {
            using var form = new MultipartFormDataContent();
            using var imageContent = new StreamContent(image);
            imageContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
            form.Add(imageContent, "image", fileName);
            form.Add(new StringContent("screenshot", Encoding.UTF8), "source");
            form.Add(new StringContent("zh-TW", Encoding.UTF8), "language");

            using var response = await _httpClient.PostAsync(
                "analyze",
                form,
                timeoutSource.Token);
            var body = await response.Content.ReadAsStringAsync(timeoutSource.Token);

            if (response.IsSuccessStatusCode)
            {
                try
                {
                    return ContractJson.DeserializeResult(body);
                }
                catch (JsonException exception)
                {
                    throw new ScamAnalysisServiceException(
                        "analysis_failed",
                        "分析服務回傳的資料格式不正確，請稍後再試。",
                        retryable: false,
                        exception);
                }
            }

            throw CreateApiException(response.StatusCode, body);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ScamAnalysisServiceException(
                "provider_unavailable",
                "分析等候時間過長，請檢查網路後再試一次。",
                retryable: true);
        }
        catch (HttpRequestException exception)
        {
            throw new ScamAnalysisServiceException(
                "provider_unavailable",
                "目前無法連線至分析服務，請檢查網路後再試一次。",
                retryable: true,
                exception);
        }
    }

    private static ScamAnalysisServiceException CreateApiException(
        HttpStatusCode statusCode,
        string body)
    {
        try
        {
            var apiError = ContractJson.DeserializeError(body).Error;
            return new ScamAnalysisServiceException(
                apiError.Code,
                apiError.Message,
                apiError.Retryable);
        }
        catch (JsonException exception)
        {
            var fallback = statusCode switch
            {
                HttpStatusCode.RequestEntityTooLarge => (
                    "image_too_large",
                    "圖片大小不可超過 10 MiB。",
                    false),
                HttpStatusCode.UnsupportedMediaType => (
                    "unsupported_image_format",
                    "僅支援 JPEG 或 PNG 圖片。",
                    false),
                HttpStatusCode.TooManyRequests => (
                    "provider_rate_limit",
                    "分析服務目前忙碌中，請稍後再試。",
                    true),
                HttpStatusCode.ServiceUnavailable => (
                    "provider_unavailable",
                    "分析服務暫時無法使用，請稍後再試。",
                    true),
                _ => (
                    "analysis_failed",
                    "目前無法完成分析，請稍後再試。",
                    false)
            };

            return new ScamAnalysisServiceException(
                fallback.Item1,
                fallback.Item2,
                fallback.Item3,
                exception);
        }
    }
}
