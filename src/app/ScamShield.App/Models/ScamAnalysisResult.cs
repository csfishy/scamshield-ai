using System.Text.Json.Serialization;

namespace ScamShield.App.Models;

public enum RiskLevel
{
    Low,
    Medium,
    High
}

public enum ScamCategory
{
    None,
    Phishing,
    FakeCustomerService,
    InvestmentScam,
    Impersonation,
    AccountTheft,
    Other,
    Unknown
}

public sealed record ScamAnalysisResult
{
    [JsonPropertyName("riskScore")]
    public required int RiskScore { get; init; }

    [JsonPropertyName("riskLevel")]
    public required RiskLevel RiskLevel { get; init; }

    [JsonPropertyName("category")]
    public required ScamCategory Category { get; init; }

    [JsonPropertyName("summary")]
    public required string Summary { get; init; }

    [JsonPropertyName("signals")]
    public required List<ScamSignal> Signals { get; init; }

    [JsonPropertyName("recommendations")]
    public required List<string> Recommendations { get; init; }
}
