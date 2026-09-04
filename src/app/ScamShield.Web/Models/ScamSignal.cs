using System.Text.Json.Serialization;

namespace ScamShield.Web.Models;

public enum SignalType
{
    SuspiciousLink,
    OffPlatformContact,
    CredentialRequest,
    PaymentRequest,
    UrgencyOrThreat,
    GuaranteedReturn,
    ImpersonationClaim,
    InconsistentIdentity,
    Other
}

public enum SignalSeverity
{
    Low,
    Medium,
    High
}

public sealed record ScamSignal
{
    [JsonPropertyName("type")]
    public required SignalType Type { get; init; }

    [JsonPropertyName("severity")]
    public required SignalSeverity Severity { get; init; }

    [JsonPropertyName("reason")]
    public required string Reason { get; init; }
}
