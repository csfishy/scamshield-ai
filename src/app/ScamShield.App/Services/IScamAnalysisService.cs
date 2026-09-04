using ScamShield.App.Models;

namespace ScamShield.App.Services;

public interface IScamAnalysisService
{
    Task<ScamAnalysisResult> AnalyzeAsync(
        Stream image,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default);
}
