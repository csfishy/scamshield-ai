using ScamShield.Web.Models;

namespace ScamShield.Web.Services;

public interface IScamAnalysisService
{
    Task<ScamAnalysisResult> AnalyzeAsync(
        Stream image,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default);
}
