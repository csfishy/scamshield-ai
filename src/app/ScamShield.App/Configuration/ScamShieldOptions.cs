namespace ScamShield.App.Configuration;

public enum AnalysisMode
{
    Mock,
    Remote
}

public sealed record ScamShieldOptions
{
    public required AnalysisMode Mode { get; init; }

    public required Uri ApiBaseUri { get; init; }

    public static ScamShieldOptions FromEnvironment(string defaultApiBaseUrl)
    {
        var rawMode = Environment.GetEnvironmentVariable("SCAMSHIELD_ANALYSIS_MODE")?.Trim();
        var mode = rawMode?.ToLowerInvariant() switch
        {
            null or "" or "mock" => AnalysisMode.Mock,
            "remote" => AnalysisMode.Remote,
            _ => throw new InvalidOperationException(
                "SCAMSHIELD_ANALYSIS_MODE must be either 'Mock' or 'Remote'.")
        };

        var rawBaseUrl = Environment.GetEnvironmentVariable("API_BASE_URL")?.Trim();
        var normalizedBaseUrl = string.IsNullOrWhiteSpace(rawBaseUrl)
            ? defaultApiBaseUrl
            : rawBaseUrl;

        if (!normalizedBaseUrl.EndsWith("/", StringComparison.Ordinal))
        {
            normalizedBaseUrl += "/";
        }

        if (!Uri.TryCreate(normalizedBaseUrl, UriKind.Absolute, out var apiBaseUri))
        {
            throw new InvalidOperationException("API_BASE_URL must be an absolute URL.");
        }

        return new ScamShieldOptions
        {
            Mode = mode,
            ApiBaseUri = apiBaseUri
        };
    }
}
