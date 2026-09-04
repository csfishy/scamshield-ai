using System.Text.Json;
using System.Text.Json.Serialization;

namespace ScamShield.App.Models;

public static class ContractJson
{
    public static JsonSerializerOptions Options { get; } = CreateOptions();

    public static ScamAnalysisResult DeserializeResult(string json)
    {
        var result = JsonSerializer.Deserialize<ScamAnalysisResult>(json, Options)
            ?? throw new JsonException("The API returned an empty analysis result.");

        Validate(result);
        return result;
    }

    public static ApiErrorEnvelope DeserializeError(string json)
    {
        var envelope = JsonSerializer.Deserialize<ApiErrorEnvelope>(json, Options)
            ?? throw new JsonException("The API returned an empty error response.");

        if (envelope.Error is null
            || string.IsNullOrWhiteSpace(envelope.Error.Code)
            || string.IsNullOrWhiteSpace(envelope.Error.Message))
        {
            throw new JsonException("The API error response does not match the contract.");
        }

        return envelope;
    }

    public static void Validate(ScamAnalysisResult result)
    {
        if (result.RiskScore is < 0 or > 100)
        {
            throw new JsonException("riskScore must be between 0 and 100.");
        }

        if (string.IsNullOrWhiteSpace(result.Summary))
        {
            throw new JsonException("summary must not be empty.");
        }

        if (result.Signals is null || result.Signals.Any(signal =>
                signal is null || string.IsNullOrWhiteSpace(signal.Reason)))
        {
            throw new JsonException("signals must contain valid, non-null items.");
        }

        if (result.Recommendations is null
            || result.Recommendations.Count is < 1 or > 5
            || result.Recommendations.Any(string.IsNullOrWhiteSpace))
        {
            throw new JsonException(
                "recommendations must contain between one and five non-empty items.");
        }
    }

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            PropertyNameCaseInsensitive = false,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            NumberHandling = JsonNumberHandling.Strict
        };

        options.Converters.Add(
            new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false));

        return options;
    }
}
