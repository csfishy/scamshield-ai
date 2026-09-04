using Microsoft.Extensions.Configuration;

namespace ScamShield.Web.Configuration;

public enum AnalysisMode
{
    Mock,
    Remote
}

public sealed record ScamShieldOptions
{
    public required AnalysisMode Mode { get; init; }

    public required Uri ApiBaseUri { get; init; }

    public static ScamShieldOptions FromConfiguration(
        IConfiguration configuration,
        Uri appBaseUri)
    {
        var rawMode = configuration["ScamShield:AnalysisMode"]?.Trim();
        var mode = rawMode?.ToLowerInvariant() switch
        {
            null or "" or "mock" => AnalysisMode.Mock,
            "remote" => AnalysisMode.Remote,
            _ => throw new InvalidOperationException(
                "ScamShield:AnalysisMode must be either 'Mock' or 'Remote'.")
        };

        var rawBaseUrl = configuration["ScamShield:ApiBaseUrl"]?.Trim();
        var apiBaseUri = string.IsNullOrWhiteSpace(rawBaseUrl)
            ? appBaseUri
            : Uri.TryCreate(EnsureTrailingSlash(rawBaseUrl), UriKind.Absolute, out var configuredUri)
                ? configuredUri
                : throw new InvalidOperationException(
                    "ScamShield:ApiBaseUrl must be an absolute URL.");

        return new ScamShieldOptions
        {
            Mode = mode,
            ApiBaseUri = apiBaseUri
        };
    }

    private static string EnsureTrailingSlash(string value)
    {
        return value.EndsWith("/", StringComparison.Ordinal) ? value : value + "/";
    }
}
