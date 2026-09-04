using ScamShield.App.Models;

namespace ScamShield.App.Services;

public sealed class MockScamAnalysisService : IScamAnalysisService
{
    private static readonly TimeSpan DemoDelay = TimeSpan.FromMilliseconds(800);

    public async Task<ScamAnalysisResult> AnalyzeAsync(
        Stream image,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(image);

        if (!image.CanRead)
        {
            throw new ArgumentException("The image stream must be readable.", nameof(image));
        }

        await Task.Delay(DemoDelay, cancellationToken);

        return new ScamAnalysisResult
        {
            RiskScore = 88,
            RiskLevel = RiskLevel.High,
            Category = ScamCategory.Phishing,
            Summary = "訊息以包裹配送失敗為由，要求立即開啟可疑連結付款",
            Signals =
            [
                new ScamSignal
                {
                    Type = SignalType.SuspiciousLink,
                    Severity = SignalSeverity.High,
                    Reason = "網址與訊息宣稱的物流品牌不一致"
                },
                new ScamSignal
                {
                    Type = SignalType.UrgencyOrThreat,
                    Severity = SignalSeverity.Medium,
                    Reason = "訊息要求在短時間內完成補繳費用"
                },
                new ScamSignal
                {
                    Type = SignalType.PaymentRequest,
                    Severity = SignalSeverity.High,
                    Reason = "要求透過訊息內連結支付額外費用"
                }
            ],
            Recommendations =
            [
                "不要開啟訊息中的連結",
                "不要輸入信用卡或個人資料",
                "直接前往物流公司官方網站查詢包裹"
            ]
        };
    }
}
