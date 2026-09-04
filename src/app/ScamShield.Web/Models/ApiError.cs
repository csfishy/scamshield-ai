using System.Text.Json.Serialization;

namespace ScamShield.Web.Models;

public sealed record ApiErrorEnvelope
{
    [JsonPropertyName("error")]
    public required ApiError Error { get; init; }
}

public sealed record ApiError
{
    [JsonPropertyName("code")]
    public required string Code { get; init; }

    [JsonPropertyName("message")]
    public required string Message { get; init; }

    [JsonPropertyName("retryable")]
    public required bool Retryable { get; init; }
}
