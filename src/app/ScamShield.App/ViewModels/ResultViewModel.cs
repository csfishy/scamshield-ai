using ScamShield.App.Models;

namespace ScamShield.App.ViewModels;

public sealed class ResultViewModel
{
    public ResultViewModel(ScamAnalysisResult result)
    {
        RiskScoreDisplay = $"{result.RiskScore} / 100";
        RiskLevelDisplay = result.RiskLevel switch
        {
            RiskLevel.High => "高風險",
            RiskLevel.Medium => "中度風險",
            RiskLevel.Low => "低風險",
            _ => result.RiskLevel.ToString()
        };
        RiskColor = result.RiskLevel switch
        {
            RiskLevel.High => Color.FromArgb("#B42318"),
            RiskLevel.Medium => Color.FromArgb("#B54708"),
            _ => Color.FromArgb("#067647")
        };
        CategoryDisplay = result.Category switch
        {
            ScamCategory.None => "未發現明確類型",
            ScamCategory.Phishing => "網路釣魚",
            ScamCategory.FakeCustomerService => "假客服／假物流",
            ScamCategory.InvestmentScam => "投資詐騙",
            ScamCategory.Impersonation => "冒充身分",
            ScamCategory.AccountTheft => "帳號竊取",
            ScamCategory.Other => "其他詐騙風險",
            ScamCategory.Unknown => "證據不足",
            _ => result.Category.ToString()
        };
        Summary = result.Summary;
        Signals = result.Signals
            .Select(signal => new SignalDisplayItem(signal))
            .ToList();
        Recommendations = result.Recommendations;
    }

    public string RiskScoreDisplay { get; }

    public string RiskLevelDisplay { get; }

    public Color RiskColor { get; }

    public string CategoryDisplay { get; }

    public string Summary { get; }

    public IReadOnlyList<SignalDisplayItem> Signals { get; }

    public IReadOnlyList<string> Recommendations { get; }
}

public sealed class SignalDisplayItem
{
    public SignalDisplayItem(ScamSignal signal)
    {
        Reason = signal.Reason;
        SeverityDisplay = signal.Severity switch
        {
            SignalSeverity.High => "高",
            SignalSeverity.Medium => "中",
            SignalSeverity.Low => "低",
            _ => signal.Severity.ToString()
        };
        SeverityColor = signal.Severity switch
        {
            SignalSeverity.High => Color.FromArgb("#B42318"),
            SignalSeverity.Medium => Color.FromArgb("#B54708"),
            _ => Color.FromArgb("#067647")
        };
    }

    public string Reason { get; }

    public string SeverityDisplay { get; }

    public Color SeverityColor { get; }
}
