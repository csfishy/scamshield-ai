namespace ScamShield.Web.Services;

public sealed class ScamAnalysisServiceException : Exception
{
    public ScamAnalysisServiceException(
        string code,
        string message,
        bool retryable,
        Exception? innerException = null)
        : base(message, innerException)
    {
        Code = code;
        Retryable = retryable;
    }

    public string Code { get; }

    public bool Retryable { get; }
}
